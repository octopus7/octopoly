import type { MeshCommand } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";
import {
  MeshDraft,
  addFace,
  addVertex,
  attributeStoreKey,
  canonicalEdgeVertices,
  cloneMeshState,
  createMeshState,
  edgePairKey,
  faceVertices,
  rebuildIndexes,
  reserveExistingId,
  validateTopology,
  type MeshState,
} from "../../../../src/mesh/internal";
import { applyElementMutation } from "../../../../src/mesh/mutations/elements";

function triangle(state: MeshState): {
  readonly vertices: readonly [number, number, number];
  readonly face: number;
} {
  const a = addVertex(state, { x: 0, y: 0, z: 0 });
  const b = addVertex(state, { x: 1, y: 0, z: 0 });
  const c = addVertex(state, { x: 0, y: 1, z: 0 });
  const face = addFace(state, [a, b, c]).face;
  return { vertices: [a, b, c], face };
}

function sharedEdgeTriangles(state: MeshState): {
  readonly vertices: readonly [number, number, number, number];
  readonly faces: readonly [number, number];
  readonly edge: number;
} {
  const a = addVertex(state, { x: 0, y: 0, z: 0 });
  const b = addVertex(state, { x: 1, y: 0, z: 0 });
  const c = addVertex(state, { x: 0, y: 1, z: 0 });
  const d = addVertex(state, { x: 0, y: -1, z: 0 });
  const first = addFace(state, [a, b, c]).face;
  const second = addFace(state, [b, a, d]).face;
  const edge = state.edgeByPair.get(edgePairKey(a, b));
  if (edge === undefined) {
    throw new Error("fixture shared edge is missing");
  }
  return { vertices: [a, b, c, d], faces: [first, second], edge };
}

function expectAtomicFailure(draft: MeshDraft, command: MeshCommand, message: string): void {
  const before = cloneMeshState(draft.state);
  expect(() => applyElementMutation(draft, command)).toThrow(message);
  expect(draft.state).toEqual(before);
}

describe("applyElementMutation", () => {
  it("creates isolated vertices and updates positions from canonical commands", () => {
    const draft = new MeshDraft(createMeshState());
    applyElementMutation(draft, {
      kind: "createVertex",
      position: { x: 1, y: 2, z: 3 },
    });
    applyElementMutation(draft, {
      kind: "setVertexPositions",
      positions: new Map([[0, { x: -1, y: -2, z: -3 }]]),
    });

    expect(draft.state.vertices.get(0)?.position).toEqual({ x: -1, y: -2, z: -3 });
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("preflights missing and non-finite position updates without changing the draft or allocator", () => {
    const state = createMeshState();
    const vertex = addVertex(state, { x: 0, y: 0, z: 0 });
    const draft = new MeshDraft(state);

    expectAtomicFailure(
      draft,
      {
        kind: "setVertexPositions",
        positions: new Map([
          [vertex, { x: 4, y: 5, z: 6 }],
          [999, { x: 1, y: 1, z: 1 }],
        ]),
      },
      "missing vertex 999",
    );
    expectAtomicFailure(
      draft,
      {
        kind: "setVertexPositions",
        positions: new Map([[vertex, { x: Number.NaN, y: 0, z: 0 }]]),
      },
      "must contain finite coordinates",
    );
    expectAtomicFailure(
      draft,
      { kind: "createFace", vertices: [vertex, vertex, vertex] },
      "unsupported element mutation command",
    );
  });

  it("deletes requested corners, edges, and vertices through complete face cascades", () => {
    const state = createMeshState();
    const { vertices, face } = triangle(state);
    const isolated = addVertex(state, { x: 3, y: 3, z: 3 });
    const corner = state.faces.get(face)?.corners[0];
    if (corner === undefined) {
      throw new Error("fixture corner is missing");
    }
    const draft = new MeshDraft(state);

    applyElementMutation(draft, {
      kind: "deleteElements",
      elements: { corners: [corner], vertices: [isolated] },
    });

    expect(draft.state.faces.size).toBe(0);
    expect(draft.state.edges.size).toBe(0);
    expect(draft.state.corners.size).toBe(0);
    expect(draft.state.vertices.has(isolated)).toBe(false);
    expect(vertices.every((vertex) => draft.state.vertices.has(vertex))).toBe(true);
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("rejects a missing delete target atomically", () => {
    const state = createMeshState();
    triangle(state);
    const draft = new MeshDraft(state);
    expectAtomicFailure(
      draft,
      { kind: "deleteElements", elements: { edges: [999] } },
      "missing edge 999",
    );
  });

  it("reports isolated edge deletion as unsupported without changing the draft", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const edge = 0;
    state.edges.set(edge, { id: edge, vertices: canonicalEdgeVertices(a, b) });
    reserveExistingId(state, "edge", edge);
    rebuildIndexes(state);
    expect(validateTopology(state)).toEqual([]);

    expectAtomicFailure(
      new MeshDraft(state),
      { kind: "deleteElements", elements: { edges: [edge] } },
      "does not support deleting an isolated edge",
    );
  });

  it("deletes explicitly requested edges and faces with their dependent topology", () => {
    const state = createMeshState();
    const first = triangle(state);
    const edge = state.edgeByPair.get(edgePairKey(first.vertices[0], first.vertices[1]))!;
    const a = addVertex(state, { x: 3, y: 0, z: 0 });
    const b = addVertex(state, { x: 4, y: 0, z: 0 });
    const c = addVertex(state, { x: 3, y: 1, z: 0 });
    const secondFace = addFace(state, [a, b, c]).face;
    const draft = new MeshDraft(state);

    applyElementMutation(draft, {
      kind: "deleteElements",
      elements: { edges: [edge], faces: [secondFace] },
    });

    expect(draft.state.faces.size).toBe(0);
    expect(draft.state.edges.size).toBe(0);
    expect(draft.state.corners.size).toBe(0);
    expect(draft.state.vertices.size).toBe(6);
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("splits a manifold edge in every incident face at a finite interior parameter", () => {
    const state = createMeshState();
    const { vertices: [a, b, c], faces: [firstFace], edge } = sharedEdgeTriangles(state);
    const draft = new MeshDraft(state);
    const firstCorners = draft.state.faces.get(firstFace)?.corners ?? [];
    const preservedCorner = firstCorners.find((cornerId, index) => {
      const nextCornerId = firstCorners[(index + 1) % firstCorners.length];
      return draft.state.corners.get(cornerId)?.vertex === b
        && draft.state.corners.get(nextCornerId!)?.vertex === c;
    });
    if (preservedCorner === undefined) {
      throw new Error("fixture preserved corner is missing");
    }
    const preservedEdge = draft.state.edgeByPair.get(edgePairKey(b, c));
    draft.setAttribute("corner", "sentinel", preservedCorner, 17);

    applyElementMutation(draft, { kind: "splitEdge", edge, t: 0.25 });

    const inserted = Math.max(...draft.state.vertices.keys());
    expect(draft.state.vertices.get(inserted)?.position).toEqual({ x: 0.25, y: 0, z: 0 });
    expect(draft.state.faces.size).toBe(2);
    expect([...draft.state.faces.values()].every((face) => face.corners.length === 4)).toBe(true);
    const firstHalf = draft.state.edgeByPair.get(edgePairKey(a, inserted));
    const secondHalf = draft.state.edgeByPair.get(edgePairKey(inserted, b));
    expect(draft.state.edgeFaces.get(firstHalf!)?.size).toBe(2);
    expect(draft.state.edgeFaces.get(secondHalf!)?.size).toBe(2);
    expect(draft.state.edgeByPair.get(edgePairKey(b, c))).toBe(preservedEdge);
    expect(draft.state.corners.has(preservedCorner)).toBe(true);
    expect(draft.state.attributes.get(attributeStoreKey("corner", "sentinel"))?.entries.get(preservedCorner)).toBe(17);
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("rejects endpoint and non-manifold edge splits atomically", () => {
    const boundaryState = createMeshState();
    const { vertices: [a, b] } = triangle(boundaryState);
    const boundary = boundaryState.edgeByPair.get(edgePairKey(a, b))!;
    expectAtomicFailure(
      new MeshDraft(boundaryState),
      { kind: "splitEdge", edge: boundary, t: 0 },
      "strictly inside",
    );

    const state = createMeshState();
    const { vertices: [u, v], edge } = sharedEdgeTriangles(state);
    const extra = addVertex(state, { x: 0, y: 0, z: 1 });
    addFace(state, [u, v, extra]);
    expect(validateTopology(state)).toEqual([]);
    expectAtomicFailure(
      new MeshDraft(state),
      { kind: "splitEdge", edge, t: 0.5 },
      "non-manifold edge",
    );
  });

  it("collapses a boundary edge while preserving a non-degenerate polygon remainder", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const c = addVertex(state, { x: 1, y: 1, z: 0 });
    const d = addVertex(state, { x: 0, y: 1, z: 0 });
    const face = addFace(state, [a, b, c, d]).face;
    const edge = state.edgeByPair.get(edgePairKey(a, b))!;
    const draft = new MeshDraft(state);

    applyElementMutation(draft, { kind: "collapseEdge", edge, keep: a });

    expect(draft.state.vertices.has(b)).toBe(false);
    expect(faceVertices(draft.state, face)).toEqual([a, c, d]);
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("rejects a collapse keep vertex outside the edge without partial edits", () => {
    const state = createMeshState();
    const { vertices: [, , outside] } = triangle(state);
    const edge = [...state.edges.keys()][0]!;
    expectAtomicFailure(
      new MeshDraft(state),
      { kind: "collapseEdge", edge, keep: outside },
      "must be one of the edge endpoints",
    );
  });

  it("dissolves an oppositely wound shared edge into one deterministic polygon", () => {
    const state = createMeshState();
    const { vertices, edge } = sharedEdgeTriangles(state);
    const draft = new MeshDraft(state);

    applyElementMutation(draft, { kind: "dissolveEdges", edges: [edge] });

    expect(draft.state.faces.size).toBe(1);
    const remaining = [...draft.state.faces.keys()][0]!;
    expect(new Set(faceVertices(draft.state, remaining))).toEqual(new Set(vertices));
    expect(draft.state.edgeByPair.has(edgePairKey(vertices[0], vertices[1]))).toBe(false);
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("rejects boundary dissolves atomically", () => {
    const state = createMeshState();
    const { vertices: [a, b] } = triangle(state);
    const edge = state.edgeByPair.get(edgePairKey(a, b))!;
    expectAtomicFailure(
      new MeshDraft(state),
      { kind: "dissolveEdges", edges: [edge] },
      "exactly two incident faces",
    );
  });

  it("welds adjacent vertices to the lowest stable id and compacts the face cycle", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const c = addVertex(state, { x: 1, y: 1, z: 0 });
    const d = addVertex(state, { x: 0, y: 1, z: 0 });
    const face = addFace(state, [a, b, c, d]).face;
    const draft = new MeshDraft(state);

    applyElementMutation(draft, {
      kind: "weldVertices",
      vertices: [b, a],
      target: { x: 0.5, y: 0, z: 0 },
    });

    expect(draft.state.vertices.has(b)).toBe(false);
    expect(draft.state.vertices.get(a)?.position).toEqual({ x: 0.5, y: 0, z: 0 });
    expect(faceVertices(draft.state, face)).toEqual([a, c, d]);
    expect(validateTopology(draft.state)).toEqual([]);
  });

  it("rejects degenerate and non-finite weld input without changing the draft", () => {
    const state = createMeshState();
    const { vertices: [a, b] } = triangle(state);
    const draft = new MeshDraft(state);
    expectAtomicFailure(
      draft,
      { kind: "weldVertices", vertices: [a, a], target: { x: 0, y: 0, z: 0 } },
      "is repeated",
    );
    expectAtomicFailure(
      draft,
      {
        kind: "weldVertices",
        vertices: [a, b],
        target: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      },
      "must contain finite coordinates",
    );
  });

  it("rejects a weld that would fold a face onto a repeated non-consecutive vertex", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const c = addVertex(state, { x: 1, y: 1, z: 0 });
    const d = addVertex(state, { x: 0, y: 1, z: 0 });
    addFace(state, [a, b, c, d]);
    expectAtomicFailure(
      new MeshDraft(state),
      { kind: "weldVertices", vertices: [a, c], target: { x: 0.5, y: 0.5, z: 0 } },
      "repeat a vertex",
    );
  });
});
