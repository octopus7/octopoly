import { describe, expect, it, vi } from "vitest";

import type { SelectionService, SelectionSnapshot } from "@octopoly/contracts";

import { SelectionStore } from "../../../src/selection/state";

const ids = (...values: number[]): ReadonlySet<number> => new Set(values);

function expectSnapshot(
  snapshot: SelectionSnapshot,
  version: number,
  vertices: readonly number[],
  edges: readonly number[],
  faces: readonly number[],
): void {
  expect(snapshot.version).toBe(version);
  expect([...snapshot.vertices].sort((a, b) => a - b)).toEqual(vertices);
  expect([...snapshot.edges].sort((a, b) => a - b)).toEqual(edges);
  expect([...snapshot.faces].sort((a, b) => a - b)).toEqual(faces);
}

describe("SelectionStore", () => {
  it("is assignable to the canonical SelectionService and starts empty", () => {
    const service: SelectionService = new SelectionStore();

    expectSnapshot(service.snapshot(), 0, [], [], []);
  });

  it("replaces every domain and treats omitted domains as empty", () => {
    const store = new SelectionStore();
    store.update("replace", {
      vertices: ids(3, 1, 3),
      edges: ids(10),
      faces: ids(20),
    });

    store.update("replace", { vertices: ids(2) });

    expectSnapshot(store.snapshot(), 2, [2], [], []);
  });

  it("adds, subtracts, and toggles provided domains while preserving omitted domains", () => {
    const store = new SelectionStore();
    store.update("replace", {
      vertices: ids(1, 2),
      edges: ids(10),
      faces: ids(20),
    });

    store.update("add", { vertices: ids(2, 3) });
    store.update("subtract", { edges: ids(99) });
    store.update("toggle", { vertices: ids(1, 4), faces: ids(20, 21) });

    expectSnapshot(store.snapshot(), 3, [2, 3, 4], [10], [21]);
  });

  it("does not increment or publish for duplicate/no-op updates and empty clears", () => {
    const store = new SelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update("add", { vertices: ids(1, 1) });
    store.update("add", { vertices: ids(1), edges: ids() });
    store.update("subtract", { faces: ids(100) });
    store.update("toggle", { vertices: ids() });

    expect(store.snapshot().version).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    store.clear();
    store.clear();

    expect(store.snapshot().version).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not emit immediately and gives every active subscriber one shared immutable snapshot", () => {
    const store = new SelectionStore();
    const first: SelectionSnapshot[] = [];
    const second: SelectionSnapshot[] = [];

    store.subscribe((snapshot) => first.push(snapshot));
    store.subscribe((snapshot) => second.push(snapshot));

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(0);

    store.update("add", { vertices: ids(7) });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toBe(second[0]);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(Object.isFrozen(first[0]?.vertices)).toBe(true);
    expect(Reflect.ownKeys(first[0]?.vertices ?? {})).not.toContain("valuesSet");
    expect(
      (first[0]?.vertices as unknown as { valuesSet?: Set<number> }).valuesSet,
    ).toBeUndefined();
    expect(() => (first[0]?.vertices as Set<number>).add(8)).toThrow(TypeError);
    expect([...store.snapshot().vertices]).toEqual([7]);
  });

  it("copies update inputs so later caller mutation cannot change state", () => {
    const store = new SelectionStore();
    const vertices = new Set([1]);

    store.update("replace", { vertices });
    vertices.add(2);
    vertices.delete(1);

    expect([...store.snapshot().vertices]).toEqual([1]);
  });

  it("makes unsubscribe idempotent and suppresses all later callbacks", () => {
    const store = new SelectionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update("add", { edges: ids(1) });
    unsubscribe();
    unsubscribe();
    store.update("add", { edges: ids(2) });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fails version overflow before changing state or publishing", () => {
    const store = new SelectionStore();
    store.update("replace", { vertices: ids(1) });
    const before = store.snapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    (store as unknown as { version: number }).version = Number.MAX_SAFE_INTEGER;

    expect(() => store.update("add", { vertices: ids(2) })).toThrow("selection version overflow");
    expect(store.snapshot()).toBe(before);
    expect([...store.snapshot().vertices]).toEqual([1]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps one snapshot identity per publication during a reentrant update", () => {
    const store = new SelectionStore();
    const first: SelectionSnapshot[] = [];
    const second: SelectionSnapshot[] = [];

    store.subscribe((snapshot) => {
      first.push(snapshot);
      if (snapshot.version === 1) {
        store.update("add", { vertices: ids(2) });
      }
    });
    store.subscribe((snapshot) => second.push(snapshot));

    store.update("add", { vertices: ids(1) });

    expect(first.map((snapshot) => snapshot.version)).toEqual([1, 2]);
    expect(second.map((snapshot) => snapshot.version)).toEqual([2, 1]);
    expect(first[0]).toBe(second[1]);
    expect(first[1]).toBe(second[0]);
    expectSnapshot(store.snapshot(), 2, [1, 2], [], []);
  });
});
