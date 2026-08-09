import { describe, expect, it } from "vitest";

import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";
import type { Ray, Vec3 } from "@octopoly/contracts";
import {
  closestPointOnTriangle,
  rayTriangleIntersection,
  sceneAreaTolerance,
  sceneDistanceTolerance,
} from "../../../src/surface/query/triangle-math";

const a = Object.freeze({ x: 0, y: 0, z: 0 });
const b = Object.freeze({ x: 2, y: 0, z: 0 });
const c = Object.freeze({ x: 0, y: 2, z: 0 });

function ray(origin: Vec3, direction: Vec3): Ray {
  return Object.freeze({ origin: Object.freeze(origin), direction: Object.freeze(direction) });
}

function expectVec3(actual: Vec3, expected: Vec3): void {
  const tolerance = sceneDistanceTolerance(1);
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tolerance);
}

describe("triangle ray intersection", () => {
  it("hits the same triangle from its front and back", () => {
    const front = rayTriangleIntersection(
      ray({ x: 0.5, y: 0.5, z: 2 }, { x: 0, y: 0, z: -1 }),
      a,
      b,
      c,
      1,
    );
    const back = rayTriangleIntersection(
      ray({ x: 0.5, y: 0.5, z: -2 }, { x: 0, y: 0, z: 1 }),
      a,
      b,
      c,
      1,
    );

    expect(front?.distance).toBe(2);
    expect(back?.distance).toBe(2);
    expect(front?.barycentric).toEqual({ x: 0.5, y: 0.25, z: 0.25 });
    expect(back?.barycentric).toEqual(front?.barycentric);
    expectVec3(front?.position as Vec3, { x: 0.5, y: 0.5, z: 0 });
  });

  it("accepts deterministic edge and vertex hits", () => {
    const edge = rayTriangleIntersection(
      ray({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }),
      a,
      b,
      c,
      1,
    );
    const vertex = rayTriangleIntersection(
      ray({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }),
      a,
      b,
      c,
      1,
    );

    expect(edge?.barycentric).toEqual({ x: 0.5, y: 0.5, z: 0 });
    expect(vertex?.barycentric).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("rejects parallel, behind-origin, on-origin, and degenerate intersections", () => {
    expect(
      rayTriangleIntersection(
        ray({ x: 0.5, y: 0.5, z: 1 }, { x: 1, y: 0, z: 0 }),
        a,
        b,
        c,
        1,
      ),
    ).toBeNull();
    expect(
      rayTriangleIntersection(
        ray({ x: 0.5, y: 0.5, z: -1 }, { x: 0, y: 0, z: -1 }),
        a,
        b,
        c,
        1,
      ),
    ).toBeNull();
    expect(
      rayTriangleIntersection(
        ray({ x: 0.5, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }),
        a,
        b,
        c,
        1,
      ),
    ).toBeNull();
    expect(
      rayTriangleIntersection(
        ray({ x: 0.5, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }),
        a,
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        1,
      ),
    ).toBeNull();
  });
});

describe("closest point on triangle", () => {
  it.each([
    [{ x: 0.5, y: 0.5, z: 2 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.25, z: 0.25 }],
    [{ x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0.5, y: 0.5, z: 0 }],
    [{ x: -1, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
  ] satisfies ReadonlyArray<readonly [Vec3, Vec3, Vec3]>) (
    "finds an interior, edge, or vertex closest point for %o",
    (point, expectedPosition, expectedBarycentric) => {
      const result = closestPointOnTriangle(point, a, b, c, 1);

      expect(result).not.toBeNull();
      expectVec3(result?.position as Vec3, expectedPosition);
      expectVec3(result?.barycentric as Vec3, expectedBarycentric);
      expect(
        (result?.barycentric.x ?? 0) +
          (result?.barycentric.y ?? 0) +
          (result?.barycentric.z ?? 0),
      ).toBe(1);
    },
  );

  it("applies the ADR scene-scale degeneracy threshold", () => {
    const areaTolerance = sceneAreaTolerance(1);
    const side = Math.sqrt(areaTolerance / 2);

    expect(
      closestPointOnTriangle(
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 0 },
        { x: side, y: 0, z: 0 },
        { x: 0, y: side, z: 0 },
        1,
      ),
    ).toBeNull();
    expect(sceneDistanceTolerance(1)).toBe(NUMERIC_TOLERANCE_POLICY.absoluteDistance);
  });
});
