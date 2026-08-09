import {
  NUMERIC_TOLERANCE_POLICY,
  type ImageAssetRef,
  type MeshTriangleHit,
  type Vec2,
} from "@octopoly/contracts";

export type CornerUvTuple = readonly [Vec2, Vec2, Vec2];

const BARYCENTRIC_TOLERANCE = NUMERIC_TOLERANCE_POLICY.barycentric;

function isFiniteVec2(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function normalizedBarycentric(
  hit: MeshTriangleHit | null,
): readonly [number, number, number] | null {
  if (hit === null) {
    return null;
  }

  const weights = [hit.barycentric.x, hit.barycentric.y, hit.barycentric.z] as const;
  if (weights.some((weight) => !Number.isFinite(weight))) {
    return null;
  }
  if (weights.some(
    (weight) => weight < -BARYCENTRIC_TOLERANCE || weight > 1 + BARYCENTRIC_TOLERANCE,
  )) {
    return null;
  }

  const sum = weights[0] + weights[1] + weights[2];
  if (!Number.isFinite(sum) || Math.abs(sum - 1) > BARYCENTRIC_TOLERANCE) {
    return null;
  }

  // Small ray/triangle intersection errors at an edge must not bleed into the
  // neighbouring UV chart. Clamp only values already accepted by the shared
  // barycentric tolerance, then renormalize to preserve affine interpolation.
  const first = Math.min(1, Math.max(0, weights[0]));
  const second = Math.min(1, Math.max(0, weights[1]));
  const third = Math.min(1, Math.max(0, weights[2]));
  const clampedSum = first + second + third;
  if (clampedSum === 0) {
    return null;
  }

  return Object.freeze([
    first / clampedSum,
    second / clampedSum,
    third / clampedSum,
  ] as const);
}

function isValidImageExtent(image: ImageAssetRef): boolean {
  return Number.isSafeInteger(image.width)
    && image.width > 0
    && Number.isSafeInteger(image.height)
    && image.height > 0;
}

/**
 * Pure barycentric projection for a single canonical mesh hit.
 *
 * The caller owns hit-to-current-mesh validation through PaintTargetAdapter.
 * This projector deliberately does not search adjacent triangles or UV charts:
 * one canonical hit yields at most one stamp, including at seams and overlaps.
 */
export class BarycentricUvProjector {
  projectUv(hit: MeshTriangleHit | null, cornerUvs: CornerUvTuple): Vec2 | null {
    const weights = normalizedBarycentric(hit);
    if (weights === null || cornerUvs.some((uv) => !isFiniteVec2(uv))) {
      return null;
    }

    const uv = {
      x: weights[0] * cornerUvs[0].x
        + weights[1] * cornerUvs[1].x
        + weights[2] * cornerUvs[2].x,
      y: weights[0] * cornerUvs[0].y
        + weights[1] * cornerUvs[1].y
        + weights[2] * cornerUvs[2].y,
    };

    return isFiniteVec2(uv) ? Object.freeze(uv) : null;
  }

  projectTexturePixel(
    hit: MeshTriangleHit | null,
    cornerUvs: CornerUvTuple,
    image: ImageAssetRef,
  ): Vec2 | null {
    if (!isValidImageExtent(image)) {
      return null;
    }

    const uv = this.projectUv(hit, cornerUvs);
    if (uv === null
      || uv.x < -BARYCENTRIC_TOLERANCE
      || uv.x > 1 + BARYCENTRIC_TOLERANCE
      || uv.y < -BARYCENTRIC_TOLERANCE
      || uv.y > 1 + BARYCENTRIC_TOLERANCE) {
      return null;
    }

    const u = Math.min(1, Math.max(0, uv.x));
    const v = Math.min(1, Math.max(0, uv.y));
    return Object.freeze({
      x: u * (image.width - 1),
      y: (1 - v) * (image.height - 1),
    });
  }
}
