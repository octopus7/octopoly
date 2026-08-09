import { describe, expect, it } from "vitest";

import type {
  Mat4,
  Ray,
  SurfaceHit,
  SurfaceTriangleId,
  TriangleMeshSnapshot,
  Vec3,
} from "@octopoly/contracts";

import { prepareReferenceGeometry } from "../../../src/surface/reference/geometry/prepared-reference-geometry";
import type { SurfaceCandidateSource } from "../../../src/surface/query/candidate-source";
import { SurfaceQueryImpl } from "../../../src/surface/query/surface-query";
import { sceneDistanceTolerance } from "../../../src/surface/query/triangle-math";

const identity = Object.freeze({
  elements: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
}) satisfies Mat4;

class FakeCandidateSource implements SurfaceCandidateSource {
  rayCalls = 0;
  nearestCalls = 0;
  lastRayMaxDistance: number | undefined;
  lastNearestMaxDistance: number | undefined;

  public constructor(
    private readonly rayIds: ReadonlyArray<SurfaceTriangleId>,
    private readonly nearestIds: ReadonlyArray<SurfaceTriangleId> = rayIds,
  ) {}

  public forEachRayCandidate(
    _ray: Ray,
    maxDistance: number | undefined,
    visit: (triangleId: SurfaceTriangleId) => number | undefined,
  ): void {
    this.rayCalls += 1;
    this.lastRayMaxDistance = maxDistance;
    this.rayIds.forEach(visit);
  }

  public forEachNearestCandidate(
    _point: Vec3,
    maxDistance: number | undefined,
    visit: (triangleId: SurfaceTriangleId) => number | undefined,
  ): void {
    this.nearestCalls += 1;
    this.lastNearestMaxDistance = maxDistance;
    this.nearestIds.forEach(visit);
  }
}

function snapshot(
  positions: ReadonlyArray<Vec3>,
  indices: ReadonlyArray<number>,
  normals?: ReadonlyArray<Vec3>,
): TriangleMeshSnapshot {
  return {
    version: 0,
    positions,
    indices,
    ...(normals === undefined ? {} : { normals }),
  };
}

function twoLayerGeometry(): TriangleMeshSnapshot {
  return snapshot(
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 0, y: 2, z: 1 },
    ],
    [0, 1, 2, 3, 4, 5],
  );
}

function singleTriangleGeometry(): TriangleMeshSnapshot {
  return snapshot(
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
    ],
    [0, 1, 2],
  );
}

function queryFixture(
  geometry: TriangleMeshSnapshot,
  rayIds: ReadonlyArray<SurfaceTriangleId>,
  nearestIds: ReadonlyArray<SurfaceTriangleId> = rayIds,
  transform: Mat4 = identity,
): {
  readonly prepared: ReturnType<typeof prepareReferenceGeometry>;
  readonly candidates: FakeCandidateSource;
  readonly query: SurfaceQueryImpl;
} {
  const prepared = prepareReferenceGeometry(geometry, transform);
  const candidates = new FakeCandidateSource(rayIds, nearestIds);
  return {
    prepared,
    candidates,
    query: new SurfaceQueryImpl("reference", prepared, candidates),
  };
}

function downwardRay(z: number): Ray {
  return { origin: { x: 0.5, y: 0.5, z }, direction: { x: 0, y: 0, z: -1 } };
}

function expectVec3(actual: Vec3, expected: Vec3, tolerance: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tolerance);
}

function expectImmutableHit(hit: SurfaceHit): void {
  expect(Object.isFrozen(hit)).toBe(true);
  expect(Object.isFrozen(hit.position)).toBe(true);
  expect(Object.isFrozen(hit.normal)).toBe(true);
  expect(Object.isFrozen(hit.barycentric)).toBe(true);
}

describe("SurfaceQueryImpl.raycast", () => {
  it("returns the nearest double-sided world-space hit with immutable details", () => {
    const { prepared, query } = queryFixture(twoLayerGeometry(), [0, 1]);
    const tolerance = sceneDistanceTolerance(prepared.sceneScale);

    const front = query.raycast(downwardRay(3));
    const back = query.raycast({
      origin: { x: 0.5, y: 0.5, z: -2 },
      direction: { x: 0, y: 0, z: 1 },
    });

    expect(front?.surfaceId).toBe("reference");
    expect(front?.triangleId).toBe(1);
    expect(front?.distance).toBe(2);
    expectVec3(front?.position as Vec3, { x: 0.5, y: 0.5, z: 1 }, tolerance);
    expectVec3(front?.normal as Vec3, { x: 0, y: 0, z: 1 }, tolerance);
    expect(front?.barycentric.x).toBe(0.5);
    expect(front?.barycentric.y).toBe(0.25);
    expect(front?.barycentric.z).toBe(0.25);
    expect(back?.triangleId).toBe(0);
    expect(back?.distance).toBe(2);
    expectImmutableHit(front as SurfaceHit);
  });

  it("uses triangle ID for ties independent of candidate visitation order", () => {
    const closeLayers = snapshot(
      [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 0, z: 5e-10 },
        { x: 2, y: 0, z: 5e-10 },
        { x: 0, y: 2, z: 5e-10 },
      ],
      [0, 1, 2, 3, 4, 5],
    );
    const first = queryFixture(closeLayers, [1, 0]).query.raycast(downwardRay(2));
    const second = queryFixture(closeLayers, [0, 1]).query.raycast(downwardRay(2));

    expect(first?.triangleId).toBe(0);
    expect(second?.triangleId).toBe(0);
  });

  it("honors inclusive maxDistance and passes undefined through to spatial traversal", () => {
    const fixture = queryFixture(singleTriangleGeometry(), [0]);

    expect(fixture.query.raycast(downwardRay(2), 2)?.distance).toBe(2);
    expect(fixture.query.raycast(downwardRay(2), 1.5)).toBeNull();
    expect(fixture.query.raycast(downwardRay(2))).not.toBeNull();
    expect(fixture.candidates.lastRayMaxDistance).toBeUndefined();
  });

  it("returns normal misses for parallel, behind-origin, empty, and degenerate candidates", () => {
    const regular = queryFixture(singleTriangleGeometry(), [0]);
    const empty = queryFixture(singleTriangleGeometry(), []);
    const degenerate = queryFixture(
      snapshot(
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        [0, 1, 2],
      ),
      [0],
    );

    expect(
      regular.query.raycast({
        origin: { x: 0.5, y: 0.5, z: 1 },
        direction: { x: 1, y: 0, z: 0 },
      }),
    ).toBeNull();
    expect(
      regular.query.raycast({
        origin: { x: 0.5, y: 0.5, z: -1 },
        direction: { x: 0, y: 0, z: -1 },
      }),
    ).toBeNull();
    expect(empty.query.raycast(downwardRay(1))).toBeNull();
    expect(degenerate.query.raycast(downwardRay(1))).toBeNull();
  });

  it("uses the baked non-uniform transform and inverse-transpose vertex normal", () => {
    const inverseSqrtTwo = 1 / Math.sqrt(2);
    const transform = Object.freeze({
      elements: Object.freeze([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0.5, 0, 10, -2, 5, 1]),
    }) satisfies Mat4;
    const geometry = snapshot(
      [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
      ],
      [0, 1, 2],
      Array.from({ length: 3 }, () => ({ x: inverseSqrtTwo, y: 0, z: inverseSqrtTwo })),
    );
    const { prepared, query } = queryFixture(geometry, [0], [0], transform);
    const tolerance = sceneDistanceTolerance(prepared.sceneScale);
    const hit = query.raycast({
      origin: { x: 11, y: -0.5, z: 7 },
      direction: { x: 0, y: 0, z: -1 },
    });

    expect(hit?.distance).toBe(2);
    expectVec3(hit?.position as Vec3, { x: 11, y: -0.5, z: 5 }, tolerance);
    expectVec3(
      hit?.normal as Vec3,
      { x: 1 / Math.sqrt(17), y: 0, z: 4 / Math.sqrt(17) },
      tolerance,
    );
  });
});

describe("SurfaceQueryImpl.nearest", () => {
  it.each([
    [{ x: 0.5, y: 0.5, z: 2 }, { x: 0.5, y: 0.5, z: 0 }, 2, { x: 0.5, y: 0.25, z: 0.25 }],
    [{ x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, 1, { x: 0.5, y: 0.5, z: 0 }],
    [{ x: -1, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, Math.sqrt(2), { x: 1, y: 0, z: 0 }],
  ] satisfies ReadonlyArray<readonly [Vec3, Vec3, number, Vec3]>) (
    "returns the face, edge, or vertex nearest point for %o",
    (point, expectedPosition, expectedDistance, expectedBarycentric) => {
      const { prepared, query } = queryFixture(singleTriangleGeometry(), [0]);
      const tolerance = sceneDistanceTolerance(prepared.sceneScale);
      const hit = query.nearest(point);

      expect(Math.abs((hit?.distance as number) - expectedDistance)).toBeLessThanOrEqual(tolerance);
      expectVec3(hit?.position as Vec3, expectedPosition, tolerance);
      expectVec3(hit?.barycentric as Vec3, expectedBarycentric, tolerance);
      expectVec3(hit?.normal as Vec3, { x: 0, y: 0, z: 1 }, tolerance);
    },
  );

  it("chooses the nearest candidate and deterministically breaks equal-distance ties", () => {
    const nearest = queryFixture(twoLayerGeometry(), [0, 1], [0, 1]).query.nearest({
      x: 0.5,
      y: 0.5,
      z: 0.8,
    });
    const duplicates = snapshot(
      [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
      ],
      [0, 1, 2, 0, 1, 2],
    );
    const tie = queryFixture(duplicates, [1, 0], [1, 0]).query.nearest({ x: 0.5, y: 0.5, z: 1 });

    expect(nearest?.triangleId).toBe(1);
    expect(tie?.triangleId).toBe(0);
  });

  it("honors maxDistance and returns null for empty or degenerate-only candidates", () => {
    const regular = queryFixture(singleTriangleGeometry(), [0]);
    const empty = queryFixture(singleTriangleGeometry(), [], []);
    const degenerate = queryFixture(
      snapshot(
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        [0, 1, 2],
      ),
      [0],
    );

    expect(regular.query.nearest({ x: 0.5, y: 0.5, z: 2 }, 2)?.distance).toBe(2);
    expect(regular.query.nearest({ x: 0.5, y: 0.5, z: 2 }, 1.5)).toBeNull();
    expect(regular.query.nearest({ x: 0.5, y: 0.5, z: 0 }, 0)?.distance).toBe(0);
    expect(empty.query.nearest({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(empty.candidates.lastNearestMaxDistance).toBeUndefined();
    expect(degenerate.query.nearest({ x: 0, y: 0, z: 1 })).toBeNull();
  });

  it("reports transformed nearest position, normal, and distance in world space", () => {
    const transform = Object.freeze({
      elements: Object.freeze([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0.5, 0, 10, -2, 5, 1]),
    }) satisfies Mat4;
    const { prepared, query } = queryFixture(singleTriangleGeometry(), [0], [0], transform);
    const tolerance = sceneDistanceTolerance(prepared.sceneScale);
    const hit = query.nearest({ x: 11, y: -0.5, z: 7 });

    expect(Math.abs((hit?.distance as number) - 2)).toBeLessThanOrEqual(tolerance);
    expectVec3(hit?.position as Vec3, { x: 11, y: -0.5, z: 5 }, tolerance);
    expectVec3(hit?.normal as Vec3, { x: 0, y: 0, z: 1 }, tolerance);
  });
});

describe("SurfaceQueryImpl invariants", () => {
  it("rejects non-finite or non-normalized inputs and invalid maxDistance before traversal", () => {
    const fixture = queryFixture(singleTriangleGeometry(), [0]);

    expect(() =>
      fixture.query.raycast({
        origin: { x: Number.NaN, y: 0, z: 1 },
        direction: { x: 0, y: 0, z: -1 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      fixture.query.raycast({
        origin: { x: 0, y: 0, z: 1 },
        direction: { x: 0, y: 0, z: -2 },
      }),
    ).toThrow(RangeError);
    expect(() => fixture.query.raycast(downwardRay(1), -1)).toThrow(RangeError);
    expect(() => fixture.query.nearest({ x: 0, y: Number.POSITIVE_INFINITY, z: 0 })).toThrow(
      RangeError,
    );
    expect(() => fixture.query.nearest({ x: 0, y: 0, z: 0 }, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
    expect(fixture.candidates.rayCalls).toBe(0);
    expect(fixture.candidates.nearestCalls).toBe(0);
  });

  it("fails disposed queries explicitly and keeps dispose idempotent", () => {
    const fixture = queryFixture(singleTriangleGeometry(), [0]);

    fixture.query.dispose();
    fixture.query.dispose();

    expect(() => fixture.query.raycast(downwardRay(1))).toThrow("surface query is disposed");
    expect(() => fixture.query.nearest({ x: 0, y: 0, z: 0 })).toThrow("surface query is disposed");
    expect(fixture.candidates.rayCalls).toBe(0);
    expect(fixture.candidates.nearestCalls).toBe(0);
  });

  it("surfaces invalid candidate IDs as programmer errors", () => {
    const fixture = queryFixture(singleTriangleGeometry(), [4]);

    expect(() => fixture.query.raycast(downwardRay(1))).toThrow(RangeError);
  });
});
