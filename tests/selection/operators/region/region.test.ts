import { describe, expect, it } from "vitest";

import {
  connectedSelection,
  growSelection,
  selectAll,
  shrinkSelection,
} from "../../../../src/selection/operators/region";
import { mixedTopologyFixture, selectionSnapshot } from "./mesh-query-fake";

function values(set: ReadonlySet<number> | undefined): ReadonlyArray<number> {
  return set === undefined ? [] : [...set];
}

describe("selection region operators", () => {
  it("selects every live domain in ascending ID order", () => {
    const selection = selectAll(mixedTopologyFixture());

    expect(values(selection.vertices)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(values(selection.edges)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 30, 31, 32, 33, 34, 35, 36,
    ]);
    expect(values(selection.faces)).toEqual([100, 101, 102, 103, 104, 105]);
  });

  it("grows vertices, edges, and faces by exactly one same-domain layer", () => {
    const mesh = mixedTopologyFixture();
    const input = selectionSnapshot([1, 999], [11, 999], [100, 999]);
    const before = {
      vertices: [...input.vertices],
      edges: [...input.edges],
      faces: [...input.faces],
    };

    const grown = growSelection(mesh, input);

    expect(values(grown.vertices)).toEqual([0, 1, 2, 4]);
    expect(values(grown.edges)).toEqual([10, 11, 12, 14, 16]);
    expect(values(grown.faces)).toEqual([100, 101]);
    expect([...input.vertices]).toEqual(before.vertices);
    expect([...input.edges]).toEqual(before.edges);
    expect([...input.faces]).toEqual(before.faces);
  });

  it("shrinks only elements touching a live unselected neighbor and preserves full selections", () => {
    const mesh = mixedTopologyFixture();
    const partial = selectionSnapshot([0, 1, 2, 3, 4], [10, 11, 12, 13, 14], [100]);

    const shrunk = shrinkSelection(mesh, partial);

    expect(values(shrunk.vertices)).toEqual([0, 1, 3]);
    expect(values(shrunk.edges)).toEqual([10, 13]);
    expect(values(shrunk.faces)).toEqual([]);

    const all = selectAll(mesh);
    const fullSelection = selectionSnapshot(
      values(all.vertices),
      values(all.edges),
      values(all.faces),
    );
    const fullShrunk = shrinkSelection(mesh, fullSelection);
    expect(values(fullShrunk.vertices)).toEqual(values(all.vertices));
    expect(values(fullShrunk.edges)).toEqual(values(all.edges));
    expect(values(fullShrunk.faces)).toEqual(values(all.faces));
  });

  it("unions deterministic connected components for each non-empty domain", () => {
    const connected = connectedSelection(
      mixedTopologyFixture(),
      selectionSnapshot([6, 999, 0], [20, 999, 10], [103, 999, 102, 100]),
    );

    expect(values(connected.vertices)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(values(connected.edges)).toEqual([10, 11, 12, 13, 14, 15, 16, 20, 21, 22]);
    expect(values(connected.faces)).toEqual([100, 101, 102, 103, 104, 105]);

    const empty = connectedSelection(mixedTopologyFixture(), selectionSnapshot());
    expect(values(empty.vertices)).toEqual([]);
    expect(values(empty.edges)).toEqual([]);
    expect(values(empty.faces)).toEqual([]);
  });

  it("handles a non-manifold face edge without ambiguity or stale output", () => {
    const mesh = mixedTopologyFixture();

    const grown = growSelection(mesh, selectionSnapshot([], [], [103, 999]));
    expect(values(grown.faces)).toEqual([103, 104, 105]);

    const shrunk = shrinkSelection(mesh, selectionSnapshot([], [], [104, 103, 999]));
    expect(values(shrunk.faces)).toEqual([]);

    const connected = connectedSelection(mesh, selectionSnapshot([], [], [103, 999]));
    expect(values(connected.faces)).toEqual([103, 104, 105]);
  });
});
