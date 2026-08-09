import type { ReversibleChange } from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import { HistoryStack } from "../../src/history/history-stack";

function fakeEntry(label: string): ReversibleChange {
  return {
    id: `entry:${label}`,
    label,
    apply: vi.fn(),
    revert: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("HistoryStack", () => {
  it("moves entries between undo and redo without calling unavailable operations", () => {
    const stack = new HistoryStack();
    const first = fakeEntry("First");
    const second = fakeEntry("Second");

    expect(stack.undo()).toBe(false);
    expect(stack.redo()).toBe(false);
    expect(stack.snapshot()).toEqual({ canUndo: false, canRedo: false });

    stack.record(first);
    stack.record(second);
    expect(stack.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Second",
    });

    expect(stack.undo()).toBe(true);
    expect(second.revert).toHaveBeenCalledTimes(1);
    expect(stack.snapshot()).toEqual({
      canUndo: true,
      canRedo: true,
      undoLabel: "First",
      redoLabel: "Second",
    });

    expect(stack.redo()).toBe(true);
    expect(second.apply).toHaveBeenCalledTimes(1);
    expect(stack.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Second",
    });
  });

  it("truncates and disposes the redo branch when recording a new entry", () => {
    const stack = new HistoryStack();
    const discarded = fakeEntry("Discarded");
    const replacement = fakeEntry("Replacement");

    stack.record(discarded);
    stack.undo();
    stack.record(replacement);

    expect(discarded.dispose).toHaveBeenCalledTimes(1);
    expect(stack.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Replacement",
    });
  });

  it("clears both branches and disposes every retained entry", () => {
    const stack = new HistoryStack();
    const undoEntry = fakeEntry("Undo");
    const redoEntry = fakeEntry("Redo");

    stack.record(undoEntry);
    stack.record(redoEntry);
    stack.undo();
    stack.clear();

    expect(undoEntry.dispose).toHaveBeenCalledTimes(1);
    expect(redoEntry.dispose).toHaveBeenCalledTimes(1);
    expect(stack.snapshot()).toEqual({ canUndo: false, canRedo: false });
  });

  it("does not mutate stack state when an entry rejects an invalid lifecycle", () => {
    const stack = new HistoryStack();
    const invalid = fakeEntry("Invalid");
    vi.mocked(invalid.revert).mockImplementation(() => {
      throw new Error("invalid lifecycle");
    });

    stack.record(invalid);

    expect(() => stack.undo()).toThrow("invalid lifecycle");
    expect(stack.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Invalid",
    });
  });

  it("returns frozen immutable snapshots", () => {
    const stack = new HistoryStack();
    stack.record(fakeEntry("Frozen"));

    expect(Object.isFrozen(stack.snapshot())).toBe(true);
  });
});
