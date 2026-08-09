import type { Ray, SurfaceTriangleId, Vec3 } from "@octopoly/contracts";

/** Return the current closest accepted distance to tighten later BVH pruning. */
type TriangleCandidateVisitor = (triangleId: SurfaceTriangleId) => number | undefined;

/** Workstream-internal boundary implemented by the spatial acceleration structure. */
export interface SurfaceCandidateSource {
  forEachRayCandidate(
    ray: Ray,
    maxDistance: number | undefined,
    visit: TriangleCandidateVisitor,
  ): void;
  forEachNearestCandidate(
    point: Vec3,
    maxDistance: number | undefined,
    visit: TriangleCandidateVisitor,
  ): void;
}
