import type { ReferenceSurface, ReferenceSurfaceId, TriangleMeshSnapshot } from "@octopoly/contracts";

import type { PreparedReferenceGeometry } from "./geometry/prepared-reference-geometry";
import type { SurfaceSpatialIndex } from "../spatial/bvh";
import { SurfaceQueryImpl } from "../query/surface-query";

export class ReferenceSurfaceImpl implements ReferenceSurface {
  readonly geometry: TriangleMeshSnapshot;
  readonly query: SurfaceQueryImpl;

  private disposed = false;

  constructor(
    readonly id: ReferenceSurfaceId,
    private readonly prepared: PreparedReferenceGeometry,
    private readonly spatial: SurfaceSpatialIndex,
  ) {
    this.geometry = prepared.geometry;
    this.query = new SurfaceQueryImpl(id, prepared, spatial);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.query.dispose();
    this.spatial.dispose();
    this.prepared.dispose();
  }
}
