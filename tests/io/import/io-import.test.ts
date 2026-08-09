import { describe, expect, it } from "vitest";
import { importGltf, importObj } from "../../../src/io/import";
import { exportGlb, exportGltf } from "../../../src/io/export";

const triangle = {
  version: 7,
  positions: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ],
  normals: [
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ],
  indices: [0, 1, 2],
} as const;

describe("mesh imports", () => {
  it("normalizes OBJ positions, negative indices, and normals", () => {
    const result = importObj([
      "v 0 0 0",
      "v 2 0 0",
      "v 0 2 0",
      "vn 0 0 2",
      "f -3//1 -2//1 -1//1",
    ].join("\n"), 0.5);

    expect(result.positions).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]);
    expect(result.normals).toEqual(Array(3).fill({ x: 0, y: 0, z: 1 }));
    expect(result.indices).toEqual([0, 1, 2]);
  });

  it("imports exported embedded glTF and GLB with unit conversion", () => {
    const gltf = importGltf(exportGltf(triangle, 2), 0.5);
    const glb = importGltf(exportGlb(triangle, 2), 0.5);
    expect(gltf.positions).toEqual(triangle.positions);
    expect(glb.positions).toEqual(triangle.positions);
    expect(gltf.indices).toEqual(triangle.indices);
    expect(glb.indices).toEqual(triangle.indices);
    expect(gltf.normals).toEqual(triangle.normals);
  });

  it("rejects malformed, non-finite, unsupported, and cancelled input atomically", () => {
    expect(() => importObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 4")).toThrow(/out of range/u);
    expect(() => importObj("v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3")).toThrow(/finite/u);
    expect(() => importGltf(JSON.stringify({ asset: { version: "1.0" }, buffers: [], meshes: [] }))).toThrow(/2\.0/u);
    const controller = new AbortController();
    controller.abort();
    expect(() => importObj("v 0 0 0", 1, controller.signal)).toThrow(expect.objectContaining({ name: "AbortError" }));
    expect(() => importGltf("{}", 1, controller.signal)).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});
