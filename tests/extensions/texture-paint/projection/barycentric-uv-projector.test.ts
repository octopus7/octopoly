import { describe, expect, it } from "vitest";

import type {
  ImageAssetRef,
  MeshTriangleHit,
  Vec2,
  Vec3,
} from "@octopoly/contracts";
import {
  BarycentricUvProjector,
  type CornerUvTuple,
} from "../../../../src/extensions/texture-paint/projection";

const TRIANGLE_UVS: CornerUvTuple = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
]);

const IMAGE: ImageAssetRef = Object.freeze({
  id: "paint-image",
  revision: 4,
  width: 101,
  height: 201,
  colorSpace: "srgb",
});

function createHit(barycentric: Vec3): MeshTriangleHit {
  return Object.freeze({
    face: 10,
    corners: Object.freeze([100, 101, 102] as const),
    vertices: Object.freeze([0, 1, 2] as const),
    positions: Object.freeze([
      Object.freeze({ x: 0, y: 0, z: 0 }),
      Object.freeze({ x: 1, y: 0, z: 0 }),
      Object.freeze({ x: 0, y: 1, z: 0 }),
    ] as const),
    meshVersion: 7,
    position: Object.freeze({ x: 0, y: 0, z: 0 }),
    normal: Object.freeze({ x: 0, y: 0, z: 1 }),
    barycentric: Object.freeze(barycentric),
    distance: 1,
  });
}

describe("BarycentricUvProjector", () => {
  const projector = new BarycentricUvProjector();

  it("interpolates triangle vertices, center, and an edge in canonical corner order", () => {
    expect(projector.projectUv(createHit({ x: 1, y: 0, z: 0 }), TRIANGLE_UVS)).toEqual({ x: 0, y: 0 });
    expect(projector.projectUv(createHit({ x: 0, y: 1, z: 0 }), TRIANGLE_UVS)).toEqual({ x: 1, y: 0 });
    expect(projector.projectUv(createHit({ x: 0, y: 0, z: 1 }), TRIANGLE_UVS)).toEqual({ x: 0, y: 1 });
    expect(projector.projectUv(createHit({ x: 1 / 3, y: 1 / 3, z: 1 / 3 }), TRIANGLE_UVS)).toEqual({
      x: 1 / 3,
      y: 1 / 3,
    });
    expect(projector.projectUv(createHit({ x: 0, y: 0.25, z: 0.75 }), TRIANGLE_UVS)).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });

  it("maps normalized UV to a continuous top-left texture pixel coordinate", () => {
    const pixel = projector.projectTexturePixel(
      createHit({ x: 0.25, y: 0.25, z: 0.5 }),
      TRIANGLE_UVS,
      IMAGE,
    );

    expect(pixel).toEqual({ x: 25, y: 100 });
    expect(Object.isFrozen(pixel)).toBe(true);
    expect(projector.projectTexturePixel(createHit({ x: 1, y: 0, z: 0 }), TRIANGLE_UVS, IMAGE)).toEqual({
      x: 0,
      y: 200,
    });
    expect(projector.projectTexturePixel(createHit({ x: 0, y: 1, z: 0 }), TRIANGLE_UVS, IMAGE)).toEqual({
      x: 100,
      y: 200,
    });
    expect(projector.projectTexturePixel(createHit({ x: 0, y: 0, z: 1 }), TRIANGLE_UVS, IMAGE)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("returns no stamp for miss, invalid sums, non-finite values, or out-of-range weights", () => {
    expect(projector.projectUv(null, TRIANGLE_UVS)).toBeNull();
    expect(projector.projectUv(createHit({ x: 0.2, y: 0.2, z: 0.2 }), TRIANGLE_UVS)).toBeNull();
    expect(projector.projectUv(createHit({ x: Number.NaN, y: 0, z: 1 }), TRIANGLE_UVS)).toBeNull();
    expect(projector.projectUv(createHit({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }), TRIANGLE_UVS)).toBeNull();
    expect(projector.projectUv(createHit({ x: -0.001, y: 0.5, z: 0.501 }), TRIANGLE_UVS)).toBeNull();
    expect(projector.projectUv(createHit({ x: 1.001, y: 0, z: -0.001 }), TRIANGLE_UVS)).toBeNull();
  });

  it("returns no stamp for incomplete numeric UV data, out-of-image UV, or invalid image dimensions", () => {
    const nonFiniteUvs = [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: 1 },
    ] as const satisfies CornerUvTuple;
    const outsideUvs = [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 0 },
    ] as const satisfies CornerUvTuple;

    expect(projector.projectUv(createHit({ x: 1, y: 0, z: 0 }), nonFiniteUvs)).toBeNull();
    expect(projector.projectTexturePixel(createHit({ x: 1, y: 0, z: 0 }), outsideUvs, IMAGE)).toBeNull();
    expect(projector.projectTexturePixel(
      createHit({ x: 1, y: 0, z: 0 }),
      TRIANGLE_UVS,
      { ...IMAGE, width: 0 },
    )).toBeNull();
  });

  it("clamps only tolerance-sized seam error and never expands into another chart", () => {
    const seamHit = createHit({ x: -5e-8, y: 0.5, z: 0.50000005 });
    const firstChart: CornerUvTuple = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 1 },
    ];
    const otherChart: CornerUvTuple = [
      { x: 0.75, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];

    const first = projector.projectUv(seamHit, firstChart);
    const other = projector.projectUv(seamHit, otherChart);
    expect(first?.x).toBe(0.5);
    expect(other?.x).toBe(1);
    expect(first).not.toEqual(other);
    expect(projector.projectUv(
      createHit({ x: -2e-7, y: 0.5, z: 0.5000002 }),
      firstChart,
    )).toBeNull();
  });

  it("keeps overlapping charts deterministic by projecting only the supplied hit tuple", () => {
    const hit = createHit({ x: 0.2, y: 0.3, z: 0.5 });
    const overlapped: CornerUvTuple = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.9 },
    ];
    const unrelated: CornerUvTuple = [
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
      { x: 0.9, y: 0.1 },
    ];

    const overlappedUv = projector.projectUv(hit, overlapped);
    const unrelatedUv = projector.projectUv(hit, unrelated);
    expect(overlappedUv?.x).toBeCloseTo(0.34, 12);
    expect(overlappedUv?.y).toBeCloseTo(0.5, 12);
    expect(unrelatedUv?.x).toBeCloseTo(0.66, 12);
    expect(unrelatedUv?.y).toBeCloseTo(0.5, 12);
  });
});
