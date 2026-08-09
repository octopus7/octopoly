import type { PointerKind, PointerPhase, RetopoStrokeInput } from "@octopoly/contracts";

const MODIFIERS = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });

interface StrokeInputFixtureOptions {
  readonly phase: PointerPhase;
  readonly timestamp: number;
  readonly x: number;
  readonly y?: number;
  readonly pointerId?: number;
  readonly pointerType?: PointerKind;
  readonly isPrimary?: boolean;
  readonly coalesced?: boolean;
  readonly surfaceMiss?: boolean;
}

export function strokeInput(options: StrokeInputFixtureOptions): RetopoStrokeInput {
  const y = options.y ?? 0;
  const phase = options.phase;
  return Object.freeze({
    sample: Object.freeze({
      pointerId: options.pointerId ?? 17,
      pointerType: options.pointerType ?? "pen",
      phase,
      isPrimary: options.isPrimary ?? true,
      x: options.x,
      y,
      pressure: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 0.625,
      tiltX: 12,
      tiltY: -8,
      buttons: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 1,
      modifiers: MODIFIERS,
      timestamp: options.timestamp,
      coalesced: options.coalesced ?? false,
    }),
    ray: Object.freeze({
      origin: Object.freeze({ x: options.x, y, z: 10 }),
      direction: Object.freeze({ x: 0, y: 0, z: -1 }),
    }),
    surfaceHit: options.surfaceMiss
      ? null
      : Object.freeze({
          surfaceId: "fixture-surface",
          triangleId: 3,
          position: Object.freeze({ x: options.x, y, z: 0 }),
          normal: Object.freeze({ x: 0, y: 0, z: 1 }),
          barycentric: Object.freeze({ x: 0.25, y: 0.25, z: 0.5 }),
          distance: 10,
        }),
  });
}

export const ORDERED_COALESCED_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([
  strokeInput({ phase: "down", timestamp: 100, x: 0 }),
  strokeInput({ phase: "move", timestamp: 101, x: 0.1, coalesced: true }),
  strokeInput({ phase: "move", timestamp: 102, x: 3, coalesced: true }),
  strokeInput({ phase: "move", timestamp: 103, x: 6 }),
  strokeInput({ phase: "up", timestamp: 104, x: 9 }),
]);

export const DUPLICATE_TIMESTAMP_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([
  strokeInput({ phase: "down", timestamp: 200, x: 0 }),
  strokeInput({ phase: "move", timestamp: 201, x: 3, coalesced: true }),
  strokeInput({ phase: "move", timestamp: 201, x: 6 }),
  strokeInput({ phase: "up", timestamp: 202, x: 9 }),
]);

export const ZERO_LENGTH_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([
  strokeInput({ phase: "down", timestamp: 300, x: 4, y: 5 }),
  strokeInput({ phase: "move", timestamp: 301, x: 4, y: 5, coalesced: true }),
  strokeInput({ phase: "up", timestamp: 302, x: 4, y: 5 }),
]);

export const SPARSE_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([
  strokeInput({ phase: "down", timestamp: 400, x: 0 }),
  strokeInput({ phase: "up", timestamp: 401, x: 20 }),
]);

export const CANCELLED_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([
  strokeInput({ phase: "down", timestamp: 500, x: 0 }),
  strokeInput({ phase: "move", timestamp: 501, x: 4, coalesced: true }),
  strokeInput({ phase: "cancel", timestamp: 502, x: 4 }),
]);

export const HOVER_ONLY_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([
  strokeInput({ phase: "hover", timestamp: 600, x: 1 }),
  strokeInput({ phase: "hover", timestamp: 601, x: 2 }),
]);
