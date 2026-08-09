import { describe, expect, it } from "vitest";
import { InternalMeshQuery } from "../../../src/mesh/query";
import { addFace, addVertex, createMeshState } from "../../../src/mesh/internal";

describe("InternalMeshQuery", () => {
  it("returns deterministic snapshots and missing-value defaults", () => {
    const state = createMeshState();
    const high = addVertex(state, { x: 4, y: 5, z: 6 });
    const query = new InternalMeshQuery(() => state);

    expect(query.snapshot().vertices.map(({ id }) => id)).toEqual([high]);
    expect(query.vertex(999)).toBeNull();
    expect(query.edge(999)).toBeNull();
    expect(query.corner(999)).toBeNull();
    expect(query.face(999)).toBeNull();
    expect(query.incidentEdges(999)).toEqual([]);
    expect(query.incidentFaces(999)).toEqual([]);
    expect(query.adjacentFaces(999)).toEqual([]);
    expect(query.findEdge(high, 999)).toBeNull();
  });

  it("answers bidirectional adjacency and protects records from callers", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const c = addVertex(state, { x: 0, y: 1, z: 0 });
    const { face } = addFace(state, [a, b, c]);
    const query = new InternalMeshQuery(() => state);
    const edge = query.findEdge(a, b)!;
    const snapshot = query.snapshot();

    expect(query.incidentEdges(a)).toContain(edge);
    expect(query.incidentFaces(a)).toEqual([face]);
    expect(query.adjacentFaces(edge)).toEqual([face]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.vertices)).toBe(true);
    expect(Object.isFrozen(snapshot.vertices[0]!.position)).toBe(true);
    expect(() => {
      (snapshot.vertices as Array<unknown>).push({});
    }).toThrow();
    expect(query.vertex(a)?.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
