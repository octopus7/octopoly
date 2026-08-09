/**
 * A projected brush sample in image-space pixels.
 *
 * Samples deliberately do not contain DOM or mesh values. Projection is owned by the
 * texture-paint target boundary and supplies these finite image-space coordinates.
 */
export interface BrushSample {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly timestamp: number;
  readonly coalesced?: boolean;
}

export interface BrushSettings {
  /** Base radius in image-space pixels. */
  readonly radiusPx: number;
  /** Fully opaque inner-radius ratio. */
  readonly hardness: number;
  /** Base stamp opacity. */
  readonly opacity: number;
  /** Arc-length distance between interpolated stamps in image-space pixels. */
  readonly spacingPx: number;
  /** Linear pressure influence on radius: 0 disables it and 1 maps pressure directly. */
  readonly pressureRadius: number;
  /** Linear pressure influence on opacity: 0 disables it and 1 maps pressure directly. */
  readonly pressureOpacity: number;
  /** Used when a projected input (for example a mouse sample) has no pressure. */
  readonly defaultPressure: number;
}

export interface PressureMapping {
  readonly pressure: number;
  readonly radiusPx: number;
  readonly opacity: number;
}

export interface BrushStamp extends PressureMapping {
  readonly x: number;
  readonly y: number;
  readonly timestamp: number;
  readonly hardness: number;
}

export type PremultipliedRgba8 = readonly [red: number, green: number, blue: number, alpha: number];

export type BrushBlendMode = "paint" | "erase";

export const DEFAULT_BRUSH_SETTINGS: Readonly<BrushSettings> = Object.freeze({
  radiusPx: 12,
  hardness: 0.75,
  opacity: 1,
  spacingPx: 3,
  pressureRadius: 0.75,
  pressureOpacity: 1,
  defaultPressure: 0.5,
});

/** A defensive limit for a single pure expansion, before allocating the stamp array. */
export const MAX_BRUSH_STAMPS = 1_000_000;

const EMPTY_STAMPS: ReadonlyArray<BrushStamp> = Object.freeze([]);

interface CanonicalBrushSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestamp: number;
}

interface IndexedCanonicalBrushSample {
  readonly sample: CanonicalBrushSample;
  readonly originalIndex: number;
}

/**
 * Pure deterministic brush calculations. Replaying the same timestamp-ordered dispatch
 * sequence produces the same immutable stamp stream. Equal timestamps preserve dispatch order.
 */
export class BrushEngine {
  readonly settings: Readonly<BrushSettings>;

  constructor(settings: Partial<BrushSettings> = {}) {
    this.settings = resolveBrushSettings(settings);
  }

  /**
   * Expands projected samples at fixed arc-length spacing while preserving both spatial
   * endpoints. Output timestamps are monotonic because input is timestamp-sorted while equal
   * timestamps retain their normalized dispatch order.
   */
  generateStamps(samples: ReadonlyArray<BrushSample>): ReadonlyArray<BrushStamp> {
    const canonical = canonicalizeSamples(samples, this.settings.defaultPressure);
    const first = canonical[0];
    if (first === undefined) {
      return EMPTY_STAMPS;
    }

    const cumulativeDistances: number[] = [0];
    let totalDistance = 0;
    for (let index = 1; index < canonical.length; index += 1) {
      const previous = canonical[index - 1];
      const current = canonical[index];
      if (previous === undefined || current === undefined) {
        continue;
      }

      const segmentDistance = Math.hypot(current.x - previous.x, current.y - previous.y);
      if (!Number.isFinite(segmentDistance) || !Number.isFinite(totalDistance + segmentDistance)) {
        throw new RangeError("brush sample path length must be finite");
      }
      totalDistance += segmentDistance;
      cumulativeDistances.push(totalDistance);
    }

    if (totalDistance === 0) {
      return Object.freeze([createStamp(first, this.settings)]);
    }

    const maximumStampCount = Math.ceil(totalDistance / this.settings.spacingPx) + 1;
    if (!Number.isSafeInteger(maximumStampCount) || maximumStampCount > MAX_BRUSH_STAMPS) {
      throw new RangeError(`brush stroke exceeds the ${MAX_BRUSH_STAMPS} stamp limit`);
    }

    const stamps: BrushStamp[] = [createStamp(first, this.settings)];
    let segmentIndex = 1;
    for (let stampIndex = 1; stampIndex * this.settings.spacingPx < totalDistance; stampIndex += 1) {
      const targetDistance = stampIndex * this.settings.spacingPx;
      while (
        segmentIndex < cumulativeDistances.length &&
        ((cumulativeDistances[segmentIndex] as number) < targetDistance ||
          (cumulativeDistances[segmentIndex] as number) ===
            (cumulativeDistances[segmentIndex - 1] as number))
      ) {
        segmentIndex += 1;
      }

      const current = canonical[segmentIndex];
      const previous = canonical[segmentIndex - 1];
      const segmentEnd = cumulativeDistances[segmentIndex];
      const segmentStart = cumulativeDistances[segmentIndex - 1];
      if (
        current === undefined ||
        previous === undefined ||
        segmentEnd === undefined ||
        segmentStart === undefined ||
        segmentEnd <= segmentStart
      ) {
        throw new Error("brush spacing invariant was violated");
      }

      const interpolation = (targetDistance - segmentStart) / (segmentEnd - segmentStart);
      stamps.push(createStamp(interpolateSample(previous, current, interpolation), this.settings));
    }

    const last = canonical[canonical.length - 1];
    if (last === undefined) {
      throw new Error("brush endpoint invariant was violated");
    }
    stamps.push(createStamp(last, this.settings));
    return Object.freeze(stamps);
  }

  coverageAt(stamp: BrushStamp, x: number, y: number): number {
    assertFinite(x, "x");
    assertFinite(y, "y");
    const distancePx = Math.hypot(x - stamp.x, y - stamp.y);
    return brushCoverage(distancePx, stamp.radiusPx, stamp.hardness);
  }

  blendPixel(
    destination: PremultipliedRgba8,
    source: PremultipliedRgba8,
    stamp: BrushStamp,
    x: number,
    y: number,
    mode: BrushBlendMode = "paint",
  ): PremultipliedRgba8 {
    if (mode !== "paint" && mode !== "erase") {
      throw new RangeError("mode must be paint or erase");
    }
    const amount = this.coverageAt(stamp, x, y) * stamp.opacity;
    return mode === "erase"
      ? erasePremultipliedRgba(destination, amount)
      : blendPremultipliedRgba(destination, source, amount);
  }
}

export function resolveBrushSettings(settings: Partial<BrushSettings>): Readonly<BrushSettings> {
  const resolved: BrushSettings = {
    radiusPx: settings.radiusPx ?? DEFAULT_BRUSH_SETTINGS.radiusPx,
    hardness: settings.hardness ?? DEFAULT_BRUSH_SETTINGS.hardness,
    opacity: settings.opacity ?? DEFAULT_BRUSH_SETTINGS.opacity,
    spacingPx: settings.spacingPx ?? DEFAULT_BRUSH_SETTINGS.spacingPx,
    pressureRadius: settings.pressureRadius ?? DEFAULT_BRUSH_SETTINGS.pressureRadius,
    pressureOpacity: settings.pressureOpacity ?? DEFAULT_BRUSH_SETTINGS.pressureOpacity,
    defaultPressure: settings.defaultPressure ?? DEFAULT_BRUSH_SETTINGS.defaultPressure,
  };

  assertFinitePositive(resolved.radiusPx, "radiusPx");
  assertUnitInterval(resolved.hardness, "hardness");
  assertUnitInterval(resolved.opacity, "opacity");
  assertFinitePositive(resolved.spacingPx, "spacingPx");
  assertUnitInterval(resolved.pressureRadius, "pressureRadius");
  assertUnitInterval(resolved.pressureOpacity, "pressureOpacity");
  assertUnitInterval(resolved.defaultPressure, "defaultPressure");
  return Object.freeze(resolved);
}

/** Clamps normalized pressure while rejecting values that cannot represent input. */
export function clampPressure(pressure: number | undefined, defaultPressure: number): number {
  assertUnitInterval(defaultPressure, "defaultPressure");
  if (pressure === undefined) {
    return defaultPressure;
  }
  assertFinite(pressure, "pressure");
  return Math.min(1, Math.max(0, normalizeNegativeZero(pressure)));
}

export function mapBrushPressure(
  pressure: number | undefined,
  settings: Readonly<BrushSettings>,
): Readonly<PressureMapping> {
  assertFinitePositive(settings.radiusPx, "radiusPx");
  assertUnitInterval(settings.opacity, "opacity");
  assertUnitInterval(settings.pressureRadius, "pressureRadius");
  assertUnitInterval(settings.pressureOpacity, "pressureOpacity");
  const normalized = clampPressure(pressure, settings.defaultPressure);
  const radiusFactor = interpolate(1, normalized, settings.pressureRadius);
  const opacityFactor = interpolate(1, normalized, settings.pressureOpacity);
  return Object.freeze({
    pressure: normalized,
    radiusPx: settings.radiusPx * radiusFactor,
    opacity: settings.opacity * opacityFactor,
  });
}

/** Linear interpolation with an explicit finite `0..1` parameter. */
export function interpolate(start: number, end: number, amount: number): number {
  assertFinite(start, "start");
  assertFinite(end, "end");
  assertUnitInterval(amount, "amount");
  const result = start * (1 - amount) + end * amount;
  if (!Number.isFinite(result)) {
    throw new RangeError("interpolated value must be finite");
  }
  return normalizeNegativeZero(result);
}

/** Returns the radial mask independently from stamp opacity and color. */
export function brushCoverage(distancePx: number, radiusPx: number, hardness: number): number {
  assertFiniteNonNegative(distancePx, "distancePx");
  assertFiniteNonNegative(radiusPx, "radiusPx");
  assertUnitInterval(hardness, "hardness");

  if (radiusPx === 0 || distancePx >= radiusPx) {
    return 0;
  }

  const normalizedDistance = distancePx / radiusPx;
  if (normalizedDistance <= hardness || hardness === 1) {
    return 1;
  }
  return (1 - normalizedDistance) / (1 - hardness);
}

/** Porter-Duff source-over for two byte-encoded premultiplied RGBA colors. */
export function blendPremultipliedRgba(
  destination: PremultipliedRgba8,
  source: PremultipliedRgba8,
  amount = 1,
): PremultipliedRgba8 {
  validatePremultipliedRgba(destination, "destination");
  validatePremultipliedRgba(source, "source");
  assertUnitInterval(amount, "amount");

  const sourceAlpha = (source[3] / 255) * amount;
  const inverseSourceAlpha = 1 - sourceAlpha;
  const alpha = toByte(source[3] * amount + destination[3] * inverseSourceAlpha);
  return freezeRgba(
    Math.min(alpha, toByte(source[0] * amount + destination[0] * inverseSourceAlpha)),
    Math.min(alpha, toByte(source[1] * amount + destination[1] * inverseSourceAlpha)),
    Math.min(alpha, toByte(source[2] * amount + destination[2] * inverseSourceAlpha)),
    alpha,
  );
}

/** Porter-Duff destination-out erase, preserving the premultiplied invariant. */
export function erasePremultipliedRgba(
  destination: PremultipliedRgba8,
  amount = 1,
): PremultipliedRgba8 {
  validatePremultipliedRgba(destination, "destination");
  assertUnitInterval(amount, "amount");
  const retained = 1 - amount;
  const alpha = toByte(destination[3] * retained);
  return freezeRgba(
    Math.min(alpha, toByte(destination[0] * retained)),
    Math.min(alpha, toByte(destination[1] * retained)),
    Math.min(alpha, toByte(destination[2] * retained)),
    alpha,
  );
}

function canonicalizeSamples(
  samples: ReadonlyArray<BrushSample>,
  defaultPressure: number,
): ReadonlyArray<CanonicalBrushSample> {
  const indexed = samples.map((sample, originalIndex): IndexedCanonicalBrushSample => {
    validateSample(sample);
    return Object.freeze({
      sample: Object.freeze({
        x: normalizeNegativeZero(sample.x),
        y: normalizeNegativeZero(sample.y),
        pressure: clampPressure(sample.pressure, defaultPressure),
        timestamp: normalizeNegativeZero(sample.timestamp),
      }),
      originalIndex,
    });
  });

  indexed.sort(compareCanonicalSamples);
  const unique: CanonicalBrushSample[] = [];
  for (const { sample } of indexed) {
    const previous = unique[unique.length - 1];
    if (
      previous === undefined ||
      sample.timestamp !== previous.timestamp ||
      sample.x !== previous.x ||
      sample.y !== previous.y ||
      sample.pressure !== previous.pressure
    ) {
      unique.push(sample);
    }
  }
  return Object.freeze(unique);
}

function compareCanonicalSamples(
  left: IndexedCanonicalBrushSample,
  right: IndexedCanonicalBrushSample,
): number {
  return left.sample.timestamp - right.sample.timestamp || left.originalIndex - right.originalIndex;
}

function validateSample(sample: BrushSample): void {
  assertFinite(sample.x, "sample.x");
  assertFinite(sample.y, "sample.y");
  assertFinite(sample.timestamp, "sample.timestamp");
  if (sample.pressure !== undefined) {
    assertFinite(sample.pressure, "sample.pressure");
  }
  if (sample.coalesced !== undefined && typeof sample.coalesced !== "boolean") {
    throw new TypeError("sample.coalesced must be a boolean when provided");
  }
}

function interpolateSample(
  previous: CanonicalBrushSample,
  current: CanonicalBrushSample,
  amount: number,
): CanonicalBrushSample {
  return Object.freeze({
    x: interpolate(previous.x, current.x, amount),
    y: interpolate(previous.y, current.y, amount),
    pressure: interpolate(previous.pressure, current.pressure, amount),
    timestamp: interpolate(previous.timestamp, current.timestamp, amount),
  });
}

function createStamp(sample: CanonicalBrushSample, settings: Readonly<BrushSettings>): BrushStamp {
  const mapped = mapBrushPressure(sample.pressure, settings);
  return Object.freeze({
    x: sample.x,
    y: sample.y,
    timestamp: sample.timestamp,
    hardness: settings.hardness,
    ...mapped,
  });
}

function validatePremultipliedRgba(value: PremultipliedRgba8, label: string): void {
  if (value.length !== 4) {
    throw new RangeError(`${label} must have exactly four channels`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const channel = value[index];
    if (channel === undefined || !Number.isSafeInteger(channel) || channel < 0 || channel > 255) {
      throw new RangeError(`${label}[${index}] must be an integer within 0..255`);
    }
  }
  if (value[0] > value[3] || value[1] > value[3] || value[2] > value[3]) {
    throw new RangeError(`${label} must be premultiplied by its alpha channel`);
  }
}

function freezeRgba(red: number, green: number, blue: number, alpha: number): PremultipliedRgba8 {
  return Object.freeze([red, green, blue, alpha] as const);
}

function toByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}

function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be finite and within 0..1`);
  }
}
