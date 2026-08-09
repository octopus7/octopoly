import { describe, expect, it } from "vitest";

import type {
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  PointerKind,
  PointerPhase,
  PointerSample,
  ReversibleChange,
  Tool,
  ToolContext,
  ToolPreview,
} from "@octopoly/contracts";

import { ToolRuntime } from "../../../src/tools/runtime/index";

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

const modifiers = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });

function sample(
  phase: PointerPhase,
  timestamp: number,
  options: { pointerId?: number; pointerType?: PointerKind; coalesced?: boolean } = {},
): PointerSample {
  return Object.freeze({
    pointerId: options.pointerId ?? 17,
    pointerType: options.pointerType ?? "pen",
    phase,
    isPrimary: true,
    x: 120.25 + timestamp,
    y: 48.5 + timestamp,
    pressure: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 0.72,
    tiltX: 11,
    tiltY: -7,
    buttons: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 1,
    modifiers,
    timestamp,
    coalesced: options.coalesced ?? false,
  });
}

function fakeContext(
  history: HistoryService,
  previews: Array<ToolPreview | null>,
): ToolContext {
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
  return { id: "runtime-fixture", revision, primitives: [] };
}

function change(id: string, events: string[]): ReversibleChange {
  return {
    id,
    label: id,
    apply: () => events.push(`apply:${id}`),
    revert: () => events.push(`revert:${id}`),
  };
}

describe("ToolRuntime integration", () => {
  it("routes every normalized sample unchanged and commits one grouped entry", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const received: PointerSample[] = [];
    const contexts: ToolContext[] = [];
    const events: string[] = [];
    let transaction: HistoryTransaction | null = null;
    const tool: Tool = {
      id: "stroke",
      pointer: (pointer, context) => {
        received.push(pointer);
        contexts.push(context);
        if (pointer.phase === "hover") {
          return { handled: true, capturePointer: true };
        }
        if (pointer.phase === "down") {
          transaction = context.history.begin("stroke");
          transaction.recordApplied(change("first", events));
          context.setPreview(preview(1));
          return { handled: true, capturePointer: true };
        }
        if (pointer.phase === "move") {
          transaction?.recordApplied(change(`move-${pointer.timestamp}`, events));
          context.setPreview(preview(pointer.timestamp));
          return { handled: true };
        }
        return { handled: true, releasePointer: true };
      },
    };
    const runtime = new ToolRuntime(fakeContext(history, previews));
    runtime.tools.register(tool);
    runtime.tools.activate(tool.id);

    const hover = sample("hover", 1, { pointerType: "mouse" });
    const down = sample("down", 2);
    const coalescedFirst = sample("move", 3, { coalesced: true });
    const coalescedSecond = sample("move", 4, { coalesced: true });
    const move = sample("move", 5);
    const foreignTouch = sample("move", 6, { pointerId: 99, pointerType: "touch" });
    const up = sample("up", 7);

    expect(runtime.dispatch(hover)).toEqual({ handled: true });
    expect(runtime.capturedPointerId()).toBeNull();
    expect(runtime.dispatch(down)).toEqual({ handled: true, capturePointer: true });
    expect(runtime.capturedPointerId()).toBe(17);
    expect(runtime.dispatch(coalescedFirst)).toEqual({ handled: true });
    expect(runtime.dispatch(coalescedSecond)).toEqual({ handled: true });
    expect(runtime.dispatch(move)).toEqual({ handled: true });
    expect(runtime.dispatch(foreignTouch)).toEqual({ handled: false });
    expect(runtime.dispatch(up)).toEqual({ handled: true, releasePointer: true });

    expect(received).toEqual([hover, down, coalescedFirst, coalescedSecond, move, up]);
    const expectedSamples = [hover, down, coalescedFirst, coalescedSecond, move, up];
    expect(received.every((pointer, index) => pointer === expectedSamples[index])).toBe(true);
    expect(received.map((pointer) => pointer.pointerType)).toEqual([
      "mouse",
      "pen",
      "pen",
      "pen",
      "pen",
      "pen",
    ]);
    expect(received.map((pointer) => pointer.coalesced)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(contexts.every((context) => context === contexts[0])).toBe(true);
    expect(history.transactions).toHaveLength(1);
    expect(history.transactions[0]?.changes).toHaveLength(4);
    expect(history.transactions[0]?.commitCount).toBe(1);
    expect(history.transactions[0]?.rollbackCount).toBe(0);
    expect(previews.at(-1)).toBeNull();
    expect(runtime.capturedPointerId()).toBeNull();
  });

  it("treats a normalized lost-capture cancel as rollback, never a history entry", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const events: string[] = [];
    let cancelCount = 0;
    const tool: Tool = {
      id: "cancel-fixture",
      pointer: (pointer, context) => {
        events.push(`pointer:${pointer.phase}`);
        if (pointer.phase === "down") {
          context.history.begin("cancelled stroke").recordApplied(change("staged", events));
          context.setPreview(preview(8));
          return { handled: true, capturePointer: true };
        }
        return { handled: true };
      },
      cancel: () => {
        cancelCount += 1;
        events.push("tool:cancel");
      },
    };
    const runtime = new ToolRuntime(fakeContext(history, previews));
    runtime.tools.register(tool);
    runtime.tools.activate(tool.id);

    runtime.dispatch(sample("down", 1));
    expect(runtime.dispatch(sample("cancel", 2))).toEqual({
      handled: true,
      releasePointer: true,
    });
    runtime.cancel();

    expect(events).toEqual([
      "pointer:down",
      "pointer:cancel",
      "tool:cancel",
      "revert:staged",
    ]);
    expect(cancelCount).toBe(1);
    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(previews.at(-1)).toBeNull();
    expect(runtime.capturedPointerId()).toBeNull();
  });

  it("uses tool switches and active unregister as the same cancel cleanup path", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const lifecycle: string[] = [];
    const createTool = (id: string): Tool => ({
      id,
      activate: (context) => lifecycle.push(`activate:${id}:${context === activeContext}`),
      deactivate: (context) => lifecycle.push(`deactivate:${id}:${context === activeContext}`),
      pointer: (pointer, context) => {
        activeContext = context;
        if (pointer.phase === "down") {
          context.history.begin(id);
          context.setPreview(preview(1));
          return { handled: true, capturePointer: true };
        }
        return { handled: true };
      },
      cancel: (context) => lifecycle.push(`cancel:${id}:${context === activeContext}`),
    });
    let activeContext: ToolContext | null = null;
    const first = createTool("first");
    const second = createTool("second");
    const runtime = new ToolRuntime(fakeContext(history, previews));
    runtime.tools.register(first);
    runtime.tools.register(second);

    runtime.tools.activate(first.id);
    runtime.dispatch(sample("down", 1));
    runtime.tools.activate(second.id);

    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(runtime.capturedPointerId()).toBeNull();
    expect(previews.at(-1)).toBeNull();
    expect(lifecycle).toEqual([
      "activate:first:false",
      "cancel:first:true",
      "deactivate:first:true",
      "activate:second:true",
    ]);

    runtime.dispatch(sample("down", 2));
    runtime.tools.unregister(second.id);
    expect(history.transactions[1]?.rollbackCount).toBe(1);
    expect(runtime.tools.active()).toBeNull();
    expect(lifecycle.slice(-2)).toEqual(["cancel:second:true", "deactivate:second:true"]);
  });

  it("rolls back and releases capture before rethrowing a tool callback error", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const failure = new Error("fixture pointer failure");
    let cancelCount = 0;
    const tool: Tool = {
      id: "throwing",
      pointer: (pointer, context) => {
        if (pointer.phase === "down") {
          context.history.begin("throwing stroke");
          context.setPreview(preview(3));
          return { handled: true, capturePointer: true };
        }
        throw failure;
      },
      cancel: () => {
        cancelCount += 1;
      },
    };
    const runtime = new ToolRuntime(fakeContext(history, previews));
    runtime.tools.register(tool);
    runtime.tools.activate(tool.id);
    runtime.dispatch(sample("down", 1));

    expect(() => runtime.dispatch(sample("move", 2))).toThrow(failure);
    expect(cancelCount).toBe(1);
    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(previews.at(-1)).toBeNull();
    expect(runtime.capturedPointerId()).toBeNull();
  });

  it("disposes an active gesture through cancel, rollback, release, then deactivate", () => {
    const history = new FakeHistoryService();
    const previews: Array<ToolPreview | null> = [];
    const lifecycle: string[] = [];
    const tool: Tool = {
      id: "disposable",
      pointer: (pointer, context) => {
        if (pointer.phase === "down") {
          context.history.begin("dispose fixture");
          context.setPreview(preview(4));
          return { handled: true, capturePointer: true };
        }
        return { handled: true };
      },
      cancel: () => lifecycle.push("cancel"),
      deactivate: () => lifecycle.push("deactivate"),
    };
    const runtime = new ToolRuntime(fakeContext(history, previews));
    runtime.tools.register(tool);
    runtime.tools.activate(tool.id);
    runtime.dispatch(sample("down", 1));

    runtime.dispose();
    runtime.dispose();

    expect(lifecycle).toEqual(["cancel", "deactivate"]);
    expect(history.transactions[0]?.commitCount).toBe(0);
    expect(history.transactions[0]?.rollbackCount).toBe(1);
    expect(previews.at(-1)).toBeNull();
    expect(runtime.capturedPointerId()).toBeNull();
    expect(() => runtime.dispatch(sample("down", 2))).toThrow("Tool runtime is disposed");
  });
});
