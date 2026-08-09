import type { RetopoStrokeInput } from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

export interface StrokeProcessingOptions {
  /** Minimum accumulated screen-space travel before retaining another move sample. */
  readonly sampleSpacingCssPx: number;
  /** Screen-space jitter floor. This is algorithm tuning, not a geometry epsilon. */
  readonly noiseFloorCssPx: number;
  /** Blend from the captured point toward a centered three-point average. */
  readonly smoothingStrength: number;
}

export const DEFAULT_STROKE_PROCESSING_OPTIONS: Readonly<StrokeProcessingOptions> = Object.freeze({
  sampleSpacingCssPx: 2,
  noiseFloorCssPx: 0.25,
  smoothingStrength: 0.5,
});

type StrokeState = "idle" | "active" | "complete" | "cancelled" | "disposed";

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

const EMPTY_STROKE: ReadonlyArray<RetopoStrokeInput> = Object.freeze([]);

/**
 * Collects one normalized pen stroke and exposes a deterministic, canonical-input snapshot.
 *
 * Rays and supplied surface hits are never interpolated. Resampling only selects captured
 * `RetopoStrokeInput` values, so the next stage observes exactly the adapter-provided data.
 */
export class RetopoStrokeProcessor {
  readonly #options: Readonly<StrokeProcessingOptions>;
  readonly #captured: RetopoStrokeInput[] = [];
  #state: StrokeState = "idle";
  #pointerId: number | null = null;
  #lastTimestamp: number | null = null;
  #snapshot: ReadonlyArray<RetopoStrokeInput> = EMPTY_STROKE;

  constructor(options: Partial<StrokeProcessingOptions> = {}) {
    this.#options = resolveOptions(options);
  }

  update(input: RetopoStrokeInput): ReadonlyArray<RetopoStrokeInput> {
    validateInput(input);
    this.#assertOpen();

    const { sample } = input;
    if (sample.pointerType !== "pen" || !sample.isPrimary) {
      return this.#snapshot;
    }

    if (this.#state === "idle") {
      if (sample.phase !== "down") {
        return this.#snapshot;
      }

      this.#state = "active";
      this.#pointerId = sample.pointerId;
      this.#lastTimestamp = sample.timestamp;
      this.#captured.push(input);
      this.#snapshot = selectCapturedSamples(this.#captured, this.#options, false);
      return this.#snapshot;
    }

    if (sample.pointerId !== this.#pointerId) {
      return this.#snapshot;
    }

    if (sample.phase === "hover") {
      return this.#snapshot;
    }
    if (sample.phase === "down") {
      throw new Error("a retopo stroke cannot receive a second down phase");
    }

    const lastTimestamp = this.#lastTimestamp;
    if (lastTimestamp !== null && sample.timestamp < lastTimestamp) {
      throw new RangeError("retopo stroke timestamps must be monotonic");
    }

    if (sample.phase === "cancel") {
      this.cancel();
      return this.#snapshot;
    }

    this.#captured.push(input);
    this.#lastTimestamp = sample.timestamp;
    const completed = sample.phase === "up";
    this.#snapshot = selectCapturedSamples(this.#captured, this.#options, completed);
    if (completed) {
      this.#state = "complete";
    }
    return this.#snapshot;
  }

  snapshot(): ReadonlyArray<RetopoStrokeInput> {
    return this.#snapshot;
  }

  cancel(): void {
    if (this.#state === "cancelled" || this.#state === "disposed") {
      return;
    }
    if (this.#state === "complete") {
      return;
    }
    this.#captured.length = 0;
    this.#snapshot = EMPTY_STROKE;
    this.#pointerId = null;
    this.#lastTimestamp = null;
    this.#state = "cancelled";
  }

  dispose(): void {
    if (this.#state === "disposed") {
      return;
    }
    this.#captured.length = 0;
    this.#snapshot = EMPTY_STROKE;
    this.#pointerId = null;
    this.#lastTimestamp = null;
    this.#state = "disposed";
  }

  #assertOpen(): void {
    if (this.#state === "complete") {
      throw new Error("retopo stroke is already complete");
    }
    if (this.#state === "cancelled") {
      throw new Error("retopo stroke is cancelled");
    }
    if (this.#state === "disposed") {
      throw new Error("retopo stroke processor is disposed");
    }
  }
}

export function processRetopoStroke(
  inputs: ReadonlyArray<RetopoStrokeInput>,
  options: Partial<StrokeProcessingOptions> = {},
): ReadonlyArray<RetopoStrokeInput> {
  const processor = new RetopoStrokeProcessor(options);
  let result = processor.snapshot();

  for (const input of inputs) {
    result = processor.update(input);
    if (
      input.sample.pointerType === "pen" &&
      input.sample.isPrimary &&
      (input.sample.phase === "up" || input.sample.phase === "cancel")
    ) {
      break;
    }
  }

  return result;
}

function resolveOptions(options: Partial<StrokeProcessingOptions>): Readonly<StrokeProcessingOptions> {
  const resolved = {
    sampleSpacingCssPx: options.sampleSpacingCssPx ?? DEFAULT_STROKE_PROCESSING_OPTIONS.sampleSpacingCssPx,
    noiseFloorCssPx: options.noiseFloorCssPx ?? DEFAULT_STROKE_PROCESSING_OPTIONS.noiseFloorCssPx,
    smoothingStrength: options.smoothingStrength ?? DEFAULT_STROKE_PROCESSING_OPTIONS.smoothingStrength,
  };

  assertFiniteNonNegative(resolved.sampleSpacingCssPx, "sampleSpacingCssPx");
  assertFiniteNonNegative(resolved.noiseFloorCssPx, "noiseFloorCssPx");
  if (
    !Number.isFinite(resolved.smoothingStrength) ||
    resolved.smoothingStrength < 0 ||
    resolved.smoothingStrength > 1
  ) {
    throw new RangeError("smoothingStrength must be finite and within 0..1");
  }

  return Object.freeze(resolved);
}

function validateInput(input: RetopoStrokeInput): void {
  const { sample, ray, surfaceHit } = input;
  if (!Number.isSafeInteger(sample.pointerId) || sample.pointerId < 0) {
    throw new RangeError("pointerId must be a non-negative safe integer");
  }

  assertFinite(sample.x, "sample.x");
  assertFinite(sample.y, "sample.y");
  assertFinite(sample.pressure, "sample.pressure");
  assertFinite(sample.tiltX, "sample.tiltX");
  assertFinite(sample.tiltY, "sample.tiltY");
  assertFinite(sample.timestamp, "sample.timestamp");
  if (sample.pressure < 0 || sample.pressure > 1) {
    throw new RangeError("sample.pressure must be within 0..1");
  }

  assertFiniteVector(ray.origin, "ray.origin");
  assertFiniteVector(ray.direction, "ray.direction");
  if (surfaceHit !== null) {
    assertFiniteVector(surfaceHit.position, "surfaceHit.position");
    assertFiniteVector(surfaceHit.normal, "surfaceHit.normal");
    assertFiniteVector(surfaceHit.barycentric, "surfaceHit.barycentric");
    assertFinite(surfaceHit.distance, "surfaceHit.distance");
  }
}

function selectCapturedSamples(
  captured: ReadonlyArray<RetopoStrokeInput>,
  options: Readonly<StrokeProcessingOptions>,
  completed: boolean,
): ReadonlyArray<RetopoStrokeInput> {
  const first = captured[0];
  if (first === undefined) {
    return EMPTY_STROKE;
  }

  const noiseFiltered: RetopoStrokeInput[] = [first];
  for (let index = 1; index < captured.length; index += 1) {
    const current = captured[index];
    if (current === undefined) {
      continue;
    }

    const isTerminal = completed && index === captured.length - 1;
    const previous = noiseFiltered[noiseFiltered.length - 1];
    if (previous === undefined || isTerminal || !withinNoiseFloor(previous, current, options.noiseFloorCssPx)) {
      noiseFiltered.push(current);
    }
  }

  if (completed && pathIsDegenerate(noiseFiltered)) {
    return EMPTY_STROKE;
  }
  if (noiseFiltered.length <= 2 || options.sampleSpacingCssPx === 0) {
    return Object.freeze([...noiseFiltered]);
  }

  const smoothed = smoothScreenPoints(noiseFiltered, options.smoothingStrength);
  const accepted: RetopoStrokeInput[] = [noiseFiltered[0] as RetopoStrokeInput];
  let accumulatedDistance = 0;

  for (let index = 1; index < noiseFiltered.length; index += 1) {
    const previousPoint = smoothed[index - 1];
    const point = smoothed[index];
    const input = noiseFiltered[index];
    if (previousPoint === undefined || point === undefined || input === undefined) {
      continue;
    }

    accumulatedDistance += distance(previousPoint, point);
    const isTerminal = completed && index === noiseFiltered.length - 1;
    if (isTerminal || accumulatedDistance >= options.sampleSpacingCssPx) {
      accepted.push(input);
      accumulatedDistance = 0;
    }
  }

  return Object.freeze(accepted);
}

function withinNoiseFloor(
  first: RetopoStrokeInput,
  second: RetopoStrokeInput,
  configuredNoiseFloor: number,
): boolean {
  const firstPoint = first.sample;
  const secondPoint = second.sample;
  const sceneScale = Math.max(
    1,
    Math.abs(firstPoint.x),
    Math.abs(firstPoint.y),
    Math.abs(secondPoint.x),
    Math.abs(secondPoint.y),
  );
  const canonicalDistanceTolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * sceneScale,
  );
  const threshold = Math.max(configuredNoiseFloor, canonicalDistanceTolerance);
  return squaredDistance(firstPoint, secondPoint) <= threshold * threshold;
}

function pathIsDegenerate(inputs: ReadonlyArray<RetopoStrokeInput>): boolean {
  let totalDistance = 0;
  let coordinateScale = 1;

  for (let index = 1; index < inputs.length; index += 1) {
    const previous = inputs[index - 1]?.sample;
    const current = inputs[index]?.sample;
    if (previous === undefined || current === undefined) {
      continue;
    }
    totalDistance += distance(previous, current);
    coordinateScale = Math.max(
      coordinateScale,
      Math.abs(previous.x),
      Math.abs(previous.y),
      Math.abs(current.x),
      Math.abs(current.y),
    );
  }

  const tolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * coordinateScale,
  );
  return totalDistance <= tolerance;
}

function smoothScreenPoints(
  inputs: ReadonlyArray<RetopoStrokeInput>,
  strength: number,
): ReadonlyArray<ScreenPoint> {
  if (strength === 0 || inputs.length <= 2) {
    return inputs.map(({ sample }) => ({ x: sample.x, y: sample.y }));
  }

  return inputs.map(({ sample }, index) => {
    const previous = inputs[index - 1]?.sample;
    const next = inputs[index + 1]?.sample;
    if (previous === undefined || next === undefined) {
      return { x: sample.x, y: sample.y };
    }

    const averagedX = (previous.x + sample.x + next.x) / 3;
    const averagedY = (previous.y + sample.y + next.y) / 3;
    return {
      x: sample.x + (averagedX - sample.x) * strength,
      y: sample.y + (averagedY - sample.y) * strength,
    };
  });
}

function distance(first: ScreenPoint, second: ScreenPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function squaredDistance(first: ScreenPoint, second: ScreenPoint): number {
  const x = second.x - first.x;
  const y = second.y - first.y;
  return x * x + y * y;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must be non-negative`);
  }
}

function assertFiniteVector(vector: { readonly x: number; readonly y: number; readonly z: number }, label: string): void {
  assertFinite(vector.x, `${label}.x`);
  assertFinite(vector.y, `${label}.y`);
  assertFinite(vector.z, `${label}.z`);
}
