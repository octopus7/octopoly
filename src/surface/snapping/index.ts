import type {
  CameraSnapshot,
  PickingService,
  Ray,
  SurfaceHit,
  SurfaceQuery,
  Vec2,
  Vec3,
  ViewportSnapshot,
} from "@octopoly/contracts";

export function snapRayToSurface(
  ray: Ray,
  surface: SurfaceQuery,
  maxDistance?: number,
): SurfaceHit | null {
  return maxDistance === undefined ? surface.raycast(ray) : surface.raycast(ray, maxDistance);
}

export function snapPointToSurface(
  point: Vec3,
  surface: SurfaceQuery,
  maxDistance?: number,
): SurfaceHit | null {
  return maxDistance === undefined ? surface.nearest(point) : surface.nearest(point, maxDistance);
}

export function snapScreenPointToSurface(
  point: Vec2,
  camera: CameraSnapshot,
  viewport: ViewportSnapshot,
  picking: PickingService,
  surface: SurfaceQuery,
  maxDistance?: number,
): SurfaceHit | null {
  return snapRayToSurface(
    picking.rayFromScreen(point, camera, viewport),
    surface,
    maxDistance,
  );
}
