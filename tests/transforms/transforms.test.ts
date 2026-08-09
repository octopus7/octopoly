import { describe, expect, it } from "vitest";

import type { ViewportSnapshot } from "@octopoly/contracts";
import {
  identityMat4,
  immutableMat4,
  immutableVec3,
  invertMat4,
  multiplyMat4,
  projectWorldToScreen,
  screenToNdc,
  transformPoint,
} from "../../src/transforms";

const viewport: ViewportSnapshot = Object.freeze({ cssWidth: 200, cssHeight: 100, devicePixelRatio: 3 });

describe("transform helpers", () => {
  it("uses column-major matrices and round-trips an affine point", () => {
    const translation = immutableMat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, -2, 8, 1]);
    const point = immutableVec3(1, 2, 3);
    expect(transformPoint(translation, point)).toEqual({ x: 5, y: 0, z: 11 });
    expect(transformPoint(invertMat4(translation), transformPoint(translation, point))).toEqual(point);
    expect(multiplyMat4(identityMat4(), translation)).toEqual(translation);
  });

  it("converts top-left CSS pixels without using devicePixelRatio", () => {
    expect(screenToNdc({ x: 0, y: 0 }, viewport)).toEqual({ x: -1, y: 1 });
    expect(screenToNdc({ x: 100, y: 50 }, viewport)).toEqual({ x: 0, y: 0 });
    expect(projectWorldToScreen({ x: 0, y: 0, z: 0 }, identityMat4(), viewport)).toEqual({
      x: 100,
      y: 50,
      z: 0,
    });
  });

  it("rejects non-finite and singular input", () => {
    expect(() => immutableVec3(Number.NaN, 0, 0)).toThrow(RangeError);
    expect(() => invertMat4(immutableMat4(new Array(16).fill(0)))).toThrow(RangeError);
  });
});
