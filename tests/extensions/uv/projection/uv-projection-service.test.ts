import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  MeshSnapshot,
  Vec3,
} from "@octopoly/contracts";
import { createUvProjectionService } from "../../../../src/extensions/uv/projection";

const emptyAttributes: AttributeSnapshot = Object.freeze({
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
});

function triangleMesh(positions: readonly [Vec3, Vec3, Vec3]): MeshSnapshot {
  return {
    version: 1,
    vertices: positions.map((position, index) => ({ id: index + 1, position })),
    edges: [
      { id: 11, vertices: [1, 2] },
      { id: 12, vertices: [2, 3] },
      { id: 13, vertices: [3, 1] },
    ],
    corners: [
      { id: 101, face: 20, vertex: 1, edge: 11 },
      { id: 102, face: 20, vertex: 2, edge: 12 },
      { id: 103, face: 20, vertex: 3, edge: 13 },
    ],
    faces: [{ id: 20, corners: [101, 102, 103] }],
    attributes: emptyAttributes,
  };
}

function disconnectedTriangles(): MeshSnapshot {
  return {
    version: 2,
    vertices: [
      { id: 1, position: { x: 0, y: 0, z: 0 } },
      { id: 2, position: { x: 2, y: 0, z: 0 } },
      { id: 3, position: { x: 0, y: 3, z: 0 } },
      { id: 4, position: { x: 5, y: 0, z: 0 } },
      { id: 5, position: { x: 6, y: 0, z: 0 } },
      { id: 6, position: { x: 5, y: 1, z: 0 } },
    ],
    edges: [
      { id: 11, vertices: [1, 2] },
      { id: 12, vertices: [2, 3] },
      { id: 13, vertices: [3, 1] },
      { id: 14, vertices: [4, 5] },
      { id: 15, vertices: [5, 6] },
      { id: 16, vertices: [6, 4] },
    ],
    corners: [
      { id: 101, face: 20, vertex: 1, edge: 11 },
      { id: 102, face: 20, vertex: 2, edge: 12 },
      { id: 103, face: 20, vertex: 3, edge: 13 },
      { id: 201, face: 30, vertex: 4, edge: 14 },
      { id: 202, face: 30, vertex: 5, edge: 15 },
      { id: 203, face: 30, vertex: 6, edge: 16 },
    ],
    faces: [
      { id: 30, corners: [201, 202, 203] },
      { id: 20, corners: [101, 102, 103] },
    ],
    attributes: emptyAttributes,
  };
}

describe("UvProjectionService planar projection", () => {
  it("projects a known XY fixture through a stable basis", () => {
    const mesh = triangleMesh([
      { x: 0, y: 0, z: 7 },
      { x: 2, y: 0, z: 7 },
      { x: 0, y: 3, z: 7 },
    ]);

    const projected = createUvProjectionService().planar(mesh, { x: 0, y: 0, z: 1 });

    expect([...projected]).toEqual([
      [101, { x: 0, y: 0 }],
      [102, { x: 2, y: 0 }],
      [103, { x: 0, y: 3 }],
    ]);
  });

  it("normalizes a finite direction and projects an axis-aligned YZ fixture", () => {
    const mesh = triangleMesh([
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 2, z: 0 },
      { x: 5, y: 0, z: 4 },
    ]);

    const projected = createUvProjectionService().planar(mesh, { x: 9, y: 0, z: 0 });

    expect([...projected.values()]).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 4 },
    ]);
  });

  it("limits output to canonical face ids without depending on request order or duplicates", () => {
    const service = createUvProjectionService();
    const mesh = disconnectedTriangles();

    expect([...service.planar(mesh, { x: 0, y: 0, z: 1 }, [30, 30]).keys()]).toEqual([201, 202, 203]);
    expect(service.planar(mesh, { x: 0, y: 0, z: 1 }, []).size).toBe(0);
    expect(service.planar(mesh, { x: 0, y: 0, z: 1 }, [999]).size).toBe(0);
  });

  it("is deterministic across snapshot storage order and returns immutable finite values", () => {
    const service = createUvProjectionService();
    const mesh = disconnectedTriangles();
    const reordered: MeshSnapshot = {
      ...mesh,
      vertices: [...mesh.vertices].reverse(),
      edges: [...mesh.edges].reverse(),
      corners: [...mesh.corners].reverse(),
      faces: [...mesh.faces].reverse(),
    };

    const first = service.planar(mesh, { x: 1, y: 1, z: 1 });
    const second = service.planar(reordered, { x: 1, y: 1, z: 1 });

    expect([...second]).toEqual([...first]);
    expect([...first.values()].every((value) => (
      value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y)
    ))).toBe(true);
    expect([...first.values()].every((value) => Object.isFrozen(value))).toBe(true);
    expect(() => (first as Map<number, unknown>).set(999, { x: 0, y: 0 })).toThrow(TypeError);
  });
});

describe("UvProjectionService box projection", () => {
  it("uses the dominant positive Z face orientation", () => {
    const mesh = triangleMesh([
      { x: 0, y: 0, z: 2 },
      { x: 2, y: 0, z: 2 },
      { x: 0, y: 3, z: 2 },
    ]);

    expect([...createUvProjectionService().box(mesh)]).toEqual([
      [101, { x: 0, y: 0 }],
      [102, { x: 2, y: 0 }],
      [103, { x: 0, y: 3 }],
    ]);
  });

  it("uses a deterministic outward orientation for a positive X face", () => {
    const mesh = triangleMesh([
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 0, z: 2 },
    ]);

    expect([...createUvProjectionService().box(mesh).values()]).toEqual([
      { x: -0, y: 0 },
      { x: -0, y: 1 },
      { x: -2, y: 0 },
    ]);
  });

  it("keeps box maps finite and stable across snapshot storage order", () => {
    const service = createUvProjectionService();
    const mesh = disconnectedTriangles();
    const reordered: MeshSnapshot = {
      ...mesh,
      vertices: [...mesh.vertices].reverse(),
      edges: [...mesh.edges].reverse(),
      corners: [...mesh.corners].reverse(),
      faces: [...mesh.faces].reverse(),
    };

    const first = service.box(mesh);
    expect([...service.box(reordered)]).toEqual([...first]);
    expect([...first.values()].every((value) => (
      value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y)
    ))).toBe(true);
  });
});

describe("UvProjectionService invalid and degenerate inputs", () => {
  it("returns no partial projection for empty, degenerate, non-finite, or inconsistent topology", () => {
    const service = createUvProjectionService();
    const empty: MeshSnapshot = {
      version: 0,
      vertices: [],
      edges: [],
      corners: [],
      faces: [],
      attributes: emptyAttributes,
    };
    const degenerate = triangleMesh([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
    const nonFinite: MeshSnapshot = {
      ...triangleMesh([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ]),
      vertices: [
        { id: 1, position: { x: Number.NaN, y: 0, z: 0 } },
        { id: 2, position: { x: 1, y: 0, z: 0 } },
        { id: 3, position: { x: 0, y: 1, z: 0 } },
      ],
    };
    const missingVertex: MeshSnapshot = {
      ...triangleMesh([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ]),
      vertices: [
        { id: 1, position: { x: 0, y: 0, z: 0 } },
        { id: 2, position: { x: 1, y: 0, z: 0 } },
      ],
    };

    for (const invalid of [empty, degenerate, nonFinite, missingVertex]) {
      expect(service.planar(invalid, { x: 0, y: 0, z: 1 }).size).toBe(0);
      expect(service.box(invalid).size).toBe(0);
    }
  });

  it("rejects invalid projection directions before reading mesh state", () => {
    const service = createUvProjectionService();
    const mesh = triangleMesh([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]);

    expect(() => service.planar(mesh, { x: 0, y: 0, z: 0 })).toThrow(RangeError);
    expect(() => service.planar(mesh, { x: Number.NaN, y: 0, z: 1 })).toThrow(RangeError);
  });
});
