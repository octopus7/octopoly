import { describe, expect, it } from "vitest";

import { convertSelection } from "../../../../src/selection/operators/conversion";
import {
  mixedTopologyFixture,
  selectionSnapshot,
} from "../region/mesh-query-fake";

function values(set: ReadonlySet<number> | undefined): ReadonlyArray<number> {
  return set === undefined ? [] : [...set];
}

describe("selection conversion", () => {
  it("unions mixed-domain sources, preserves live same-domain IDs, and returns only the target", () => {
    const mesh = mixedTopologyFixture();
    const input = selectionSnapshot([999, 6, 1], [999, 20, 10], [999, 102, 100]);
    const before = {
      vertices: [...input.vertices],
      edges: [...input.edges],
      faces: [...input.faces],
    };

    const vertices = convertSelection(mesh, input, "vertex");
    const edges = convertSelection(mesh, input, "edge");
    const faces = convertSelection(mesh, input, "face");

    expect(Object.keys(vertices)).toEqual(["vertices"]);
    expect(values(vertices.vertices)).toEqual([0, 1, 3, 4, 6, 7, 8]);
    expect(Object.keys(edges)).toEqual(["edges"]);
    expect(values(edges.edges)).toEqual([10, 11, 12, 13, 20, 21, 22]);
    expect(Object.keys(faces)).toEqual(["faces"]);
    expect(values(faces.faces)).toEqual([100, 102]);
    expect([...input.vertices]).toEqual(before.vertices);
    expect([...input.edges]).toEqual(before.edges);
    expect([...input.faces]).toEqual(before.faces);
  });

  it("uses face element unions and edge endpoints for outward conversion", () => {
    const mesh = mixedTopologyFixture();

    const fromFace = selectionSnapshot([], [], [100]);
    expect(values(convertSelection(mesh, fromFace, "vertex").vertices)).toEqual([0, 1, 3, 4]);
    expect(values(convertSelection(mesh, fromFace, "edge").edges)).toEqual([10, 11, 12, 13]);

    const fromEdge = selectionSnapshot([], [11]);
    expect(values(convertSelection(mesh, fromEdge, "vertex").vertices)).toEqual([1, 4]);
  });

  it("includes an edge or face only when the source fully contains its defining elements", () => {
    const mesh = mixedTopologyFixture();

    const fullVertices = selectionSnapshot([4, 0, 3, 1]);
    expect(values(convertSelection(mesh, fullVertices, "edge").edges)).toEqual([10, 11, 12, 13]);
    expect(values(convertSelection(mesh, fullVertices, "face").faces)).toEqual([100]);

    const partialVertices = selectionSnapshot([0, 1, 3]);
    expect(values(convertSelection(mesh, partialVertices, "face").faces)).toEqual([]);

    const fullEdges = selectionSnapshot([], [13, 11, 10, 12]);
    expect(values(convertSelection(mesh, fullEdges, "face").faces)).toEqual([100]);

    const partialEdges = selectionSnapshot([], [10, 11, 12]);
    expect(values(convertSelection(mesh, partialEdges, "face").faces)).toEqual([]);
  });

  it("returns ascending empty live sets for empty or stale-only selections", () => {
    const mesh = mixedTopologyFixture();
    for (const input of [selectionSnapshot(), selectionSnapshot([999], [999], [999])]) {
      expect(values(convertSelection(mesh, input, "vertex").vertices)).toEqual([]);
      expect(values(convertSelection(mesh, input, "edge").edges)).toEqual([]);
      expect(values(convertSelection(mesh, input, "face").faces)).toEqual([]);
    }
  });

  it("converts all faces incident to a non-manifold edge only when each face is fully contained", () => {
    const mesh = mixedTopologyFixture();
    const partial = selectionSnapshot([], [30, 31, 32, 33, 34]);
    expect(values(convertSelection(mesh, partial, "face").faces)).toEqual([103, 104]);

    const all = selectionSnapshot([], [30, 31, 32, 33, 34, 35, 36]);
    expect(values(convertSelection(mesh, all, "face").faces)).toEqual([103, 104, 105]);
  });
});
