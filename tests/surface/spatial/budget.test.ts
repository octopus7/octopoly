import { describe, expect, it } from "vitest";

import type { TriangleMeshSnapshot } from "@octopoly/contracts";

import { prepareReferenceGeometry } from "../../../src/surface/reference/geometry/prepared-reference-geometry";
import { createSurfaceSpatialIndex } from "../../../src/surface/spatial/bvh";

const requestedTriangles = Number.parseInt(
  process.env.OCTOPOLY_SURFACE_BENCHMARK_TRIANGLES ?? "10000",
  10,
);

describe("surface spatial budget fixture", () => {
  it(
    `builds and queries ${requestedTriangles.toLocaleString()} deterministic triangles`,
    { timeout: 180_000 },
    () => {
      expect(Number.isSafeInteger(requestedTriangles) && requestedTriangles > 0).toBe(true);
      const indices = Array.from({ length: requestedTriangles * 3 }, (_, index) => index % 3);
      const source: TriangleMeshSnapshot = {
        version: 0,
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        indices,
      };
      const prepared = prepareReferenceGeometry(source, {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      });
      const index = createSurfaceSpatialIndex(prepared);
      let rayCandidates = 0;
      let nearestCandidates = 0;
      const queryStart = performance.now();
      index.forEachRayCandidate(
        { origin: { x: 2, y: 2, z: 1 }, direction: { x: 0, y: 0, z: -1 } },
        undefined,
        () => {
          rayCandidates += 1;
          return undefined;
        },
      );
      index.forEachNearestCandidate({ x: 2, y: 2, z: 0 }, 0.25, () => {
        nearestCandidates += 1;
        return undefined;
      });
      const queryMilliseconds = performance.now() - queryStart;
      let pathologicalCandidateVisits = 0;
      const pathologicalStart = performance.now();
      index.forEachRayCandidate(
        { origin: { x: 0.25, y: 0.25, z: 1 }, direction: { x: 0, y: 0, z: -1 } },
        undefined,
        () => {
          pathologicalCandidateVisits += 1;
          return undefined;
        },
      );
      const pathologicalTraversalMilliseconds = performance.now() - pathologicalStart;

      expect(index.stats.triangleCount).toBe(requestedTriangles);
      expect(index.stats.maxDepth).toBeLessThanOrEqual(
        Math.ceil(Math.log2(requestedTriangles / 8)) + 1,
      );
      expect(rayCandidates).toBe(0);
      expect(nearestCandidates).toBe(0);
      expect(pathologicalCandidateVisits).toBe(requestedTriangles);
      expect(queryMilliseconds).toBeGreaterThanOrEqual(0);

      console.info(
        JSON.stringify({
          fixtureTriangles: requestedTriangles,
          ...index.stats,
          representativeMissQueriesMilliseconds: queryMilliseconds,
          pathologicalCandidateVisits,
          pathologicalTraversalMilliseconds,
        }),
      );
    },
  );
});
