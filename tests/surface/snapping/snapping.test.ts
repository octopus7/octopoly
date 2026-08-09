import { describe, expect, it, vi } from "vitest";

import type {
  CameraSnapshot,
  PickHit,
  PickingService,
  Ray,
  SurfaceHit,
  SurfaceQuery,
  ViewportSnapshot,
} from "@octopoly/contracts";
import {
  snapPointToSurface,
  snapRayToSurface,
  snapScreenPointToSurface,
} from "../../../src/surface/snapping";
import { identityMat4 } from "../../../src/transforms";

const hit: SurfaceHit = Object.freeze({
  surfaceId: "reference",
  triangleId: 4,
  position: Object.freeze({ x: 1, y: 2, z: 3 }),
  normal: Object.freeze({ x: 0, y: 1, z: 0 }),
  barycentric: Object.freeze({ x: 0.2, y: 0.3, z: 0.5 }),
  distance: 6,
});
const ray: Ray = Object.freeze({
  origin: Object.freeze({ x: 0, y: 0, z: 0 }),
  direction: Object.freeze({ x: 0, y: 0, z: -1 }),
});

describe("surface snapping adapters", () => {
  it("preserves hit, miss, and max-distance behavior from an injected SurfaceQuery", () => {
    const raycast = vi.fn((_ray: Ray, maxDistance?: number) => maxDistance === 5 ? null : hit);
    const nearest = vi.fn(() => hit);
    const surface: SurfaceQuery = { raycast, nearest };

    expect(snapRayToSurface(ray, surface)).toBe(hit);
    expect(snapRayToSurface(ray, surface, 5)).toBeNull();
    expect(raycast).toHaveBeenNthCalledWith(1, ray);
    expect(raycast).toHaveBeenNthCalledWith(2, ray, 5);
    expect(snapPointToSurface({ x: 1, y: 1, z: 1 }, surface, 9)).toBe(hit);
    expect(nearest).toHaveBeenCalledWith({ x: 1, y: 1, z: 1 }, 9);
  });

  it("uses PickingService.rayFromScreen before querying the reference surface", () => {
    const camera: CameraSnapshot = Object.freeze({
      view: identityMat4(),
      projection: identityMat4(),
      viewProjection: identityMat4(),
      position: Object.freeze({ x: 0, y: 0, z: 0 }),
    });
    const viewport: ViewportSnapshot = Object.freeze({ cssWidth: 100, cssHeight: 100, devicePixelRatio: 2 });
    const rayFromScreen = vi.fn(() => ray);
    const picking: PickingService = {
      rayFromScreen,
      pick(): PickHit | null {
        return null;
      },
    };
    const raycast = vi.fn(() => hit);
    const surface: SurfaceQuery = { raycast, nearest: () => null };

    expect(snapScreenPointToSurface({ x: 50, y: 50 }, camera, viewport, picking, surface, 10)).toBe(hit);
    expect(rayFromScreen).toHaveBeenCalledWith({ x: 50, y: 50 }, camera, viewport);
    expect(raycast).toHaveBeenCalledWith(ray, 10);
  });
});
