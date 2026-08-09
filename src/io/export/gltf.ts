import type { SerializedMesh, TriangleMeshSnapshot } from "@octopoly/contracts";
import { toTriangleMesh } from "./mesh";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function bytesToBase64(bytes: Uint8Array): string {
  const encode = globalThis.btoa;
  if (typeof encode !== "function") throw new Error("Base64 encoding is not available");
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return encode(text);
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

interface EncodedGltf {
  readonly json: Record<string, unknown>;
  readonly binary: Uint8Array;
}

function encodeMesh(
  source: TriangleMeshSnapshot | SerializedMesh,
  metersPerProjectUnit: number,
): EncodedGltf {
  if (!Number.isFinite(metersPerProjectUnit) || metersPerProjectUnit <= 0) {
    throw new RangeError("metersPerProjectUnit must be finite and greater than zero");
  }
  const mesh = toTriangleMesh(source);
  const positionBytes = mesh.positions.length * 12;
  const normalOffset = mesh.normals ? positionBytes : undefined;
  const indexOffset = align4(positionBytes + (mesh.normals ? mesh.normals.length * 12 : 0));
  const binary = new Uint8Array(indexOffset + mesh.indices.length * 4);
  const view = new DataView(binary.buffer);
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  mesh.positions.forEach((position, index) => {
    const values = [position.x * metersPerProjectUnit, position.y * metersPerProjectUnit, position.z * metersPerProjectUnit];
    values.forEach((value, component) => {
      view.setFloat32(index * 12 + component * 4, value, true);
      minimum[component] = Math.min(minimum[component]!, value);
      maximum[component] = Math.max(maximum[component]!, value);
    });
  });
  if (mesh.normals && normalOffset !== undefined) {
    mesh.normals.forEach((normal, index) => {
      view.setFloat32(normalOffset + index * 12, normal.x, true);
      view.setFloat32(normalOffset + index * 12 + 4, normal.y, true);
      view.setFloat32(normalOffset + index * 12 + 8, normal.z, true);
    });
  }
  mesh.indices.forEach((index, item) => view.setUint32(indexOffset + item * 4, index, true));

  const bufferViews: Array<Record<string, unknown>> = [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes, target: 34962 },
  ];
  const accessors: Array<Record<string, unknown>> = [
    { bufferView: 0, componentType: 5126, count: mesh.positions.length, type: "VEC3", min: minimum, max: maximum },
  ];
  const attributes: Record<string, number> = { POSITION: 0 };
  if (mesh.normals && normalOffset !== undefined) {
    bufferViews.push({ buffer: 0, byteOffset: normalOffset, byteLength: mesh.normals.length * 12, target: 34962 });
    accessors.push({ bufferView: 1, componentType: 5126, count: mesh.normals.length, type: "VEC3" });
    attributes.NORMAL = 1;
  }
  const indexView = bufferViews.length;
  const indexAccessor = accessors.length;
  bufferViews.push({ buffer: 0, byteOffset: indexOffset, byteLength: mesh.indices.length * 4, target: 34963 });
  accessors.push({ bufferView: indexView, componentType: 5125, count: mesh.indices.length, type: "SCALAR" });
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "OctoPoly" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors,
    meshes: [{ primitives: [{ attributes, indices: indexAccessor, mode: 4 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  return { json, binary };
}

export function exportGltf(
  source: TriangleMeshSnapshot | SerializedMesh,
  metersPerProjectUnit = 1,
): string {
  const encoded = encodeMesh(source, metersPerProjectUnit);
  (encoded.json.buffers as Array<Record<string, unknown>>)[0]!.uri =
    `data:application/octet-stream;base64,${bytesToBase64(encoded.binary)}`;
  return JSON.stringify(encoded.json);
}

export function exportGlb(
  source: TriangleMeshSnapshot | SerializedMesh,
  metersPerProjectUnit = 1,
): ArrayBuffer {
  const encoded = encodeMesh(source, metersPerProjectUnit);
  const jsonRaw = new TextEncoder().encode(JSON.stringify(encoded.json));
  const jsonLength = align4(jsonRaw.length);
  const binaryLength = align4(encoded.binary.length);
  const output = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(jsonRaw, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, BIN_CHUNK, true);
  output.set(encoded.binary, binaryHeader + 8);
  return output.buffer;
}
