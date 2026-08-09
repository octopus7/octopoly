import { describe, expect, it } from "vitest";
import type { SerializedMesh, TriangleMeshSnapshot } from "@octopoly/contracts";
import { importObj } from "../../../src/io/import";
import { exportObj, toTriangleMesh } from "../../../src/io/export";

const triangle: TriangleMeshSnapshot = {
  version: 0,
  positions: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
  indices: [0, 1, 2],
};

describe("mesh exports", () => {
  it("round-trips OBJ positions and indices within the format boundary", () => {
    const restored = importObj(exportObj(triangle, 10), 0.1);
    expect(restored.positions).toEqual(triangle.positions);
    expect(restored.indices).toEqual(triangle.indices);
  });

  it("triangulates SerializedMesh faces using canonical corners", () => {
    const mesh: SerializedMesh = {
      version: 4,
      vertices: [
        { id: 10, position: { x: 0, y: 0, z: 0 } },
        { id: 20, position: { x: 1, y: 0, z: 0 } },
        { id: 30, position: { x: 1, y: 1, z: 0 } },
        { id: 40, position: { x: 0, y: 1, z: 0 } },
      ],
      edges: [
        { id: 101, vertices: [10, 20] },
        { id: 102, vertices: [20, 30] },
        { id: 103, vertices: [30, 40] },
        { id: 104, vertices: [40, 10] },
      ],
      corners: [
        { id: 1, face: 8, vertex: 10, edge: 101 },
        { id: 2, face: 8, vertex: 20, edge: 102 },
        { id: 3, face: 8, vertex: 30, edge: 103 },
        { id: 4, face: 8, vertex: 40, edge: 104 },
      ],
      faces: [{ id: 8, corners: [1, 2, 3, 4] }],
      attributes: [],
    };
    expect(toTriangleMesh(mesh).indices).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("rejects malformed indices before producing output", () => {
    expect(() => exportObj({ ...triangle, indices: [0, 1, 9] })).toThrow(/out of range/u);
  });
});
