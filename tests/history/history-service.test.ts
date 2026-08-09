import type {
  HistorySnapshot,
  HistoryTransaction,
  ReversibleChange,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createHistoryService,
  HistoryServiceImpl,
} from "../../src/history/history-service";

interface FakeChange extends ReversibleChange {
  readonly apply: ReturnType<typeof vi.fn<() => void>>;
  readonly revert: ReturnType<typeof vi.fn<() => void>>;
  readonly dispose: ReturnType<typeof vi.fn<() => void>>;
}

function fakeChange(id: string, calls: string[] = []): FakeChange {
  return {
    id,
    label: id,
    apply: vi.fn(() => {
      calls.push(`apply:${id}`);
    }),
    revert: vi.fn(() => {
      calls.push(`revert:${id}`);
    }),
    dispose: vi.fn(),
  };
}

describe("HistoryServiceImpl", () => {
  it("records an already-applied change without applying it again", () => {
    const history = new HistoryServiceImpl();
    const change = fakeChange("move");
    const transaction = history.begin("Move");

    transaction.recordApplied(change);
    transaction.commit();

    expect(change.apply).not.toHaveBeenCalled();
    expect(history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Move",
    });

    history.undo();
    expect(change.revert).toHaveBeenCalledTimes(1);

    history.redo();
    expect(change.apply).toHaveBeenCalledTimes(1);
  });

  it("groups a transaction into one entry with deterministic undo and redo order", () => {
    const history = new HistoryServiceImpl();
    const calls: string[] = [];
    const transaction = history.begin("Pencil stroke");

    transaction.recordApplied(fakeChange("1", calls));
    transaction.recordApplied(fakeChange("2", calls));
    transaction.recordApplied(fakeChange("3", calls));
    transaction.commit();

    history.undo();
    expect(calls).toEqual(["revert:3", "revert:2", "revert:1"]);

    calls.length = 0;
    history.redo();
    expect(calls).toEqual(["apply:1", "apply:2", "apply:3"]);
  });

  it("rolls back and disposes changes without changing either stack branch", () => {
    const history = new HistoryServiceImpl();
    const kept = fakeChange("kept");
    const keptTransaction = history.begin("Kept");
    keptTransaction.recordApplied(kept);
    keptTransaction.commit();
    history.undo();

    const calls: string[] = [];
    const rolledBack = fakeChange("rolled-back", calls);
    const transaction = history.begin("Cancelled stroke");
    transaction.recordApplied(rolledBack);
    transaction.rollback();

    expect(calls).toEqual(["revert:rolled-back"]);
    expect(rolledBack.dispose).toHaveBeenCalledTimes(1);
    expect(history.snapshot()).toEqual({
      canUndo: false,
      canRedo: true,
      redoLabel: "Kept",
    });
  });

  it("truncates redo on commit and disposes discarded changes exactly once", () => {
    const history = new HistoryServiceImpl();
    const discarded = fakeChange("discarded");
    const first = history.begin("Discarded");
    first.recordApplied(discarded);
    first.commit();
    history.undo();

    const replacement = history.begin("Replacement");
    replacement.recordApplied(fakeChange("replacement"));
    replacement.commit();
    history.clear();

    expect(discarded.dispose).toHaveBeenCalledTimes(1);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
  });

  it("shares one change lifecycle across every committed entry", () => {
    const history = new HistoryServiceImpl();
    const shared = fakeChange("shared");

    const first = history.begin("First owner");
    first.recordApplied(shared);
    first.commit();

    const second = history.begin("Second owner");
    second.recordApplied(shared);
    second.commit();

    history.clear();
    history.clear();

    expect(shared.dispose).toHaveBeenCalledTimes(1);
  });

  it("clears an active transaction by rolling it back and publishes one final snapshot", () => {
    const history = new HistoryServiceImpl();
    const retained = fakeChange("retained");
    const retainedTransaction = history.begin("Retained");
    retainedTransaction.recordApplied(retained);
    retainedTransaction.commit();

    const active = fakeChange("active");
    const activeTransaction = history.begin("Active");
    activeTransaction.recordApplied(active);

    const snapshots: HistorySnapshot[] = [];
    history.subscribe((snapshot) => snapshots.push(snapshot));
    history.clear();

    expect(active.revert).toHaveBeenCalledTimes(1);
    expect(active.dispose).toHaveBeenCalledTimes(1);
    expect(retained.dispose).toHaveBeenCalledTimes(1);
    expect(snapshots).toEqual([{ canUndo: false, canRedo: false }]);
    expect(() => activeTransaction.rollback()).toThrow(/closed/i);
  });

  it("publishes final snapshots for commit, rollback, undo, redo, clear, and no-ops", () => {
    const history = new HistoryServiceImpl();
    const snapshots: HistorySnapshot[] = [];
    const unsubscribe = history.subscribe((snapshot) => snapshots.push(snapshot));

    history.undo();
    history.redo();
    history.begin("Empty").commit();
    history.begin("Empty rollback").rollback();

    const transaction = history.begin("Edit");
    transaction.recordApplied(fakeChange("edit"));
    transaction.commit();
    history.undo();
    history.redo();
    history.clear();

    expect(snapshots).toEqual([
      { canUndo: false, canRedo: false },
      { canUndo: false, canRedo: false },
      { canUndo: false, canRedo: false },
      { canUndo: false, canRedo: false },
      { canUndo: true, canRedo: false, undoLabel: "Edit" },
      { canUndo: false, canRedo: true, redoLabel: "Edit" },
      { canUndo: true, canRedo: false, undoLabel: "Edit" },
      { canUndo: false, canRedo: false },
    ]);

    unsubscribe();
    history.clear();
    expect(snapshots).toHaveLength(8);
  });

  it("allows a subscriber to begin a new transaction after commit closes", () => {
    const history = new HistoryServiceImpl();
    let reentered: HistoryTransaction | null = null;
    const unsubscribe = history.subscribe(() => {
      reentered ??= history.begin("Subscriber commit transaction");
    });
    const transaction = history.begin("Committed");
    transaction.recordApplied(fakeChange("committed"));

    transaction.commit();
    unsubscribe();

    expect(reentered).not.toBeNull();
    reentered!.rollback();
  });

  it("allows a subscriber to begin a new transaction after rollback closes", () => {
    const history = new HistoryServiceImpl();
    let reentered: HistoryTransaction | null = null;
    const unsubscribe = history.subscribe(() => {
      reentered ??= history.begin("Subscriber rollback transaction");
    });
    const transaction = history.begin("Rolled back");
    transaction.recordApplied(fakeChange("rolled-back"));

    transaction.rollback();
    unsubscribe();

    expect(reentered).not.toBeNull();
    reentered!.rollback();
  });

  it("rejects nested transactions and undo or redo during an active transaction", () => {
    const history = new HistoryServiceImpl();
    const transaction = history.begin("Active");

    expect(() => history.begin("Nested")).toThrow(/already active/i);
    expect(() => history.undo()).toThrow(/active/i);
    expect(() => history.redo()).toThrow(/active/i);

    transaction.rollback();
    expect(() => history.begin("Next")).not.toThrow();
  });

  it("publishes the canonical factory as a HistoryService", () => {
    const history = createHistoryService();

    expect(history).toBeInstanceOf(HistoryServiceImpl);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
  });
});
