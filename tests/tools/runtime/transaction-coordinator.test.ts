import { describe, expect, it } from "vitest";

import type {
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  ReversibleChange,
  ToolContext,
  ToolPreview,
} from "@octopoly/contracts";

import { TransactionCoordinator } from "../../../src/tools/runtime/transaction-coordinator";

class FakeHistoryTransaction implements HistoryTransaction {
  readonly changes: ReversibleChange[] = [];
  commitCount = 0;
  rollbackCount = 0;

  constructor(readonly label: string) {}

  recordApplied(change: ReversibleChange): void {
    this.changes.push(change);
  }

  commit(): void {
    this.commitCount += 1;
  }

  rollback(): void {
    this.rollbackCount += 1;
    for (let index = this.changes.length - 1; index >= 0; index -= 1) {
      this.changes[index]?.revert();
    }
  }
}

class FakeHistoryService implements HistoryService {
  readonly transactions: FakeHistoryTransaction[] = [];

  begin(label: string): HistoryTransaction {
    const transaction = new FakeHistoryTransaction(label);
    this.transactions.push(transaction);
    return transaction;
  }

  undo(): void {}
  redo(): void {}
  clear(): void {}

  snapshot(): HistorySnapshot {
    return { canUndo: false, canRedo: false };
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

function fakeContext(history: HistoryService, previews: Array<ToolPreview | null>): ToolContext {
  return {
    mesh: {} as ToolContext["mesh"],
    mutations: {} as ToolContext["mutations"],
    selection: {} as ToolContext["selection"],
    history,
    surface: {} as ToolContext["surface"],
    getCamera: () => ({}) as ReturnType<ToolContext["getCamera"]>,
    getViewport: () => ({}) as ReturnType<ToolContext["getViewport"]>,
    setPreview: (preview) => previews.push(preview),
    requestRender: () => undefined,
  };
}

function change(id: string, events: string[]): ReversibleChange {
  return {
    id,
    label: id,
    apply: () => events.push(`apply:${id}`),
    revert: () => events.push(`revert:${id}`),
  };
}

function preview(revision: number): ToolPreview {
  return { id: "stroke-preview", revision, primitives: [] };
}

describe("TransactionCoordinator", () => {
  it("defers a tool-requested commit and commits multiple changes as one history entry", () => {
    const history = new FakeHistoryService();
    const coordinator = new TransactionCoordinator(fakeContext(history, []));
    const events: string[] = [];

    coordinator.beginGesture();
    const transaction = coordinator.context().history.begin("stroke");
    transaction.recordApplied(change("first", events));
    transaction.recordApplied(change("second", events));
    transaction.commit();

    expect(history.transactions).toHaveLength(1);
    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(coordinator.hasTransaction()).toBe(true);

    coordinator.commitGesture();
    coordinator.commitGesture();

    expect(history.transactions[0]?.commitCount).toBe(1);
    expect(history.transactions[0]?.rollbackCount).toBe(0);
    expect(coordinator.isGestureActive()).toBe(false);
  });

  it("rolls an open gesture transaction back in reverse change order", () => {
    const history = new FakeHistoryService();
    const coordinator = new TransactionCoordinator(fakeContext(history, []));
    const events: string[] = [];

    coordinator.beginGesture();
    const transaction = coordinator.context().history.begin("stroke");
    transaction.recordApplied(change("first", events));
    transaction.recordApplied(change("second", events));
    coordinator.rollbackGesture();

    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(events).toEqual(["revert:second", "revert:first"]);
  });

  it("does not open history outside a gesture or more than once within a gesture", () => {
    const history = new FakeHistoryService();
    const coordinator = new TransactionCoordinator(fakeContext(history, []));

    expect(() => coordinator.context().history.begin("hover")).toThrow(
      "tool history transactions require an active gesture",
    );
    expect(history.transactions).toHaveLength(0);

    coordinator.beginGesture();
    coordinator.context().history.begin("stroke");
    expect(() => coordinator.context().history.begin("second")).toThrow(
      "a tool gesture can open at most one history transaction",
    );
    expect(history.transactions).toHaveLength(1);
    coordinator.rollbackGesture();
  });

  it("tracks preview revisions and clears the source preview during cleanup", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const coordinator = new TransactionCoordinator(fakeContext(history, previews));
    const first = preview(3);
    const second = preview(4);

    coordinator.context().setPreview(first);
    expect(coordinator.preview()).toBe(first);
    expect(coordinator.previewRevision()).toBe(3);

    coordinator.context().setPreview(second);
    expect(coordinator.preview()).toBe(second);
    expect(coordinator.previewRevision()).toBe(4);

    coordinator.clearPreview();
    expect(coordinator.preview()).toBeNull();
    expect(coordinator.previewRevision()).toBeNull();
    expect(previews).toEqual([first, second, null]);
  });
});
