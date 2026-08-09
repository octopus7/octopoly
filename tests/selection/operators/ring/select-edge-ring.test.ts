import { describe, expect, it } from "vitest";

import type { EdgeId, SelectionChange } from "@octopoly/contracts";
import { selectEdgeRing } from "../../../../src/selection/operators/ring";
import { MeshQueryFake, requireEdge, sorted } from "../loop/mesh-query-fake";

function selectedEdges(change: SelectionChange): ReadonlyArray<EdgeId> {
  expect(change.vertices).toBeUndefined();
  expect(change.faces).toBeUndefined();
  return [...(change.edges ?? [])];
}

describe("selectEdgeRing", () => {
  it("walks both incident-face directions across an open quad strip", () => {
    const faces = Array.from({ length: 3 }, (_, index) => [
      index,
      index + 1,
      11 + index,
      10 + index,
    ]);
    const mesh = new MeshQueryFake([...faces, [100, 101, 102, 103]]);
    const seed = requireEdge(mesh, 1, 11);
    const expected = sorted(
      Array.from({ length: 4 }, (_, index) => requireEdge(mesh, index, 10 + index)),
    );

    const result = selectedEdges(selectEdgeRing(mesh, seed));

    expect(result).toEqual(expected);
    expect(result).toEqual(sorted(result));
    expect(result).not.toContain(requireEdge(mesh, 100, 101));
    expect(mesh.snapshotCalls).toBe(0);
  });

  it("terminates a closed quad ring on revisit and includes the seed once", () => {
    const count = 4;
    const faces = Array.from({ length: count }, (_, index) => {
      const next = (index + 1) % count;
      return [index, next, 10 + next, 10 + index];
    });
    const mesh = new MeshQueryFake(faces);
    const ring = Array.from({ length: count }, (_, index) => requireEdge(mesh, index, 10 + index));
    const seed = ring[0];
    if (seed === undefined) {
      throw new Error("Closed-ring fixture has no seed.");
    }

    const result = selectedEdges(selectEdgeRing(mesh, seed));

    expect(result).toEqual(sorted(ring));
    expect(result.filter((edgeId) => edgeId === seed)).toHaveLength(1);
  });

  it("includes the opposite boundary edge of a single quad, then stops", () => {
    const mesh = new MeshQueryFake([[0, 1, 2, 3]]);
    const seed = requireEdge(mesh, 0, 1);
    const opposite = requireEdge(mesh, 2, 3);

    expect(selectedEdges(selectEdgeRing(mesh, seed))).toEqual(sorted([seed, opposite]));
  });

  it("stops before crossing triangle and n-gon faces", () => {
    const mesh = new MeshQueryFake([
      [0, 1, 2],
      [10, 11, 12, 13, 14],
    ]);
    const triangleSeed = requireEdge(mesh, 0, 1);
    const ngonSeed = requireEdge(mesh, 10, 11);

    expect(selectedEdges(selectEdgeRing(mesh, triangleSeed))).toEqual([triangleSeed]);
    expect(selectedEdges(selectEdgeRing(mesh, ngonSeed))).toEqual([ngonSeed]);
  });

  it("stops immediately when the seed edge has non-manifold face ambiguity", () => {
    const mesh = new MeshQueryFake([
      [0, 1, 3, 2],
      [1, 0, 4, 5],
      [0, 1, 7, 6],
    ]);
    const seed = requireEdge(mesh, 0, 1);

    expect(selectedEdges(selectEdgeRing(mesh, seed))).toEqual([seed]);
  });

  it("includes an encountered non-manifold edge but does not choose a next face", () => {
    const mesh = new MeshQueryFake([
      [0, 1, 2, 3],
      [3, 2, 4, 5],
      [2, 3, 7, 6],
    ]);
    const seed = requireEdge(mesh, 0, 1);
    const nonManifold = requireEdge(mesh, 2, 3);

    expect(selectedEdges(selectEdgeRing(mesh, seed))).toEqual(sorted([seed, nonManifold]));
  });

  it("returns an empty edge change for a missing seed", () => {
    const mesh = new MeshQueryFake([[0, 1, 2, 3]]);

    expect(selectedEdges(selectEdgeRing(mesh, 999_999))).toEqual([]);
  });
});
