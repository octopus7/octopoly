import type {
  Mat4,
  ReferenceSurface,
  ReferenceSurfaceFactory,
  ReferenceSurfaceId,
  TriangleMeshSnapshot,
} from "@octopoly/contracts";

import { prepareReferenceGeometry } from "./geometry/prepared-reference-geometry";
import { ReferenceSurfaceImpl } from "./surface";
import { createSurfaceSpatialIndex } from "../spatial/bvh";

export class ReferenceSurfaceFactoryImpl implements ReferenceSurfaceFactory {
  create(
    id: ReferenceSurfaceId,
    geometry: TriangleMeshSnapshot,
    worldTransform: Mat4,
  ): ReferenceSurface {
    const prepared = prepareReferenceGeometry(geometry, worldTransform);
    try {
      const spatial = createSurfaceSpatialIndex(prepared);
      try {
        return new ReferenceSurfaceImpl(id, prepared, spatial);
      } catch (error) {
        spatial.dispose();
        throw error;
      }
    } catch (error) {
      prepared.dispose();
      throw error;
    }
  }
}

export function createReferenceSurfaceFactory(): ReferenceSurfaceFactory {
  return new ReferenceSurfaceFactoryImpl();
}
