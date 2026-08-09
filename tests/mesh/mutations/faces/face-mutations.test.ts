import { describe, expect, it } from "vitest";
import { applyFaceMutation } from "../../../../src/mesh/mutations/faces";
import {
  MeshDraft,
  addFace,
  addVertex,
  cloneMeshState,
  createMeshState,
  edgePairKey,
  faceVertices,
  validateTopology,
  type MeshState,
} from "../../../../src/mesh/internal";

function vertex(state: MeshState, x: number, y: number, z = 0): number {
  return addVertex(state, { x, y, z });
}

function edge(state: MeshState, a: number, b: number): number {
  const result = state.edgeByPair.get(edgePairKey(a, b));
  if (result === undefined) {
    throw new Error(`missing fixture edge ${a}:${b}`);
  }
  return result;
}

describe("face mutation operators", () => {
  it("creates a non-degenerate face on a cloned draft without changing its source", () => {
    const source = createMeshState();
    const a = vertex(source, 0, 0);
    const b = vertex(source, 1, 0);
    const c = vertex(source, 0, 1);
    const sourceBefore = cloneMeshState(source);
    const working = cloneMeshState(source);

    applyFaceMutation(new MeshDraft(working), { kind: "createFace", vertices: [a, b, c] });

    expect(working.faces.size).toBe(1);
    expect(validateTopology(working)).toEqual([]);
    expect(source).toEqual(sourceBefore);
  });

  it("preflights degenerate and unsupported commands without changing the draft", () => {
    const state = createMeshState();
    const a = vertex(state, 0, 0);
    const b = vertex(state, 1, 0);
    const c = vertex(state, 2, 0);
    const before = cloneMeshState(state);

    expect(() =>
      applyFaceMutation(new MeshDraft(state), { kind: "createFace", vertices: [a, b, c] }),
    ).toThrow(/degenerate/);
    expect(state).toEqual(before);
    expect(() =>
      applyFaceMutation(new MeshDraft(state), {
        kind: "createVertex",
        position: { x: 0, y: 0, z: 0 },
      }),
    ).toThrow(/unsupported face mutation command/);
    expect(state).toEqual(before);
  });

  it("bridges two compatible manifold boundary edges with a wound quad", () => {
    const state = createMeshState();
    const a0 = vertex(state, 0, 0);
    const a1 = vertex(state, 1, 0);
    const a2 = vertex(state, 0, -1);
    const b0 = vertex(state, 0, 1);
    const b1 = vertex(state, 1, 1);
    const b2 = vertex(state, 0, 2);
    addFace(state, [a0, a1, a2]);
    addFace(state, [b1, b0, b2]);

    applyFaceMutation(new MeshDraft(state), {
      kind: "bridgeEdges",
      first: [edge(state, a0, a1)],
      second: [edge(state, b0, b1)],
    });

    expect(state.faces.size).toBe(3);
    expect(state.edgeByPair.has(edgePairKey(a0, b0))).toBe(true);
    expect(state.edgeByPair.has(edgePairKey(a1, b1))).toBe(true);
    expect(validateTopology(state)).toEqual([]);
  });

  it("bridges compatible ordered edge chains and rejects a disconnected chain", () => {
    const state = createMeshState();
    const first = [vertex(state, 0, 0), vertex(state, 1, 0), vertex(state, 2, 0)];
    const firstInside = vertex(state, 1, -1);
    const second = [vertex(state, 0, 1), vertex(state, 1, 1), vertex(state, 2, 1)];
    const secondInside = vertex(state, 1, 2);
    addFace(state, [first[0]!, first[1]!, first[2]!, firstInside]);
    addFace(state, [second[2]!, second[1]!, second[0]!, secondInside]);
    const firstEdges = [edge(state, first[0]!, first[1]!), edge(state, first[1]!, first[2]!)];
    const secondEdges = [edge(state, second[0]!, second[1]!), edge(state, second[1]!, second[2]!)];

    const before = cloneMeshState(state);
    expect(() =>
      applyFaceMutation(new MeshDraft(state), {
        kind: "bridgeEdges",
        first: [firstEdges[0]!, edge(state, first[2]!, firstInside)],
        second: secondEdges,
      }),
    ).toThrow(/ordered connected chain|disconnected/);
    expect(state).toEqual(before);

    applyFaceMutation(new MeshDraft(state), {
      kind: "bridgeEdges",
      first: firstEdges,
      second: secondEdges,
    });

    expect(state.faces.size).toBe(4);
    expect(validateTopology(state)).toEqual([]);
  });

  it("rotates the shared diagonal of two triangles and keeps their face ids", () => {
    const state = createMeshState();
    const start = vertex(state, 0, 0);
    const end = vertex(state, 1, 1);
    const firstOpposite = vertex(state, 0, 1);
    const secondOpposite = vertex(state, 1, 0);
    const firstFace = addFace(state, [start, end, firstOpposite]).face;
    const secondFace = addFace(state, [end, start, secondOpposite]).face;
    const diagonal = edge(state, start, end);

    applyFaceMutation(new MeshDraft(state), { kind: "rotateDiagonal", edge: diagonal });

    expect(state.edgeByPair.has(edgePairKey(start, end))).toBe(false);
    expect(state.edgeByPair.has(edgePairKey(firstOpposite, secondOpposite))).toBe(true);
    expect(state.faces.has(firstFace)).toBe(true);
    expect(state.faces.has(secondFace)).toBe(true);
    expect(validateTopology(state)).toEqual([]);
  });

  it("extrudes a boundary edge into a side quad", () => {
    const state = createMeshState();
    const a = vertex(state, 0, 0);
    const b = vertex(state, 1, 0);
    const c = vertex(state, 0, 1);
    addFace(state, [a, b, c]);
    const boundary = edge(state, a, b);

    applyFaceMutation(new MeshDraft(state), {
      kind: "extrudeEdges",
      edges: [boundary],
      offset: { x: 0, y: 0, z: 1 },
    });

    expect(state.vertices.size).toBe(5);
    expect(state.faces.size).toBe(2);
    expect(state.edgeFaces.get(boundary)?.size).toBe(2);
    expect(validateTopology(state)).toEqual([]);
  });

  it("extrudes a polygon face as a top face plus boundary side quads", () => {
    const state = createMeshState();
    const vertices = [
      vertex(state, 0, 0),
      vertex(state, 1, 0),
      vertex(state, 1, 1),
      vertex(state, 0, 1),
    ];
    const face = addFace(state, vertices).face;

    applyFaceMutation(new MeshDraft(state), {
      kind: "extrudeFaces",
      faces: [face],
      offset: { x: 0, y: 0, z: 1 },
    });

    expect(state.vertices.size).toBe(8);
    expect(state.faces.size).toBe(5);
    expect(faceVertices(state, face).map((id) => state.vertices.get(id)!.position.z)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(validateTopology(state)).toEqual([]);
  });

  it("rejects degenerate edge extrusion and non-manifold neighborhoods atomically", () => {
    const degenerate = createMeshState();
    const a = vertex(degenerate, 0, 0);
    const b = vertex(degenerate, 1, 0);
    const c = vertex(degenerate, 0, 1);
    addFace(degenerate, [a, b, c]);
    const boundary = edge(degenerate, a, b);
    const degenerateBefore = cloneMeshState(degenerate);

    expect(() =>
      applyFaceMutation(new MeshDraft(degenerate), {
        kind: "extrudeEdges",
        edges: [boundary],
        offset: { x: 1, y: 0, z: 0 },
      }),
    ).toThrow(/coincident|degenerate/);
    expect(degenerate).toEqual(degenerateBefore);

    const nonManifold = createMeshState();
    const n0 = vertex(nonManifold, 0, 0);
    const n1 = vertex(nonManifold, 1, 0);
    const n2 = vertex(nonManifold, 0, 1);
    const n3 = vertex(nonManifold, 0, -1);
    const n4 = vertex(nonManifold, 0, 0, 1);
    addFace(nonManifold, [n0, n1, n2]);
    addFace(nonManifold, [n1, n0, n3]);
    addFace(nonManifold, [n0, n1, n4]);
    const crowded = edge(nonManifold, n0, n1);
    const nonManifoldBefore = cloneMeshState(nonManifold);

    expect(() =>
      applyFaceMutation(new MeshDraft(nonManifold), {
        kind: "extrudeEdges",
        edges: [crowded],
        offset: { x: 0, y: 0, z: 1 },
      }),
    ).toThrow(/manifold boundary/);
    expect(nonManifold).toEqual(nonManifoldBefore);
  });

  it("preflights allocator overflow before creating any topology", () => {
    const state = createMeshState();
    const a = vertex(state, 0, 0);
    const b = vertex(state, 1, 0);
    const c = vertex(state, 0, 1);
    state.allocators.edge.next = Number.MAX_SAFE_INTEGER;
    const before = cloneMeshState(state);

    expect(() =>
      applyFaceMutation(new MeshDraft(state), { kind: "createFace", vertices: [a, b, c] }),
    ).toThrow(/overflow/);
    expect(state).toEqual(before);

    const rotate = createMeshState();
    const start = vertex(rotate, 0, 0);
    const end = vertex(rotate, 1, 1);
    const firstOpposite = vertex(rotate, 0, 1);
    const secondOpposite = vertex(rotate, 1, 0);
    addFace(rotate, [start, end, firstOpposite]);
    addFace(rotate, [end, start, secondOpposite]);
    const diagonal = edge(rotate, start, end);
    rotate.allocators.edge.next = Number.MAX_SAFE_INTEGER - 2;
    const rotateBefore = cloneMeshState(rotate);

    expect(() =>
      applyFaceMutation(new MeshDraft(rotate), { kind: "rotateDiagonal", edge: diagonal }),
    ).toThrow(/overflow/);
    expect(rotate).toEqual(rotateBefore);
  });
});
