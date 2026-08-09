import type { Disposable, ReferenceSurfaceId, SurfaceTriangleId } from "./fundamental";
import type { Mat4, Ray, Vec3 } from "./math";
import type { TriangleMeshSnapshot } from "./mesh";

export interface SurfaceHit {
  readonly surfaceId: ReferenceSurfaceId;
  readonly triangleId: SurfaceTriangleId;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly barycentric: Vec3;
  readonly distance: number;
}

export interface SurfaceQuery {
  raycast(ray: Ray, maxDistance?: number): SurfaceHit | null;
  nearest(point: Vec3, maxDistance?: number): SurfaceHit | null;
}

export interface ReferenceSurface extends Disposable {
  readonly id: ReferenceSurfaceId;
  readonly geometry: TriangleMeshSnapshot;
  readonly query: SurfaceQuery;
}

export interface ReferenceSurfaceFactory {
  create(id: ReferenceSurfaceId, geometry: TriangleMeshSnapshot, worldTransform: Mat4): ReferenceSurface;
}
