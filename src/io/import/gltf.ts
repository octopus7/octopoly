import type { TriangleMeshSnapshot, Vec3 } from "@octopoly/contracts";

type JsonObject = Record<string, unknown>;

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("The import was aborted", "AbortError");
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${label} must be a non-negative integer`);
  return value as number;
}

function decodeBase64(value: string): Uint8Array {
  const decode = globalThis.atob;
  if (typeof decode !== "function") throw new Error("Base64 decoding is not available");
  const text = decode(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

function decodeDataUri(uri: string): Uint8Array {
  const match = /^data:.*?;base64,(.*)$/su.exec(uri);
  if (!match) throw new TypeError("Only embedded base64 glTF buffers are supported");
  return decodeBase64(match[1]!);
}

function parseGlb(bytes: Uint8Array): { json: JsonObject; binary?: Uint8Array } {
  if (bytes.byteLength < 20) throw new TypeError("GLB header is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new TypeError("Invalid GLB magic");
  if (view.getUint32(4, true) !== 2) throw new TypeError("Only GLB version 2 is supported");
  const total = view.getUint32(8, true);
  if (total !== bytes.byteLength) throw new TypeError("GLB declared length does not match input");
  let offset = 12;
  let json: JsonObject | undefined;
  let binary: Uint8Array | undefined;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new TypeError("GLB chunk header is truncated");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > bytes.byteLength) throw new TypeError("GLB chunk is truncated");
    const chunk = bytes.subarray(offset, offset + length);
    if (type === JSON_CHUNK && json === undefined) {
      const text = new TextDecoder().decode(chunk).replace(/\u0000+$/u, "").trimEnd();
      json = object(JSON.parse(text), "glTF root");
    } else if (type === JSON_CHUNK) {
      throw new TypeError("GLB contains multiple JSON chunks");
    } else if (type === BIN_CHUNK && binary === undefined) {
      binary = chunk.slice();
    } else if (type === BIN_CHUNK) {
      throw new TypeError("GLB contains multiple binary chunks");
    }
    offset += length;
  }
  if (!json) throw new TypeError("GLB has no JSON chunk");
  return binary ? { json, binary } : { json };
}

function typedComponent(
  view: DataView,
  offset: number,
  componentType: number,
): number {
  switch (componentType) {
    case 5121: return view.getUint8(offset);
    case 5123: return view.getUint16(offset, true);
    case 5125: return view.getUint32(offset, true);
    case 5126: return view.getFloat32(offset, true);
    default: throw new TypeError(`Unsupported glTF component type ${componentType}`);
  }
}

function componentBytes(componentType: number): number {
  switch (componentType) {
    case 5121: return 1;
    case 5123: return 2;
    case 5125:
    case 5126: return 4;
    default: throw new TypeError(`Unsupported glTF component type ${componentType}`);
  }
}

function accessorValues(
  root: JsonObject,
  buffers: ReadonlyArray<Uint8Array>,
  accessorIndex: number,
  expectedType: "SCALAR" | "VEC3",
): number[] {
  const accessors = array(root.accessors, "glTF accessors");
  const accessor = object(accessors[accessorIndex], `glTF accessor ${accessorIndex}`);
  if (accessor.type !== expectedType) throw new TypeError(`glTF accessor ${accessorIndex} must be ${expectedType}`);
  if (accessor.sparse !== undefined) throw new TypeError("Sparse glTF accessors are not supported");
  const componentType = integer(accessor.componentType, "glTF accessor componentType");
  if (expectedType === "VEC3" && componentType !== 5126) throw new TypeError("POSITION and NORMAL must use FLOAT components");
  if (expectedType === "SCALAR" && ![5121, 5123, 5125].includes(componentType)) {
    throw new TypeError("glTF indices must use an unsigned integer component type");
  }
  const count = integer(accessor.count, "glTF accessor count");
  const bufferViews = array(root.bufferViews, "glTF bufferViews");
  const viewIndex = integer(accessor.bufferView, "glTF accessor bufferView");
  const descriptor = object(bufferViews[viewIndex], `glTF bufferView ${viewIndex}`);
  const bufferIndex = integer(descriptor.buffer, "glTF bufferView buffer");
  const buffer = buffers[bufferIndex];
  if (!buffer) throw new RangeError(`Missing glTF buffer ${bufferIndex}`);
  const width = expectedType === "SCALAR" ? 1 : 3;
  const bytes = componentBytes(componentType);
  const stride = descriptor.byteStride === undefined ? bytes * width : integer(descriptor.byteStride, "glTF byteStride");
  if (stride < bytes * width) throw new TypeError("glTF byteStride is too small");
  const base = integer(descriptor.byteOffset ?? 0, "glTF bufferView byteOffset")
    + integer(accessor.byteOffset ?? 0, "glTF accessor byteOffset");
  const declaredLength = integer(descriptor.byteLength, "glTF bufferView byteLength");
  if (base + (count === 0 ? 0 : (count - 1) * stride + bytes * width) > buffer.byteLength
    || base + (count === 0 ? 0 : (count - 1) * stride + bytes * width)
      > integer(descriptor.byteOffset ?? 0, "glTF bufferView byteOffset") + declaredLength) {
    throw new RangeError("glTF accessor exceeds its buffer view");
  }
  const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const values: number[] = [];
  for (let item = 0; item < count; item += 1) {
    for (let component = 0; component < width; component += 1) {
      const value = typedComponent(data, base + item * stride + component * bytes, componentType);
      if (!Number.isFinite(value)) throw new TypeError("glTF geometry contains a non-finite value");
      values.push(value);
    }
  }
  return values;
}

function loadBuffers(root: JsonObject, binary: Uint8Array | undefined): Uint8Array[] {
  return array(root.buffers, "glTF buffers").map((entry, index) => {
    const descriptor = object(entry, `glTF buffer ${index}`);
    let bytes: Uint8Array;
    if (descriptor.uri === undefined && index === 0 && binary) bytes = binary;
    else if (typeof descriptor.uri === "string") bytes = decodeDataUri(descriptor.uri);
    else throw new TypeError(`glTF buffer ${index} has no supported source`);
    const length = integer(descriptor.byteLength, "glTF buffer byteLength");
    if (bytes.byteLength < length) throw new TypeError(`glTF buffer ${index} is truncated`);
    return bytes;
  });
}

/** Import the first triangle primitive from embedded glTF 2.0 JSON or GLB. */
export function importGltf(
  source: string | ArrayBuffer | Uint8Array,
  projectUnitsPerMeter = 1,
  signal?: AbortSignal,
): TriangleMeshSnapshot {
  throwIfAborted(signal);
  if (!Number.isFinite(projectUnitsPerMeter) || projectUnitsPerMeter <= 0) {
    throw new RangeError("projectUnitsPerMeter must be finite and greater than zero");
  }
  let root: JsonObject;
  let binary: Uint8Array | undefined;
  if (typeof source === "string") root = object(JSON.parse(source), "glTF root");
  else {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    if (bytes.byteLength >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === GLB_MAGIC) {
      ({ json: root, binary } = parseGlb(bytes));
    } else root = object(JSON.parse(new TextDecoder().decode(bytes)), "glTF root");
  }
  const asset = object(root.asset, "glTF asset");
  if (asset.version !== "2.0") throw new TypeError("Only glTF 2.0 is supported");
  if (root.nodes !== undefined) {
    for (const [index, entry] of array(root.nodes, "glTF nodes").entries()) {
      const node = object(entry, `glTF node ${index}`);
      if (node.matrix !== undefined || node.translation !== undefined || node.rotation !== undefined
        || node.scale !== undefined || node.children !== undefined) {
        throw new TypeError("Transformed or hierarchical glTF nodes are not supported by this leaf importer");
      }
    }
  }
  const buffers = loadBuffers(root, binary);
  const meshes = array(root.meshes, "glTF meshes");
  if (meshes.length !== 1) throw new TypeError("Exactly one glTF mesh is supported");
  const mesh = object(meshes[0], "glTF mesh 0");
  const primitives = array(mesh.primitives, "glTF primitives");
  if (primitives.length !== 1) throw new TypeError("Exactly one glTF primitive is supported");
  const primitive = object(primitives[0], "glTF primitive 0");
  if (primitive.mode !== undefined && primitive.mode !== 4) throw new TypeError("Only glTF TRIANGLES primitives are supported");
  const attributes = object(primitive.attributes, "glTF primitive attributes");
  const positionAccessor = integer(attributes.POSITION, "glTF POSITION accessor");
  const positionValues = accessorValues(root, buffers, positionAccessor, "VEC3");
  const positions: Vec3[] = [];
  for (let index = 0; index < positionValues.length; index += 3) {
    positions.push(Object.freeze({
      x: positionValues[index]! * projectUnitsPerMeter,
      y: positionValues[index + 1]! * projectUnitsPerMeter,
      z: positionValues[index + 2]! * projectUnitsPerMeter,
    }));
  }
  let indices: number[];
  if (primitive.indices === undefined) indices = positions.map((_, index) => index);
  else indices = accessorValues(root, buffers, integer(primitive.indices, "glTF index accessor"), "SCALAR");
  if (indices.length === 0 || indices.length % 3 !== 0) throw new TypeError("glTF indices must be a non-empty triangle list");
  for (const index of indices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= positions.length) {
      throw new RangeError("glTF index is out of range");
    }
  }
  throwIfAborted(signal);

  const normalAccessor = attributes.NORMAL;
  if (normalAccessor === undefined) {
    return Object.freeze({ version: 0, positions: Object.freeze(positions), indices: Object.freeze(indices) });
  }
  const normalValues = accessorValues(root, buffers, integer(normalAccessor, "glTF NORMAL accessor"), "VEC3");
  if (normalValues.length !== positions.length * 3) throw new TypeError("glTF NORMAL count must match POSITION count");
  const normals: Vec3[] = [];
  for (let index = 0; index < normalValues.length; index += 3) {
    const x = normalValues[index]!;
    const y = normalValues[index + 1]!;
    const z = normalValues[index + 2]!;
    const length = Math.hypot(x, y, z);
    if (length === 0) throw new TypeError("glTF normals must not be zero length");
    normals.push(Object.freeze({ x: x / length, y: y / length, z: z / length }));
  }
  return Object.freeze({
    version: 0,
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    indices: Object.freeze(indices),
  });
}
