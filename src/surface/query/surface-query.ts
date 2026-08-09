import type {
  Ray,
  ReferenceSurfaceId,
  SurfaceHit,
  SurfaceQuery,
  SurfaceTriangleId,
  Vec3,
} from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

import type { PreparedReferenceGeometry } from "../reference/geometry/prepared-reference-geometry";
import type { SurfaceCandidateSource } from "./candidate-source";
import {
  closestPointOnTriangle,
  rayTriangleIntersection,
  sceneDistanceTolerance,
  squaredDistance,
  triangleNormal,
} from "./triangle-math";

export class SurfaceQueryImpl implements SurfaceQuery {
  private disposed = false;

  public constructor(
    private readonly surfaceId: ReferenceSurfaceId,
    private readonly geometry: PreparedReferenceGeometry,
    private readonly candidates: SurfaceCandidateSource,
  ) {}

  public raycast(ray: Ray, maxDistance?: number): SurfaceHit | null {
    this.assertUsable();
    assertFiniteVec3(ray.origin, "ray origin");
    assertNormalizedDirection(ray.direction);
    assertMaxDistance(maxDistance);

    const sceneScale = this.geometry.sceneScale;
    const distanceTolerance = sceneDistanceTolerance(sceneScale);
    let best: SurfaceHit | null = null;

    this.candidates.forEachRayCandidate(ray, maxDistance, (triangleId) => {
      const triangle = this.geometry.triangle(triangleId);
      if (triangle.degenerate) {
        return best?.distance;
      }
      const [a, b, c] = triangle.positions;
      const intersection = rayTriangleIntersection(ray, a, b, c, sceneScale);
      if (
        intersection === null ||
        (maxDistance !== undefined && intersection.distance > maxDistance + distanceTolerance)
      ) {
        return best?.distance;
      }
      if (!isPreferred(intersection.distance, triangleId, best, distanceTolerance)) {
        return best?.distance;
      }

      best = createHit(
        this.surfaceId,
        triangleId,
        intersection.position,
        triangleNormal(a, b, c, intersection.barycentric, ...optionalNormals(triangle.normals)),
        intersection.barycentric,
        intersection.distance,
      );
      return best.distance;
    });

    return best;
  }

  public nearest(point: Vec3, maxDistance?: number): SurfaceHit | null {
    this.assertUsable();
    assertFiniteVec3(point, "nearest point");
    assertMaxDistance(maxDistance);

    const sceneScale = this.geometry.sceneScale;
    const distanceTolerance = sceneDistanceTolerance(sceneScale);
    let best: SurfaceHit | null = null;

    this.candidates.forEachNearestCandidate(point, maxDistance, (triangleId) => {
      const triangle = this.geometry.triangle(triangleId);
      if (triangle.degenerate) {
        return best?.distance;
      }
      const [a, b, c] = triangle.positions;
      const closest = closestPointOnTriangle(point, a, b, c, sceneScale);
      if (closest === null) {
        return best?.distance;
      }
      const distance = Math.sqrt(squaredDistance(point, closest.position));
      if (
        !Number.isFinite(distance) ||
        (maxDistance !== undefined && distance > maxDistance + distanceTolerance) ||
        !isPreferred(distance, triangleId, best, distanceTolerance)
      ) {
        return best?.distance;
      }

      best = createHit(
        this.surfaceId,
        triangleId,
        closest.position,
        triangleNormal(a, b, c, closest.barycentric, ...optionalNormals(triangle.normals)),
        closest.barycentric,
        distance,
      );
      return best.distance;
    });

    return best;
  }

  /** Internal lifecycle hook owned by the containing ReferenceSurface. */
  public dispose(): void {
    this.disposed = true;
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("surface query is disposed");
    }
    this.geometry.assertUsable();
  }
}

function createHit(
  surfaceId: ReferenceSurfaceId,
  triangleId: SurfaceTriangleId,
  position: Vec3,
  normal: Vec3,
  barycentric: Vec3,
  distance: number,
): SurfaceHit {
  return Object.freeze({ surfaceId, triangleId, position, normal, barycentric, distance });
}

function isPreferred(
  distance: number,
  triangleId: SurfaceTriangleId,
  current: SurfaceHit | null,
  tolerance: number,
): boolean {
  if (current === null) {
    return true;
  }
  const difference = distance - current.distance;
  if (Math.abs(difference) <= tolerance) {
    return triangleId < current.triangleId;
  }
  return difference < 0;
}

function optionalNormals(
  normals: readonly [Vec3, Vec3, Vec3] | undefined,
): [] | [Vec3, Vec3, Vec3] {
  return normals === undefined ? [] : [normals[0], normals[1], normals[2]];
}

function assertFiniteVec3(value: Vec3, label: string): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new RangeError(`${label} must contain finite components`);
  }
}

function assertNormalizedDirection(direction: Vec3): void {
  assertFiniteVec3(direction, "ray direction");
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (
    !Number.isFinite(magnitude) ||
    Math.abs(magnitude - 1) > NUMERIC_TOLERANCE_POLICY.normalizedVector
  ) {
    throw new RangeError("ray direction must be normalized");
  }
}

function assertMaxDistance(maxDistance: number | undefined): void {
  if (maxDistance !== undefined && (!Number.isFinite(maxDistance) || maxDistance < 0)) {
    throw new RangeError("maxDistance must be a finite non-negative number");
  }
}
