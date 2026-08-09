import { describe, expect, it } from "vitest";

import type {
  EdgeId,
  MeshQuery,
  SelectionChange,
  SelectionService,
  SelectionSnapshot,
} from "@octopoly/contracts";
import {
  connectedSelection,
  convertSelection,
  growSelection,
  selectAll,
  selectEdgeLoop,
  selectEdgeRing,
  SelectionStore,
  shrinkSelection,
} from "../../src/selection";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type _SelectionStoreContract = Expect<SelectionStore extends SelectionService ? true : false>;
type _SelectAllSignature = Expect<
  Equal<typeof selectAll, (mesh: MeshQuery) => SelectionChange>
>;
type _EdgeLoopSignature = Expect<
  Equal<typeof selectEdgeLoop, (mesh: MeshQuery, seed: EdgeId) => SelectionChange>
>;
type _EdgeRingSignature = Expect<
  Equal<typeof selectEdgeRing, (mesh: MeshQuery, seed: EdgeId) => SelectionChange>
>;
type _GrowSignature = Expect<
  Equal<
    typeof growSelection,
    (mesh: MeshQuery, selection: SelectionSnapshot) => SelectionChange
  >
>;
type _ShrinkSignature = Expect<
  Equal<
    typeof shrinkSelection,
    (mesh: MeshQuery, selection: SelectionSnapshot) => SelectionChange
  >
>;
type _ConnectedSignature = Expect<
  Equal<
    typeof connectedSelection,
    (mesh: MeshQuery, selection: SelectionSnapshot) => SelectionChange
  >
>;
type _ConvertSignature = Expect<
  Equal<
    typeof convertSelection,
    (
      mesh: MeshQuery,
      selection: SelectionSnapshot,
      target: "vertex" | "edge" | "face",
    ) => SelectionChange
  >
>;

describe("selection public API", () => {
  it("publishes the contract implementation and pure operators", () => {
    const service: SelectionService = new SelectionStore();

    const snapshot = service.snapshot();
    expect(snapshot.version).toBe(0);
    expect([...snapshot.vertices]).toEqual([]);
    expect([...snapshot.edges]).toEqual([]);
    expect([...snapshot.faces]).toEqual([]);
    expect(selectAll).toBeTypeOf("function");
    expect(selectEdgeLoop).toBeTypeOf("function");
    expect(selectEdgeRing).toBeTypeOf("function");
    expect(growSelection).toBeTypeOf("function");
    expect(shrinkSelection).toBeTypeOf("function");
    expect(connectedSelection).toBeTypeOf("function");
    expect(convertSelection).toBeTypeOf("function");
  });
});
