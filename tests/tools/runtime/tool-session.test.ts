import { describe, expect, it } from "vitest";

import type {
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  PointerPhase,
  PointerSample,
  ReversibleChange,
  Tool,
  ToolContext,
  ToolPreview,
} from "@octopoly/contracts";

import { ToolSession } from "../../../src/tools/runtime/tool-session";
import { TransactionCoordinator } from "../../../src/tools/runtime/transaction-coordinator";

class FakeHistoryTransaction implements HistoryTransaction {
  readonly changes: ReversibleChange[] = [];
  commitCount = 0;
  rollbackCount = 0;
  failCommit = false;

  constructor(readonly label: string) {}

  recordApplied(change: ReversibleChange): void {
    this.changes.push(change);
  }

  commit(): void {
    if (this.failCommit) {
      throw new Error("commit failed");
    }
    this.commitCount += 1;
  }

  rollback(): void {
    this.rollbackCount += 1;
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

const modifiers = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });

function sample(phase: PointerPhase, pointerId = 7, timestamp = 1): PointerSample {
  return {
    pointerId,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: 12,
    y: 18,
    pressure: phase === "up" || phase === "cancel" ? 0 : 0.6,
    tiltX: 8,
    tiltY: -3,
    buttons: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 1,
    modifiers,
    timestamp,
    coalesced: phase === "move",
  };
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

function preview(revision: number): ToolPreview {
  return { id: "tool-preview", revision, primitives: [] };
}

function change(id: string): ReversibleChange {
  return { id, label: id, apply: () => undefined, revert: () => undefined };
}

describe("ToolSession", () => {
  it("uses an injected coordinator so lifecycle and pointer callbacks share one context", () => {
    const history = new FakeHistoryService();
    const baseContext = fakeContext(history, []);
    const coordinator = new TransactionCoordinator(baseContext);
    const tool: Tool = { id: "fixture" };

    const session = new ToolSession(tool, baseContext, coordinator);

    expect(session.context()).toBe(coordinator.context());
  });

  it("moves through hover, armed, dragging, and commit with one wrapped context", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const baseContext = fakeContext(history, previews);
    const contexts: ToolContext[] = [];
    const phases: PointerPhase[] = [];
    let transaction: HistoryTransaction | null = null;

    const tool: Tool = {
      id: "fixture",
      pointer: (pointer, context) => {
        phases.push(pointer.phase);
        contexts.push(context);
        if (pointer.phase === "hover") {
          return { handled: true, capturePointer: true };
        }
        if (pointer.phase === "down") {
          transaction = context.history.begin("gesture");
          transaction.recordApplied(change("first"));
          context.setPreview(preview(1));
          return { handled: true, capturePointer: true };
        }
        if (pointer.phase === "move") {
          transaction?.recordApplied(change("second"));
          context.setPreview(preview(2));
          return { handled: true };
        }
        transaction?.commit();
        return { handled: true, releasePointer: true };
      },
    };

    const session = new ToolSession(tool, baseContext);
    expect(session.state()).toBe("idle");

    expect(session.dispatch(sample("hover", 7, 1))).toEqual({ handled: true });
    expect(session.state()).toBe("hover");
    expect(history.transactions).toHaveLength(0);

    expect(session.dispatch(sample("down", 7, 2))).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(session.state()).toBe("armed");
    expect(session.activePointerId()).toBe(7);
    expect(session.previewRevision()).toBe(1);

    expect(session.dispatch(sample("move", 7, 3))).toEqual({ handled: true });
    expect(session.state()).toBe("dragging");
    expect(session.previewRevision()).toBe(2);

    expect(session.dispatch(sample("up", 7, 4))).toEqual({
      handled: true,
      releasePointer: true,
    });
    expect(session.state()).toBe("commit");
    expect(session.activePointerId()).toBeNull();
    expect(session.preview()).toBeNull();
    expect(history.transactions).toHaveLength(1);
    expect(history.transactions[0]?.changes).toHaveLength(2);
    expect(history.transactions[0]?.commitCount).toBe(1);
    expect(history.transactions[0]?.rollbackCount).toBe(0);
    expect(previews.at(-1)).toBeNull();
    expect(phases).toEqual(["hover", "down", "move", "up"]);
    expect(contexts.every((context) => context === session.context())).toBe(true);
    expect(session.context()).not.toBe(baseContext);
  });

  it("delivers normalized cancel before Tool.cancel and cleans up exactly once", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const events: string[] = [];
    const tool: Tool = {
      id: "fixture",
      pointer: (pointer, context) => {
        events.push(`pointer:${pointer.phase}`);
        if (pointer.phase === "down") {
          const transaction = context.history.begin("gesture");
          transaction.recordApplied(change("first"));
          context.setPreview(preview(9));
          return { handled: true, capturePointer: true };
        }
        return { handled: true, releasePointer: true };
      },
      cancel: (context) => {
        expect(context).toBe(session.context());
        events.push("cancel");
      },
    };
    const session = new ToolSession(tool, fakeContext(history, previews));

    session.dispatch(sample("down", 7, 1));
    expect(session.dispatch(sample("cancel", 7, 2))).toEqual({
      handled: true,
      releasePointer: true,
    });
    session.cancel();

    expect(events).toEqual(["pointer:down", "pointer:cancel", "cancel"]);
    expect(session.state()).toBe("cancel");
    expect(session.activePointerId()).toBeNull();
    expect(session.preview()).toBeNull();
    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(previews.at(-1)).toBeNull();
  });

  it("rolls back, clears preview, calls cancel, and rethrows a pointer callback error", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const callbackError = new Error("pointer failed");
    let cancelCount = 0;
    const tool: Tool = {
      id: "fixture",
      pointer: (pointer, context) => {
        if (pointer.phase === "down") {
          context.history.begin("gesture").recordApplied(change("first"));
          context.setPreview(preview(2));
          return { handled: true, capturePointer: true };
        }
        throw callbackError;
      },
      cancel: () => {
        cancelCount += 1;
      },
    };
    const session = new ToolSession(tool, fakeContext(history, previews));

    session.dispatch(sample("down"));
    expect(() => session.dispatch(sample("move", 7, 2))).toThrow(callbackError);

    expect(cancelCount).toBe(1);
    expect(session.state()).toBe("cancel");
    expect(session.activePointerId()).toBeNull();
    expect(session.preview()).toBeNull();
    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(previews.at(-1)).toBeNull();
  });

  it("continues rollback and preview cleanup when Tool.cancel throws", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const tool: Tool = {
      id: "fixture",
      pointer: (_pointer, context) => {
        context.history.begin("gesture");
        context.setPreview(preview(5));
        return { handled: true, capturePointer: true };
      },
      cancel: () => {
        throw new Error("cancel failed");
      },
    };
    const session = new ToolSession(tool, fakeContext(history, previews));

    session.dispatch(sample("down"));
    expect(() => session.cancel()).toThrow("cancel failed");

    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(session.preview()).toBeNull();
    expect(session.activePointerId()).toBeNull();
    expect(previews.at(-1)).toBeNull();
  });

  it("rolls back when the underlying history commit fails", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const tool: Tool = {
      id: "fixture",
      pointer: (pointer, context) => {
        if (pointer.phase === "down") {
          context.history.begin("gesture");
          return { handled: true, capturePointer: true };
        }
        return { handled: true, releasePointer: true };
      },
    };
    const session = new ToolSession(tool, fakeContext(history, previews));

    session.dispatch(sample("down"));
    const transaction = history.transactions[0];
    expect(transaction).toBeDefined();
    if (transaction === undefined) {
      throw new Error("missing fake transaction");
    }
    transaction.failCommit = true;

    expect(() => session.dispatch(sample("up", 7, 2))).toThrow("commit failed");
    expect(transaction.commitCount).toBe(0);
    expect(transaction.rollbackCount).toBe(1);
    expect(session.state()).toBe("cancel");
  });

  it("does not let a foreign pointer take over an active gesture", () => {
    const history = new FakeHistoryService();
    const phases: PointerPhase[] = [];
    const tool: Tool = {
      id: "fixture",
      pointer: (pointer) => {
        phases.push(pointer.phase);
        return { handled: true, capturePointer: pointer.phase === "down" };
      },
    };
    const session = new ToolSession(tool, fakeContext(history, []));

    session.dispatch(sample("down", 7));
    expect(session.dispatch(sample("move", 8, 2))).toEqual({ handled: false });
    expect(session.dispatch(sample("up", 8, 3))).toEqual({ handled: false });
    expect(session.activePointerId()).toBe(7);
    expect(phases).toEqual(["down"]);
  });
});
