import { describe, expect, it } from "vitest";
import {
  addFace,
  addVertex,
  cloneMeshState,
  createMeshState,
  removeFace,
  removeVertex,
  replaceFaceVertices,
  setAttributeValue,
  validateTopology,
} from "../../../src/mesh/internal";

describe("mesh internal state", () => {
  it("represents isolated, boundary, and non-manifold topology", () => {
    const state = createMeshState();
    const vertices = [
      addVertex(state, { x: 0, y: 0, z: 0 }),
      addVertex(state, { x: 1, y: 0, z: 0 }),
      addVertex(state, { x: 0, y: 1, z: 0 }),
      addVertex(state, { x: 0, y: -1, z: 0 }),
      addVertex(state, { x: 0, y: 0, z: 1 }),
      addVertex(state, { x: 5, y: 5, z: 5 }),
    ];
    addFace(state, [vertices[0]!, vertices[1]!, vertices[2]!]);
    addFace(state, [vertices[1]!, vertices[0]!, vertices[3]!]);
    addFace(state, [vertices[0]!, vertices[1]!, vertices[4]!]);

    expect(validateTopology(state)).toEqual([]);
    const sharedEdge = state.edgeByPair.get(`${vertices[0]}:${vertices[1]}`);
    expect(sharedEdge).toBeDefined();
    expect(state.edgeFaces.get(sharedEdge!)?.size).toBe(3);
    expect(state.vertexEdges.get(vertices[5]!)?.size).toBe(0);
  });

  it("retires deleted ids and never allocates them again", () => {
    const state = createMeshState();
    const first = addVertex(state, { x: 0, y: 0, z: 0 });
    removeVertex(state, first);
    const second = addVertex(state, { x: 1, y: 0, z: 0 });
    expect(second).toBeGreaterThan(first);

    const a = second;
    const b = addVertex(state, { x: 0, y: 1, z: 0 });
    const c = addVertex(state, { x: 0, y: 0, z: 1 });
    const created = addFace(state, [a, b, c]);
    removeFace(state, created.face);
    const replacement = addFace(state, [a, c, b]);
    expect(replacement.face).toBeGreaterThan(created.face);
    expect(replacement.corners.every((id) => !created.corners.includes(id))).toBe(true);
    expect(validateTopology(state)).toEqual([]);
  });

  it("detects corrupt cycles, references, duplicate edges, self-edges, and adjacency", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const c = addVertex(state, { x: 0, y: 1, z: 0 });
    const face = addFace(state, [a, b, c]);
    const corrupt = cloneMeshState(state);
    corrupt.faces.get(face.face)!.corners.pop();
    corrupt.edges.set(999, { id: 999, vertices: [a, a] });
    corrupt.corners.get(face.corners[0]!)!.vertex = 999;
    corrupt.vertexEdges.get(a)!.clear();

    const errors = validateTopology(corrupt).join("\n");
    expect(errors).toContain("fewer than three corners");
    expect(errors).toContain("self-edge");
    expect(errors).toContain("dangling reference");
    expect(errors).toContain("adjacency mismatch");
  });

  it("preserves unchanged edge/corner ids and corner attributes during face rewrites", () => {
    const state = createMeshState();
    const a = addVertex(state, { x: 0, y: 0, z: 0 });
    const b = addVertex(state, { x: 1, y: 0, z: 0 });
    const c = addVertex(state, { x: 1, y: 1, z: 0 });
    const d = addVertex(state, { x: 0, y: 1, z: 0 });
    const middle = addVertex(state, { x: 0.5, y: 0, z: 0 });
    const created = addFace(state, [a, b, c, d]);
    const preservedCorner = created.corners[1]!;
    const preservedEdge = state.corners.get(preservedCorner)!.edge;
    setAttributeValue(state, "corner", "weight", preservedCorner, 0.25);

    replaceFaceVertices(state, created.face, [a, middle, b, c, d]);

    expect(state.faces.get(created.face)?.corners).toContain(preservedCorner);
    expect(state.edges.has(preservedEdge)).toBe(true);
    expect(state.attributes.get("corner\u0000weight")?.entries.get(preservedCorner)).toBe(0.25);
    expect(validateTopology(state)).toEqual([]);
  });
});
