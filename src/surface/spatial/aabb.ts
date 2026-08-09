import type { Ray, Vec3 } from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

export function sceneDistanceTolerance(sceneScale: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * sceneScale,
  );
}

export function rayAabbEntryDistance(
  ray: Ray,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  sceneScale: number,
  maxDistance: number | undefined,
): number | null {
  if (maxDistance !== undefined && maxDistance < 0) {
    return null;
  }

  const tolerance = sceneDistanceTolerance(sceneScale);
  let entry = 0;
  let exit = maxDistance === undefined ? Number.POSITIVE_INFINITY : maxDistance + tolerance;

  const expandedMinX = minX - tolerance;
  const expandedMaxX = maxX + tolerance;
  if (ray.direction.x === 0) {
    if (ray.origin.x < expandedMinX || ray.origin.x > expandedMaxX) {
      return null;
    }
  } else {
    const inverseDirection = 1 / ray.direction.x;
    let near = (expandedMinX - ray.origin.x) * inverseDirection;
    let far = (expandedMaxX - ray.origin.x) * inverseDirection;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) {
      return null;
    }
  }

  const expandedMinY = minY - tolerance;
  const expandedMaxY = maxY + tolerance;
  if (ray.direction.y === 0) {
    if (ray.origin.y < expandedMinY || ray.origin.y > expandedMaxY) {
      return null;
    }
  } else {
    const inverseDirection = 1 / ray.direction.y;
    let near = (expandedMinY - ray.origin.y) * inverseDirection;
    let far = (expandedMaxY - ray.origin.y) * inverseDirection;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) {
      return null;
    }
  }

  const expandedMinZ = minZ - tolerance;
  const expandedMaxZ = maxZ + tolerance;
  if (ray.direction.z === 0) {
    if (ray.origin.z < expandedMinZ || ray.origin.z > expandedMaxZ) {
      return null;
    }
  } else {
    const inverseDirection = 1 / ray.direction.z;
    let near = (expandedMinZ - ray.origin.z) * inverseDirection;
    let far = (expandedMaxZ - ray.origin.z) * inverseDirection;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) {
      return null;
    }
  }

  return entry;
}

export function squaredDistanceToAabb(
  point: Vec3,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number {
  const x = distanceOutsideInterval(point.x, minX, maxX);
  const y = distanceOutsideInterval(point.y, minY, maxY);
  const z = distanceOutsideInterval(point.z, minZ, maxZ);
  return x * x + y * y + z * z;
}

export function aabbWithinDistance(
  point: Vec3,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  sceneScale: number,
  maxDistance: number | undefined,
): boolean {
  if (maxDistance === undefined) {
    return true;
  }
  if (maxDistance < 0) {
    return false;
  }

  const inclusiveDistance = maxDistance + sceneDistanceTolerance(sceneScale);
  return (
    squaredDistanceToAabb(point, minX, minY, minZ, maxX, maxY, maxZ) <=
    inclusiveDistance * inclusiveDistance
  );
}

function distanceOutsideInterval(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return minimum - value;
  }
  if (value > maximum) {
    return value - maximum;
  }
  return 0;
}
