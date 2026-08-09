import { describe, expect, it } from "vitest";

import type { PointerKind, PointerPhase, PointerSample, ToolInputResult } from "@octopoly/contracts";

import { PointerRouter } from "../../../src/tools/runtime/pointer-router";

const modifiers = Object.freeze({ alt: true, ctrl: false, meta: true, shift: false });

interface SampleOverrides {
  readonly pointerId?: number;
  readonly pointerType?: PointerKind;
  readonly coalesced?: boolean;
  readonly timestamp?: number;
}

function sample(phase: PointerPhase, overrides: SampleOverrides = {}): PointerSample {
  return Object.freeze({
    pointerId: overrides.pointerId ?? 7,
    pointerType: overrides.pointerType ?? "pen",
    phase,
    isPrimary: true,
    x: 101.25,
    y: 202.5,
    pressure: 0.625,
    tiltX: -17,
    tiltY: 31,
    buttons: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 1,
    modifiers,
    timestamp: overrides.timestamp ?? 10,
    coalesced: overrides.coalesced ?? false,
  });
}

describe("PointerRouter", () => {
  it("delegates down, coalesced moves, move, and up unchanged and in arrival order", () => {
    const received: PointerSample[] = [];
    const router = new PointerRouter((current): ToolInputResult => {
      received.push(current);
      if (current.phase === "down") {
        return { handled: true, capturePointer: true };
      }
      return { handled: true };
    });
    const samples = [
      sample("down", { timestamp: 10 }),
      sample("move", { timestamp: 11, coalesced: true }),
      sample("move", { timestamp: 12, coalesced: true }),
      sample("move", { timestamp: 13 }),
      sample("up", { timestamp: 14 }),
    ];

    const results = samples.map((current) => router.dispatch(current));

    expect(received).toEqual(samples);
    received.forEach((current, index) => expect(current).toBe(samples[index]));
    expect(received.map((current) => current.timestamp)).toEqual([10, 11, 12, 13, 14]);
    expect(received.map((current) => current.coalesced)).toEqual([false, true, true, false, false]);
    expect(results[0]).toEqual({ handled: true, capturePointer: true });
    expect(results[4]).toEqual({ handled: true, releasePointer: true });
    expect(router.capturedPointerId()).toBeNull();
  });

  it("preserves every canonical field across all phases, pointer kinds, and coalesced flags", () => {
    const received: PointerSample[] = [];
    const router = new PointerRouter((current) => {
      received.push(current);
      return { handled: true };
    });
    const samples = [
      sample("down", { pointerType: "pen", timestamp: 1 }),
      sample("move", { pointerType: "touch", timestamp: 2, coalesced: true }),
      sample("up", { pointerType: "mouse", timestamp: 3 }),
      sample("cancel", { pointerType: "pen", timestamp: 4 }),
      sample("hover", { pointerType: "mouse", timestamp: 5 }),
    ];

    samples.forEach((current) => router.dispatch(current));

    expect(received).toEqual(samples);
    expect(received.map((current) => current.phase)).toEqual(["down", "move", "up", "cancel", "hover"]);
    expect(received.map((current) => current.pointerType)).toEqual(["pen", "touch", "mouse", "pen", "mouse"]);
    expect(received[1]).toMatchObject({
      pointerId: 7,
      isPrimary: true,
      x: 101.25,
      y: 202.5,
      pressure: 0.625,
      tiltX: -17,
      tiltY: 31,
      buttons: 1,
      modifiers,
      timestamp: 2,
      coalesced: true,
    });
  });

  it("blocks foreign pointers while preserving the captured owner", () => {
    const received: PointerSample[] = [];
    const router = new PointerRouter((current) => {
      received.push(current);
      return current.phase === "down" ? { handled: true, capturePointer: true } : { handled: true };
    });
    const ownerDown = sample("down", { pointerId: 7 });
    const foreignDown = sample("down", { pointerId: 8 });
    const foreignMove = sample("move", { pointerId: 8 });
    const ownerMove = sample("move", { pointerId: 7 });

    expect(router.dispatch(ownerDown)).toEqual({ handled: true, capturePointer: true });
    expect(router.dispatch(foreignDown)).toEqual({ handled: false });
    expect(router.dispatch(foreignMove)).toEqual({ handled: false });
    expect(router.dispatch(ownerMove)).toEqual({ handled: true });
    expect(received).toEqual([ownerDown, ownerMove]);
    expect(router.capturedPointerId()).toBe(7);
  });

  it.each(["up", "cancel"] satisfies ReadonlyArray<PointerPhase>)(
    "automatically releases the owning pointer on %s",
    (terminalPhase) => {
      const router = new PointerRouter((current) =>
        current.phase === "down" ? { handled: true, capturePointer: true } : { handled: true },
      );

      router.dispatch(sample("down", { pointerId: 3 }));
      expect(router.dispatch(sample(terminalPhase, { pointerId: 3 }))).toEqual({
        handled: true,
        releasePointer: true,
      });
      expect(router.capturedPointerId()).toBeNull();
    },
  );

  it("honors explicit release only for the captured pointer", () => {
    const router = new PointerRouter((current) => {
      if (current.phase === "down") {
        return { handled: true, capturePointer: true };
      }
      return { handled: true, releasePointer: true };
    });

    router.dispatch(sample("down", { pointerId: 19 }));
    expect(router.dispatch(sample("move", { pointerId: 19 }))).toEqual({ handled: true, releasePointer: true });
    expect(router.capturedPointerId()).toBeNull();

    expect(router.dispatch(sample("move", { pointerId: 20 }))).toEqual({ handled: true });
  });

  it("supports logical lost-capture release and programmatic reset without a raw event", () => {
    const router = new PointerRouter((current) =>
      current.phase === "down" ? { handled: true, capturePointer: true } : { handled: true },
    );

    router.dispatch(sample("down", { pointerId: 29 }));
    expect(router.releasePointer(30)).toBe(false);
    expect(router.releasePointer(29)).toBe(true);
    expect(router.capturedPointerId()).toBeNull();

    router.dispatch(sample("down", { pointerId: 31 }));
    expect(router.resetCapture()).toBe(31);
    expect(router.resetCapture()).toBeNull();
  });

  it("clears logical capture and rethrows a delegate exception", () => {
    const expected = new Error("tool pointer failed");
    const router = new PointerRouter((current) => {
      if (current.phase === "down") {
        return { handled: true, capturePointer: true };
      }
      throw expected;
    });

    router.dispatch(sample("down"));
    expect(() => router.dispatch(sample("move"))).toThrow(expected);
    expect(router.capturedPointerId()).toBeNull();
  });
});
