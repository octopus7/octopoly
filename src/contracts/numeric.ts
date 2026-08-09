export interface NumericTolerancePolicy {
  readonly absoluteDistance: number;
  readonly relativeDistance: number;
  readonly angleRadians: number;
  readonly normalizedVector: number;
  readonly barycentric: number;
  readonly areaScaleFactor: number;
}

export const NUMERIC_TOLERANCE_POLICY: Readonly<NumericTolerancePolicy> = Object.freeze({
  absoluteDistance: 1e-9,
  relativeDistance: 1e-9,
  angleRadians: 1e-6,
  normalizedVector: 1e-9,
  barycentric: 1e-7,
  areaScaleFactor: 1e-12,
});

export function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

export function incrementNonNegativeSafeInteger(value: number, label: string): number {
  assertNonNegativeSafeInteger(value, label);
  if (value === Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} overflow`);
  }
  return value + 1;
}
