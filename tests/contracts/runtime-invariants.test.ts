import { describe, expect, it } from "vitest";

import type {
  Disposable,
  HistoryTransaction,
  PointerInputSink,
  PointerSample,
  ReversibleChange,
  ToolInputResult,
} from "@octopoly/contracts";
import {
  assertNonNegativeSafeInteger,
  incrementNonNegativeSafeInteger,
  NUMERIC_TOLERANCE_POLICY,
} from "@octopoly/contracts";

const pointerModifiers = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });

function pointerSample(phase: PointerSample["phase"], timestamp: number): PointerSample {
  return Object.freeze({
    pointerId: 7,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: 10,
    y: 20,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    buttons: phase === "up" || phase === "cancel" ? 0 : 1,
    modifiers: pointerModifiers,
    timestamp,
    coalesced: phase === "move",
  });
}

class FakePointerSink implements PointerInputSink {
  readonly samples: PointerSample[] = [];

  dispatch(sample: PointerSample): ToolInputResult {
    this.samples.push(sample);
    if (sample.phase === "down") {
      return { handled: sample.pointerType === "pen", capturePointer: true };
    }
    if (sample.phase === "up" || sample.phase === "cancel") {
      return { handled: sample.pointerType === "pen", releasePointer: true };
    }
    return { handled: sample.pointerType === "pen" };
  }
}

class FakeReversibleChange implements ReversibleChange {
  readonly events: string[];

  constructor(
    readonly id: string,
    readonly label: string,
    events: string[],
  ) {
    this.events = events;
  }

  apply(): void {
    this.events.push(`apply:${this.id}`);
  }

  revert(): void {
    this.events.push(`revert:${this.id}`);
  }
}

class FakeTransaction implements HistoryTransaction {
  readonly changes: ReversibleChange[] = [];
  private closed = false;

  constructor(readonly label: string) {}

  recordApplied(change: ReversibleChange): void {
    if (this.closed) {
      throw new Error("transaction is closed");
    }
    this.changes.push(change);
  }

  commit(): void {
    if (this.closed) {
      throw new Error("transaction is closed");
    }
    this.closed = true;
  }

  rollback(): void {
    if (this.closed) {
      throw new Error("transaction is closed");
    }
    this.closed = true;
    for (let index = this.changes.length - 1; index >= 0; index -= 1) {
      this.changes[index]?.revert();
    }
  }
}

class FakeDisposable implements Disposable {
  disposeCount = 0;
  private disposed = false;

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeCount += 1;
  }
}

class FakeVersionedMutation {
  mutationCount = 0;

  constructor(public version: number) {}

  mutate(): void {
    const next = incrementNonNegativeSafeInteger(this.version, "mesh version");
    this.version = next;
    this.mutationCount += 1;
  }
}

describe("numeric contract invariants", () => {
  it("publishes the exact frozen ADR-0004 tolerance policy", () => {
    expect(NUMERIC_TOLERANCE_POLICY).toEqual({
      absoluteDistance: 1e-9,
      relativeDistance: 1e-9,
      angleRadians: 1e-6,
      normalizedVector: 1e-9,
      barycentric: 1e-7,
      areaScaleFactor: 1e-12,
    });
    expect(Object.isFrozen(NUMERIC_TOLERANCE_POLICY)).toBe(true);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid ID/version value %s",
    (value) => {
      expect(() => assertNonNegativeSafeInteger(value, "id")).toThrow(RangeError);
    },
  );

  it("accepts the complete non-negative safe integer range", () => {
    expect(() => assertNonNegativeSafeInteger(0, "id")).not.toThrow();
    expect(() => assertNonNegativeSafeInteger(Number.MAX_SAFE_INTEGER, "id")).not.toThrow();
  });

  it("detects version overflow before a fake mutation changes state", () => {
    const document = new FakeVersionedMutation(Number.MAX_SAFE_INTEGER);

    expect(() => document.mutate()).toThrow(RangeError);
    expect(document.version).toBe(Number.MAX_SAFE_INTEGER);
    expect(document.mutationCount).toBe(0);
  });
});

describe("fake-based contract lifecycle invariants", () => {
  it("records already-applied changes without applying twice and rolls back in reverse order", () => {
    const events: string[] = [];
    const first = new FakeReversibleChange("first", "first", events);
    const second = new FakeReversibleChange("second", "second", events);
    first.apply();
    second.apply();

    const transaction = new FakeTransaction("stroke");
    transaction.recordApplied(first);
    transaction.recordApplied(second);
    expect(events).toEqual(["apply:first", "apply:second"]);

    transaction.rollback();
    expect(events).toEqual(["apply:first", "apply:second", "revert:second", "revert:first"]);
    expect(() => transaction.commit()).toThrow("transaction is closed");
  });

  it("keeps normalized pointer ordering and exposes capture/release intent", () => {
    const sink = new FakePointerSink();
    const down = sink.dispatch(pointerSample("down", 10));
    const move = sink.dispatch(pointerSample("move", 11));
    const up = sink.dispatch(pointerSample("up", 12));

    expect(down).toEqual({ handled: true, capturePointer: true });
    expect(move).toEqual({ handled: true });
    expect(up).toEqual({ handled: true, releasePointer: true });
    expect(sink.samples.map((sample) => sample.timestamp)).toEqual([10, 11, 12]);
    expect(sink.samples[1]?.coalesced).toBe(true);
  });

  it("permits idempotent disposal", () => {
    const disposable = new FakeDisposable();
    disposable.dispose();
    disposable.dispose();
    expect(disposable.disposeCount).toBe(1);
  });
});
