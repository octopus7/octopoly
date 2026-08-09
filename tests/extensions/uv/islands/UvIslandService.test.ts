import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  EdgeId,
  MeshQuery,
  MeshSnapshot,
  Vec2,
  VertexId,
} from "@octopoly/contracts";

import { UV0_ATTRIBUTE, UV0_SEAM_ATTRIBUTE } from "../../../../src/extensions/uv/data/attributes";
import { UvIslandService } from "../../../../src/extensions/uv/islands/UvIslandService";

class TestAttributes implements AttributeSnapshot {
  constructor(private readonly values: ReadonlyMap<string, ReadonlyMap<number, AttributeValue>>) {}

  has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return this.values.has(`${key.domain}:${key.name}`);
  }

  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    return this.values.get(`${key.domain}:${key.name}`)?.get(elementId) as T | undefined;
  }
}

class TestMeshQuery implements MeshQuery {
  constructor(private readonly value: MeshSnapshot) {}

  snapshot(): MeshSnapshot {
    return this.value;
  }

  vertex(id: number) {
    return this.value.vertices.find((vertex) => vertex.id === id) ?? null;
  }

  edge(id: number) {
    return this.value.edges.find((edge) => edge.id === id) ?? null;
  }

  corner(id: number) {
    return this.value.corners.find((corner) => corner.id === id) ?? null;
  }

  face(id: number) {
    return this.value.faces.find((face) => face.id === id) ?? null;
  }

  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId> {
    return this.value.edges.filter((edge) => edge.vertices.includes(vertex)).map((edge) => edge.id);
  }

  incidentFaces(vertex: VertexId): ReadonlyArray<number> {
    const corners = new Set(this.value.corners.filter((corner) => corner.vertex === vertex).map((corner) => corner.face));
    return [...corners];
  }

  adjacentFaces(edge: EdgeId): ReadonlyArray<number> {
    return [...new Set(this.value.corners.filter((corner) => corner.edge === edge).map((corner) => corner.face))];
  }

  findEdge(a: VertexId, b: VertexId): EdgeId | null {
    return this.value.edges.find((edge) => edge.vertices.includes(a) && edge.vertices.includes(b))?.id ?? null;
  }
}

function twoTriangles(
  uv: ReadonlyMap<number, Vec2>,
  seams: ReadonlyMap<number, boolean> = new Map(),
): TestMeshQuery {
  const attributes = new Map<string, ReadonlyMap<number, AttributeValue>>([
    ["corner:uv0", uv],
    ["corner:uv0.seam", seams],
  ]);
  return new TestMeshQuery({
    version: 1,
    vertices: [
      { id: 0, position: { x: 0, y: 0, z: 0 } },
      { id: 1, position: { x: 1, y: 0, z: 0 } },
      { id: 2, position: { x: 0, y: 1, z: 0 } },
      { id: 3, position: { x: 1, y: 1, z: 0 } },
    ],
    edges: [
      { id: 0, vertices: [0, 1] },
      { id: 1, vertices: [1, 2] },
      { id: 2, vertices: [0, 2] },
      { id: 3, vertices: [1, 3] },
      { id: 4, vertices: [2, 3] },
    ],
    corners: [
      { id: 0, face: 0, vertex: 0, edge: 0 },
      { id: 1, face: 0, vertex: 1, edge: 1 },
      { id: 2, face: 0, vertex: 2, edge: 2 },
      { id: 3, face: 1, vertex: 2, edge: 1 },
      { id: 4, face: 1, vertex: 1, edge: 3 },
      { id: 5, face: 1, vertex: 3, edge: 4 },
    ],
    faces: [
      { id: 0, corners: [0, 1, 2] },
      { id: 1, corners: [3, 4, 5] },
    ],
    attributes: new TestAttributes(attributes),
  });
}

function continuousUv(): Map<number, Vec2> {
  return new Map([
    [0, { x: 0, y: 0 }],
    [1, { x: 1, y: 0 }],
    [2, { x: 0, y: 1 }],
    [3, { x: 0, y: 1 }],
    [4, { x: 1, y: 0 }],
    [5, { x: 1, y: 1 }],
  ]);
}

describe("UvIslandService", () => {
  it("joins adjacent faces only when both shared-edge endpoint UVs are continuous", () => {
    const service = new UvIslandService();
    const continuous = twoTriangles(continuousUv());

    expect(service.findIslands(continuous)).toEqual([
      { faces: [0, 1], corners: [0, 1, 2, 3, 4, 5] },
    ]);
    expect(service.splitCandidates(continuous)).toEqual([
      { edge: 1, faces: [0, 1], cornerPairs: [[1, 4], [2, 3]] },
    ]);
    expect(service.weldCandidates(continuous)).toEqual([]);

    const discontinuousValues = continuousUv();
    discontinuousValues.set(3, { x: 0, y: 2 });
    discontinuousValues.set(4, { x: 2, y: 0 });
    const discontinuous = twoTriangles(discontinuousValues);

    expect(service.findIslands(discontinuous).map((island) => island.faces)).toEqual([[0], [1]]);
    expect(service.splitCandidates(discontinuous)).toEqual([]);
    expect(service.weldCandidates(discontinuous)).toEqual([
      { edge: 1, faces: [0, 1], cornerPairs: [[1, 4], [2, 3]] },
    ]);
  });

  it("uses the discontinuity as truth and ignores the seam authoring hint", () => {
    const service = new UvIslandService();
    const mesh = twoTriangles(continuousUv(), new Map([
      [1, true],
      [3, true],
    ]));

    expect(mesh.snapshot().attributes.has(UV0_ATTRIBUTE)).toBe(true);
    expect(mesh.snapshot().attributes.has(UV0_SEAM_ATTRIBUTE)).toBe(true);
    expect(service.findIslands(mesh).map((island) => island.faces)).toEqual([[0, 1]]);
  });

  it("computes a weld map that reconnects the two islands", () => {
    const service = new UvIslandService();
    const values = continuousUv();
    values.set(3, { x: 0, y: 3 });
    values.set(4, { x: 3, y: 0 });
    const before = twoTriangles(values);
    const candidate = service.weldCandidates(before)[0];
    expect(candidate).toBeDefined();

    const weld = service.weldValues(before, candidate!);
    expect(new Map(weld)).toEqual(new Map([
      [1, { x: 2, y: 0 }],
      [4, { x: 2, y: 0 }],
      [2, { x: 0, y: 2 }],
      [3, { x: 0, y: 2 }],
    ]));

    const weldedValues = new Map(values);
    for (const [corner, value] of weld) {
      if (value !== undefined) {
        weldedValues.set(corner, value);
      }
    }
    expect(service.findIslands(twoTriangles(weldedValues)).map((island) => island.faces)).toEqual([[0, 1]]);
  });

  it("excludes partial UV faces instead of treating missing corners as connected", () => {
    const service = new UvIslandService();
    const partial = continuousUv();
    partial.delete(5);

    expect(service.findIslands(twoTriangles(partial))).toEqual([
      { faces: [0], corners: [0, 1, 2] },
    ]);
    expect(service.splitCandidates(twoTriangles(partial))).toEqual([]);
    expect(service.weldCandidates(twoTriangles(partial))).toEqual([]);
  });

  it("returns immutable island, candidate, and weld result boundaries", () => {
    const service = new UvIslandService();
    const continuous = twoTriangles(continuousUv());
    const islands = service.findIslands(continuous);
    const splits = service.splitCandidates(continuous);

    expect(Object.isFrozen(islands)).toBe(true);
    expect(Object.isFrozen(islands[0])).toBe(true);
    expect(Object.isFrozen(islands[0]?.faces)).toBe(true);
    expect(Object.isFrozen(islands[0]?.corners)).toBe(true);
    expect(Object.isFrozen(splits)).toBe(true);
    expect(Object.isFrozen(splits[0])).toBe(true);
    expect(Object.isFrozen(splits[0]?.faces)).toBe(true);
    expect(Object.isFrozen(splits[0]?.cornerPairs)).toBe(true);
    expect(Object.isFrozen(splits[0]?.cornerPairs[0])).toBe(true);
    expect(() => (islands as unknown as number[]).push(9)).toThrow(TypeError);
    expect(() => (splits[0]?.faces as unknown as number[]).push(9)).toThrow(TypeError);

    const discontinuousValues = continuousUv();
    discontinuousValues.set(3, { x: 0, y: 2 });
    const discontinuous = twoTriangles(discontinuousValues);
    const candidate = service.weldCandidates(discontinuous)[0];
    expect(candidate).toBeDefined();
    const weld = service.weldValues(discontinuous, candidate!);
    expect(weld).not.toBeInstanceOf(Map);
    expect(Object.isFrozen(weld)).toBe(true);
    expect(() => (weld as unknown as Map<number, Vec2>).set(99, { x: 9, y: 9 })).toThrow(TypeError);
    expect(weld.has(99)).toBe(false);
  });
});
