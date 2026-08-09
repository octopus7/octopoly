import { describe, expect, it } from "vitest";

import {
  aabbWithinDistance,
  rayAabbEntryDistance,
  sceneDistanceTolerance,
  squaredDistanceToAabb,
} from "../../../src/surface/spatial/aabb";

describe("spatial AABB queries", () => {
  it("returns the forward entry distance for either ray direction", () => {
    expect(
      rayAabbEntryDistance(
        { origin: { x: -2, y: 0.5, z: 0.5 }, direction: { x: 1, y: 0, z: 0 } },
        0,
        0,
        0,
        1,
        1,
        1,
        1,
        undefined,
      ),
    ).toBeCloseTo(2, 8);
    expect(
      rayAabbEntryDistance(
        { origin: { x: 3, y: 0.5, z: 0.5 }, direction: { x: -1, y: 0, z: 0 } },
        0,
        0,
        0,
        1,
        1,
        1,
        1,
        undefined,
      ),
    ).toBeCloseTo(2, 8);
  });

  it("handles inside, behind, parallel-miss, and maximum-distance cases", () => {
    const insideRay = {
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 0, y: 1, z: 0 },
    };
    expect(rayAabbEntryDistance(insideRay, 0, 0, 0, 1, 1, 1, 1, undefined)).toBe(0);

    const forwardRay = {
      origin: { x: 2, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
    };
    expect(rayAabbEntryDistance(forwardRay, 0, 0, 0, 1, 1, 1, 1, undefined)).toBeNull();

    const parallelRay = {
      origin: { x: -2, y: 2, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
    };
    expect(rayAabbEntryDistance(parallelRay, 0, 0, 0, 1, 1, 1, 1, undefined)).toBeNull();

    const boundedRay = {
      origin: { x: -2, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
    };
    expect(rayAabbEntryDistance(boundedRay, 0, 0, 0, 1, 1, 1, 1, 1)).toBeNull();
    expect(rayAabbEntryDistance(boundedRay, 0, 0, 0, 1, 1, 1, 1, 2)).not.toBeNull();
  });

  it("computes exact squared distance and applies an inclusive canonical boundary", () => {
    expect(squaredDistanceToAabb({ x: 0.5, y: 0.5, z: 0.5 }, 0, 0, 0, 1, 1, 1)).toBe(0);
    expect(squaredDistanceToAabb({ x: 2, y: 3, z: 0.5 }, 0, 0, 0, 1, 1, 1)).toBe(5);

    const tolerance = sceneDistanceTolerance(1);
    const point = { x: 2 + tolerance * 0.5, y: 0.5, z: 0.5 };
    expect(aabbWithinDistance(point, 0, 0, 0, 1, 1, 1, 1, 1)).toBe(true);
    expect(aabbWithinDistance({ x: 2.01, y: 0.5, z: 0.5 }, 0, 0, 0, 1, 1, 1, 1, 1)).toBe(false);
  });
});
