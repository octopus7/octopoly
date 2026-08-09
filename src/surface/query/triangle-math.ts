import type { Ray, Vec3 } from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

export interface TrianglePointResult {
  readonly barycentric: Vec3;
  readonly position: Vec3;
}

export interface TriangleRayResult extends TrianglePointResult {
  readonly distance: number;
}

export function sceneDistanceTolerance(sceneScale: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * sceneScale,
  );
}

export function sceneAreaTolerance(sceneScale: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance * NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.areaScaleFactor * sceneScale * sceneScale,
  );
}

export function rayTriangleIntersection(
  ray: Ray,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  sceneScale: number,
): TriangleRayResult | null {
  const edgeAB = subtract(b, a);
  const edgeAC = subtract(c, a);
  const geometricCross = cross(edgeAB, edgeAC);
  const doubledArea = length(geometricCross);
  if (doubledArea <= sceneAreaTolerance(sceneScale)) {
    return null;
  }

  const p = cross(ray.direction, edgeAC);
  const determinant = dot(edgeAB, p);
  if (
    Math.abs(determinant) <=
    doubledArea * Math.sin(NUMERIC_TOLERANCE_POLICY.angleRadians)
  ) {
    return null;
  }

  const inverseDeterminant = 1 / determinant;
  const fromA = subtract(ray.origin, a);
  const weightB = dot(fromA, p) * inverseDeterminant;
  const q = cross(fromA, edgeAB);
  const weightC = dot(ray.direction, q) * inverseDeterminant;
  const weightA = 1 - weightB - weightC;
  const barycentricTolerance = NUMERIC_TOLERANCE_POLICY.barycentric;

  if (
    weightA < -barycentricTolerance ||
    weightB < -barycentricTolerance ||
    weightC < -barycentricTolerance ||
    weightA > 1 + barycentricTolerance ||
    weightB > 1 + barycentricTolerance ||
    weightC > 1 + barycentricTolerance
  ) {
    return null;
  }

  const distance = dot(edgeAC, q) * inverseDeterminant;
  if (!Number.isFinite(distance) || distance <= sceneDistanceTolerance(sceneScale)) {
    return null;
  }

  const barycentric = canonicalizeBarycentric(weightA, weightB, weightC);
  return {
    barycentric,
    position: interpolatePosition(a, b, c, barycentric),
    distance,
  };
}

export function closestPointOnTriangle(
  point: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  sceneScale: number,
): TrianglePointResult | null {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  if (length(cross(ab, ac)) <= sceneAreaTolerance(sceneScale)) {
    return null;
  }

  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) {
    return trianglePoint(a, b, c, 1, 0, 0);
  }

  const bp = subtract(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return trianglePoint(a, b, c, 0, 1, 0);
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const weightB = d1 / (d1 - d3);
    return trianglePoint(a, b, c, 1 - weightB, weightB, 0);
  }

  const cp = subtract(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return trianglePoint(a, b, c, 0, 0, 1);
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const weightC = d2 / (d2 - d6);
    return trianglePoint(a, b, c, 1 - weightC, 0, weightC);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const weightC = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return trianglePoint(a, b, c, 0, 1 - weightC, weightC);
  }

  const denominator = va + vb + vc;
  if (!Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const weightB = vb / denominator;
  const weightC = vc / denominator;
  return trianglePoint(a, b, c, 1 - weightB - weightC, weightB, weightC);
}

export function triangleNormal(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  barycentric: Vec3,
  normalA?: Vec3,
  normalB?: Vec3,
  normalC?: Vec3,
): Vec3 {
  if (normalA !== undefined && normalB !== undefined && normalC !== undefined) {
    const interpolated = {
      x:
        normalA.x * barycentric.x +
        normalB.x * barycentric.y +
        normalC.x * barycentric.z,
      y:
        normalA.y * barycentric.x +
        normalB.y * barycentric.y +
        normalC.y * barycentric.z,
      z:
        normalA.z * barycentric.x +
        normalB.z * barycentric.y +
        normalC.z * barycentric.z,
    };
    const smooth = normalized(interpolated);
    if (smooth !== null) {
      return smooth;
    }
  }

  const geometric = normalized(cross(subtract(b, a), subtract(c, a)));
  if (geometric === null) {
    throw new Error("cannot compute a normal for a degenerate triangle");
  }
  return geometric;
}

export function squaredDistance(a: Vec3, b: Vec3): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function trianglePoint(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  weightA: number,
  weightB: number,
  weightC: number,
): TrianglePointResult {
  const barycentric = canonicalizeBarycentric(weightA, weightB, weightC);
  return {
    barycentric,
    position: interpolatePosition(a, b, c, barycentric),
  };
}

function canonicalizeBarycentric(weightA: number, weightB: number, weightC: number): Vec3 {
  const x = Math.min(1, Math.max(0, weightA));
  const y = Math.min(1, Math.max(0, weightB));
  const z = Math.min(1, Math.max(0, weightC));
  const sum = x + y + z;
  if (!Number.isFinite(sum) || sum === 0) {
    throw new Error("invalid barycentric coordinates");
  }
  return Object.freeze({ x: x / sum, y: y / sum, z: z / sum });
}

function interpolatePosition(a: Vec3, b: Vec3, c: Vec3, barycentric: Vec3): Vec3 {
  return Object.freeze({
    x: a.x * barycentric.x + b.x * barycentric.y + c.x * barycentric.z,
    y: a.y * barycentric.x + b.y * barycentric.y + c.y * barycentric.z,
    z: a.z * barycentric.x + b.z * barycentric.y + c.z * barycentric.z,
  });
}

function normalized(value: Vec3): Vec3 | null {
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude <= NUMERIC_TOLERANCE_POLICY.normalizedVector) {
    return null;
  }
  return Object.freeze({ x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude });
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}
