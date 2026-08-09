import type { CornerId, EdgeId, FaceId, VertexId } from "./fundamental";
import type { Mat4, Ray, Vec2, Vec3 } from "./math";
import type { MeshSnapshot } from "./mesh";

export interface ViewportSnapshot {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
}

export interface CameraSnapshot {
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewProjection: Mat4;
  readonly position: Vec3;
}

export type PickKind = "vertex" | "edge" | "face";

export interface PickHit {
  readonly kind: PickKind;
  readonly distance: number;
  readonly position: Vec3;
  readonly vertex?: VertexId;
  readonly edge?: EdgeId;
  readonly face?: FaceId;
}

export interface PickingService {
  rayFromScreen(point: Vec2, camera: CameraSnapshot, viewport: ViewportSnapshot): Ray;
  pick(
    point: Vec2,
    camera: CameraSnapshot,
    viewport: ViewportSnapshot,
    mesh: MeshSnapshot,
    radiusCssPx: number,
  ): PickHit | null;
}

export interface MeshTriangle {
  readonly face: FaceId;
  readonly corners: readonly [CornerId, CornerId, CornerId];
  readonly vertices: readonly [VertexId, VertexId, VertexId];
  readonly positions: readonly [Vec3, Vec3, Vec3];
}

export interface MeshTriangleHit extends MeshTriangle {
  readonly meshVersion: number;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly barycentric: Vec3;
  readonly distance: number;
}

export interface MeshTriangulationService {
  triangles(mesh: MeshSnapshot): ReadonlyArray<MeshTriangle>;
  raycast(ray: Ray, mesh: MeshSnapshot, maxDistance?: number): MeshTriangleHit | null;
}
