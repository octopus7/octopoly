import { describe, expect, it } from "vitest";

import {
  DEFAULT_STROKE_PROCESSING_OPTIONS,
  RetopoStrokeProcessor,
  processRetopoStroke,
} from "../../../src/retopo/stroke";
import {
  CANCELLED_STROKE,
  DUPLICATE_TIMESTAMP_STROKE,
  HOVER_ONLY_STROKE,
  ORDERED_COALESCED_STROKE,
  SPARSE_STROKE,
  ZERO_LENGTH_STROKE,
  strokeInput,
} from "../fixtures/strokes/canonical-strokes";

describe("deterministic retopo stroke processing", () => {
  it("preserves canonical input identity and timestamp order while suppressing sub-floor noise", () => {
    const processed = processRetopoStroke(ORDERED_COALESCED_STROKE);

    expect(processed.map(({ sample }) => sample.timestamp)).toEqual([100, 102, 103, 104]);
    expect(processed.map(({ sample }) => sample.coalesced)).toEqual([false, true, false, false]);
    expect(processed[0]).toBe(ORDERED_COALESCED_STROKE[0]);
    expect(processed[1]).toBe(ORDERED_COALESCED_STROKE[2]);
    expect(Object.isFrozen(processed)).toBe(true);
  });

  it("produces byte-identical output across repeated replay and arbitrary dispatch batches", () => {
    const expected = JSON.stringify(processRetopoStroke(ORDERED_COALESCED_STROKE));
    const processor = new RetopoStrokeProcessor();

    for (const input of ORDERED_COALESCED_STROKE.slice(0, 2)) {
      processor.update(input);
    }
    for (const input of ORDERED_COALESCED_STROKE.slice(2)) {
      processor.update(input);
    }

    expect(JSON.stringify(processor.snapshot())).toBe(expected);
    expect(JSON.stringify(processRetopoStroke(ORDERED_COALESCED_STROKE))).toBe(expected);
  });

  it("preserves stable arrival order for distinct coalesced samples with duplicate timestamps", () => {
    const processed = processRetopoStroke(DUPLICATE_TIMESTAMP_STROKE, {
      sampleSpacingCssPx: 0,
      noiseFloorCssPx: 0,
      smoothingStrength: 0,
    });

    expect(processed).toEqual(DUPLICATE_TIMESTAMP_STROKE);
    expect(processed.map(({ sample }) => sample.timestamp)).toEqual([200, 201, 201, 202]);
    expect(processed.map(({ sample }) => sample.x)).toEqual([0, 3, 6, 9]);
  });

  it("uses centered smoothing deterministically for resampling without fabricating inputs", () => {
    const zigzag = Object.freeze([
      strokeInput({ phase: "down", timestamp: 700, x: 0, y: 0 }),
      strokeInput({ phase: "move", timestamp: 701, x: 1, y: 4, coalesced: true }),
      strokeInput({ phase: "move", timestamp: 702, x: 2, y: -4, coalesced: true }),
      strokeInput({ phase: "up", timestamp: 703, x: 3, y: 0 }),
    ]);

    const unsmoothed = processRetopoStroke(zigzag, {
      sampleSpacingCssPx: 2.5,
      noiseFloorCssPx: 0,
      smoothingStrength: 0,
    });
    const smoothed = processRetopoStroke(zigzag, {
      sampleSpacingCssPx: 2.5,
      noiseFloorCssPx: 0,
      smoothingStrength: 1,
    });

    expect(unsmoothed).toHaveLength(4);
    expect(smoothed).toEqual([zigzag[0], zigzag[3]]);
  });
});

describe("retopo stroke lifecycle and edge cases", () => {
  it("returns no accepted sequence for empty, hover-only, cancelled, or zero-length strokes", () => {
    expect(processRetopoStroke([])).toEqual([]);
    expect(processRetopoStroke(HOVER_ONLY_STROKE)).toEqual([]);
    expect(processRetopoStroke(CANCELLED_STROKE)).toEqual([]);
    expect(processRetopoStroke(ZERO_LENGTH_STROKE)).toEqual([]);
  });

  it("retains sparse down/up endpoints and leaves a supplied surface miss intact", () => {
    const withMiss = Object.freeze([
      SPARSE_STROKE[0]!,
      strokeInput({ phase: "up", timestamp: 401, x: 20, surfaceMiss: true }),
    ]);
    const processed = processRetopoStroke(withMiss);

    expect(processed).toHaveLength(2);
    expect(processed[0]).toBe(withMiss[0]);
    expect(processed[1]).toBe(withMiss[1]);
    expect(processed[1]?.surfaceHit).toBeNull();
  });

  it("ignores non-primary and non-pen input rather than starting a modeling stroke", () => {
    expect(
      processRetopoStroke([
        strokeInput({ phase: "down", timestamp: 800, x: 0, pointerType: "touch" }),
        strokeInput({ phase: "up", timestamp: 801, x: 3, pointerType: "touch" }),
      ]),
    ).toEqual([]);
    expect(
      processRetopoStroke([
        strokeInput({ phase: "down", timestamp: 810, x: 0, isPrimary: false }),
        strokeInput({ phase: "up", timestamp: 811, x: 3, isPrimary: false }),
      ]),
    ).toEqual([]);
  });

  it("rejects decreasing timestamps before changing the captured snapshot", () => {
    const processor = new RetopoStrokeProcessor({ sampleSpacingCssPx: 0 });
    const down = strokeInput({ phase: "down", timestamp: 900, x: 0 });
    const lateMove = strokeInput({ phase: "move", timestamp: 899, x: 2, coalesced: true });
    const validMove = strokeInput({ phase: "move", timestamp: 901, x: 3, coalesced: true });

    processor.update(down);
    expect(() => processor.update(lateMove)).toThrow(RangeError);
    expect(processor.snapshot()).toEqual([down]);
    expect(processor.update(validMove)).toEqual([down, validMove]);
  });

  it("rejects non-finite canonical input before changing state", () => {
    const processor = new RetopoStrokeProcessor({ sampleSpacingCssPx: 0 });
    const down = strokeInput({ phase: "down", timestamp: 950, x: 0 });
    const invalid = strokeInput({ phase: "move", timestamp: 951, x: Number.NaN });

    processor.update(down);
    expect(() => processor.update(invalid)).toThrow("sample.x must be finite");
    expect(processor.snapshot()).toEqual([down]);
  });

  it("makes cancel and dispose idempotent and rejects later updates", () => {
    const cancelled = new RetopoStrokeProcessor();
    cancelled.update(strokeInput({ phase: "down", timestamp: 1_000, x: 0 }));
    cancelled.cancel();
    cancelled.cancel();
    expect(cancelled.snapshot()).toEqual([]);
    expect(() => cancelled.update(strokeInput({ phase: "move", timestamp: 1_001, x: 3 }))).toThrow(
      "retopo stroke is cancelled",
    );

    const disposed = new RetopoStrokeProcessor();
    disposed.dispose();
    disposed.dispose();
    expect(() => disposed.update(strokeInput({ phase: "down", timestamp: 1_010, x: 0 }))).toThrow(
      "retopo stroke processor is disposed",
    );
  });

  it("validates processing options and publishes immutable defaults", () => {
    expect(Object.isFrozen(DEFAULT_STROKE_PROCESSING_OPTIONS)).toBe(true);
    expect(() => new RetopoStrokeProcessor({ sampleSpacingCssPx: -1 })).toThrow(RangeError);
    expect(() => new RetopoStrokeProcessor({ smoothingStrength: 1.1 })).toThrow(RangeError);
  });
});
