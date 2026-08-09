import { describe, expect, it } from "vitest";

import type { Mat4, TriangleMeshSnapshot } from "@octopoly/contracts";

import { prepareReferenceGeometry } from "../../../src/surface/reference/geometry/prepared-reference-geometry";
import { createSurfaceSpatialIndex } from "../../../src/surface/spatial/bvh";

const identity: Mat4 = {
  elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};

function separatedTriangles(count: number): TriangleMeshSnapshot {
  const positions = [];
  const indices = [];
  for (let triangle = 0; triangle < count; triangle += 1) {
    const x = triangle * 10;
    const base = positions.length;
    positions.push(
      { x, y: 0, z: 0 },
      { x: x + 1, y: 0, z: 0 },
      { x, y: 1, z: 0 },
    );
    indices.push(base, base + 1, base + 2);
  }
  return { version: 0, positions, indices };
}

describe("SurfaceSpatialIndex", () => {
  it("builds a deterministic balanced flat hierarchy", () => {
    const firstGeometry = prepareReferenceGeometry(separatedTriangles(33), identity);
    const secondGeometry = prepareReferenceGeometry(separatedTriangles(33), identity);
    const first = createSurfaceSpatialIndex(firstGeometry);
    const second = createSurfaceSpatialIndex(secondGeometry);
    const firstIds: number[] = [];
    const secondIds: number[] = [];
    const ray = { origin: { x: -1, y: 0.25, z: 1 }, direction: { x: 0, y: 0, z: -1 } };

    first.forEachRayCandidate(ray, undefined, (id) => {
      firstIds.push(id);
      return undefined;
    });
    second.forEachRayCandidate(ray, undefined, (id) => {
      secondIds.push(id);
      return undefined;
    });

    expect({ ...first.stats, buildMilliseconds: 0 }).toEqual({
      ...second.stats,
      buildMilliseconds: 0,
    });
    expect(first.stats.triangleCount).toBe(33);
    expect(first.stats.maxDepth).toBeLessThanOrEqual(3);
    expect(firstIds).toEqual(secondIds);
    expect(firstIds).toEqual([]);
  });

  it("prunes ray candidates by bounds and a dynamically tightened distance", () => {
    const geometry = prepareReferenceGeometry(separatedTriangles(64), identity);
    const index = createSurfaceSpatialIndex(geometry);
    const visited: number[] = [];

    index.forEachRayCandidate(
      { origin: { x: 0.25, y: 0.25, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
      undefined,
      (id) => {
        visited.push(id);
        return 10;
      },
    );

    expect(visited[0]).toBe(0);
    expect(visited).toHaveLength(8);
    expect(visited.length).toBeLessThan(64);
  });

  it("prunes nearest candidates after the visitor publishes its current best distance", () => {
    const geometry = prepareReferenceGeometry(separatedTriangles(128), identity);
    const index = createSurfaceSpatialIndex(geometry);
    const visited: number[] = [];

    index.forEachNearestCandidate({ x: 0.25, y: 0.25, z: 0.1 }, undefined, (id) => {
      visited.push(id);
      return 0.1;
    });

    expect(visited[0]).toBe(0);
    expect(visited).toHaveLength(8);
    expect(visited.length).toBeLessThan(128);
  });

  it("excludes degenerate triangles while preserving input-order ids", () => {
    const geometry = prepareReferenceGeometry(
      {
        version: 0,
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        indices: [0, 1, 2, 0, 1, 3],
      },
      identity,
    );
    const index = createSurfaceSpatialIndex(geometry);
    const visited: number[] = [];

    index.forEachNearestCandidate({ x: 0, y: 0, z: 0 }, undefined, (id) => {
      visited.push(id);
      return undefined;
    });

    expect(visited).toEqual([1]);
    expect(index.stats.triangleCount).toBe(1);
  });

  it("handles an empty surface without candidates", () => {
    const geometry = prepareReferenceGeometry({ version: 0, positions: [], indices: [] }, identity);
    const index = createSurfaceSpatialIndex(geometry);
    let visits = 0;

    index.forEachRayCandidate(
      { origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } },
      undefined,
      () => {
        visits += 1;
        return undefined;
      },
    );

    expect(visits).toBe(0);
    expect(index.stats).toMatchObject({ triangleCount: 0, nodeCount: 0, retainedBytes: 0 });
  });

  it("releases retained buffers idempotently and rejects stale traversal", () => {
    const geometry = prepareReferenceGeometry(separatedTriangles(4), identity);
    const index = createSurfaceSpatialIndex(geometry);
    index.dispose();
    index.dispose();

    expect(() =>
      index.forEachNearestCandidate({ x: 0, y: 0, z: 0 }, undefined, () => undefined),
    ).toThrow("disposed");
  });

  it("uses an explicit bounded build stack for a pathological ordered fixture", () => {
    const geometry = prepareReferenceGeometry(separatedTriangles(16_384), identity);
    const index = createSurfaceSpatialIndex(geometry);

    expect(index.stats.maxDepth).toBeLessThanOrEqual(11);
    expect(index.stats.nodeCount).toBeLessThan(16_384);
    expect(index.stats.retainedBytes).toBeLessThan(index.stats.estimatedBuildPeakBytes);
  });
});
