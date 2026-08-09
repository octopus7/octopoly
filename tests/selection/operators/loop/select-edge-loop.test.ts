import { describe, expect, it } from "vitest";

import type { EdgeId, SelectionChange } from "@octopoly/contracts";
import { selectEdgeLoop } from "../../../../src/selection/operators/loop";
import { MeshQueryFake, requireEdge, sorted } from "./mesh-query-fake";

function selectedEdges(change: SelectionChange): ReadonlyArray<EdgeId> {
  expect(change.vertices).toBeUndefined();
  expect(change.faces).toBeUndefined();
  return [...(change.edges ?? [])];
}

function gridFaces(columns: number, rows: number): ReadonlyArray<ReadonlyArray<number>> {
  const width = columns + 1;
  const result: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lowerLeft = row * width + column;
      result.push([lowerLeft, lowerLeft + 1, lowerLeft + width + 1, lowerLeft + width]);
    }
  }
  return result;
}

describe("selectEdgeLoop", () => {
  it("walks both directions across an open quad grid and ignores a disconnected component", () => {
    const mesh = new MeshQueryFake([...gridFaces(3, 2), [100, 101, 102, 103]]);
    const seed = requireEdge(mesh, 5, 6);
    const expected = sorted([
      requireEdge(mesh, 4, 5),
      seed,
      requireEdge(mesh, 6, 7),
    ]);

    const result = selectedEdges(selectEdgeLoop(mesh, seed));

    expect(result).toEqual(expected);
    expect(result).toEqual(sorted(result));
    expect(result).not.toContain(requireEdge(mesh, 100, 101));
    expect(mesh.snapshotCalls).toBe(0);
  });

  it("terminates a closed manifold loop on revisit and includes the seed once", () => {
    const count = 4;
    const faces: number[][] = [];
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      faces.push([10 + index, 10 + next, 20 + next, 20 + index]);
      faces.push([30 + index, 30 + next, 10 + next, 10 + index]);
    }
    const mesh = new MeshQueryFake(faces);
    const loop = Array.from({ length: count }, (_, index) =>
      requireEdge(mesh, 10 + index, 10 + ((index + 1) % count)),
    );
    const seed = loop[0];
    if (seed === undefined) {
      throw new Error("Closed-loop fixture has no seed.");
    }

    const result = selectedEdges(selectEdgeLoop(mesh, seed));

    expect(result).toEqual(sorted(loop));
    expect(result.filter((edgeId) => edgeId === seed)).toHaveLength(1);
  });

  it("stops at boundary vertices and valence poles", () => {
    const boundary = new MeshQueryFake([[0, 1, 2, 3]]);
    const boundarySeed = requireEdge(boundary, 0, 1);
    expect(selectedEdges(selectEdgeLoop(boundary, boundarySeed))).toEqual([boundarySeed]);

    const pole = new MeshQueryFake([
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 1],
    ]);
    const poleSeed = requireEdge(pole, 0, 1);
    expect(selectedEdges(selectEdgeLoop(pole, poleSeed))).toEqual([poleSeed]);
  });

  it("stops when the seed edge is non-manifold instead of choosing an ambiguous continuation", () => {
    const mesh = new MeshQueryFake([
      [0, 1, 2],
      [1, 0, 3],
      [0, 1, 4],
    ]);
    const seed = requireEdge(mesh, 0, 1);

    expect(selectedEdges(selectEdgeLoop(mesh, seed))).toEqual([seed]);
  });

  it("returns an empty edge change for a missing seed", () => {
    const mesh = new MeshQueryFake([[0, 1, 2, 3]]);

    expect(selectedEdges(selectEdgeLoop(mesh, 999_999))).toEqual([]);
  });
});
