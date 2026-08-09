import { describe, expect, it } from "vitest";

import { PointerCaptureState } from "../../../src/tools/runtime/pointer-capture-state";

describe("PointerCaptureState", () => {
  it("grants one pointer exclusive logical ownership", () => {
    const state = new PointerCaptureState();

    expect(state.capturedPointerId()).toBeNull();
    expect(state.capture(7)).toBe(true);
    expect(state.capturedPointerId()).toBe(7);
    expect(state.owns(7)).toBe(true);
    expect(state.owns(8)).toBe(false);

    expect(state.capture(7)).toBe(true);
    expect(state.capture(8)).toBe(false);
    expect(state.capturedPointerId()).toBe(7);
  });

  it("allows only the owning pointer to release capture", () => {
    const state = new PointerCaptureState();
    state.capture(11);

    expect(state.release(12)).toBe(false);
    expect(state.capturedPointerId()).toBe(11);
    expect(state.release(11)).toBe(true);
    expect(state.capturedPointerId()).toBeNull();
    expect(state.release(11)).toBe(false);
  });

  it("resets capture idempotently for programmatic cleanup", () => {
    const state = new PointerCaptureState();
    state.capture(23);

    expect(state.reset()).toBe(23);
    expect(state.capturedPointerId()).toBeNull();
    expect(state.reset()).toBeNull();
  });
});
