import type { Disposable, Ray, SurfaceTriangleId, Vec3 } from "@octopoly/contracts";

import type { PreparedReferenceGeometry } from "../reference/geometry/prepared-reference-geometry";
import { aabbWithinDistance, rayAabbEntryDistance } from "./aabb";

const LEAF_TRIANGLE_LIMIT = 8;
const EMPTY_FLOAT64 = new Float64Array(0);
const EMPTY_UINT32 = new Uint32Array(0);

type CandidateVisitor = (triangleId: SurfaceTriangleId) => number | undefined;

export interface SurfaceSpatialIndexStats {
  readonly triangleCount: number;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly retainedBytes: number;
  readonly estimatedBuildPeakBytes: number;
  readonly buildMilliseconds: number;
}

export interface SurfaceSpatialIndex extends Disposable {
  readonly stats: SurfaceSpatialIndexStats;
  forEachRayCandidate(ray: Ray, maxDistance: number | undefined, visit: CandidateVisitor): void;
  forEachNearestCandidate(
    point: Vec3,
    maxDistance: number | undefined,
    visit: CandidateVisitor,
  ): void;
}

export function createSurfaceSpatialIndex(
  geometry: PreparedReferenceGeometry,
): SurfaceSpatialIndex {
  geometry.assertUsable();
  const buildStart = performance.now();
  const validTriangleIds = geometry.validTriangleIds;
  const triangleCount = validTriangleIds.length;
  if (triangleCount > 0xffff_ffff) {
    throw new RangeError("surface spatial index exceeds Uint32 capacity");
  }

  if (triangleCount === 0) {
    return new SurfaceSpatialIndexImpl(
      geometry,
      EMPTY_FLOAT64,
      EMPTY_UINT32,
      EMPTY_UINT32,
      EMPTY_UINT32,
      EMPTY_UINT32,
      Object.freeze({
        triangleCount: 0,
        nodeCount: 0,
        maxDepth: 0,
        retainedBytes: 0,
        estimatedBuildPeakBytes: 0,
        buildMilliseconds: performance.now() - buildStart,
      }),
    );
  }

  const triangleIds = new Uint32Array(triangleCount);
  const triangleBounds = new Float64Array(triangleCount * 6);
  let centroidMinX = Number.POSITIVE_INFINITY;
  let centroidMinY = Number.POSITIVE_INFINITY;
  let centroidMinZ = Number.POSITIVE_INFINITY;
  let centroidMaxX = Number.NEGATIVE_INFINITY;
  let centroidMaxY = Number.NEGATIVE_INFINITY;
  let centroidMaxZ = Number.NEGATIVE_INFINITY;

  for (let entry = 0; entry < triangleCount; entry += 1) {
    const triangleId = validTriangleIds[entry];
    if (triangleId === undefined) {
      throw new Error("prepared triangle id is unexpectedly missing");
    }
    const triangle = geometry.triangle(triangleId);
    triangleIds[entry] = triangleId;
    const offset = entry * 6;
    triangleBounds[offset] = triangle.bounds.min.x;
    triangleBounds[offset + 1] = triangle.bounds.min.y;
    triangleBounds[offset + 2] = triangle.bounds.min.z;
    triangleBounds[offset + 3] = triangle.bounds.max.x;
    triangleBounds[offset + 4] = triangle.bounds.max.y;
    triangleBounds[offset + 5] = triangle.bounds.max.z;
    centroidMinX = Math.min(centroidMinX, triangle.centroid.x);
    centroidMinY = Math.min(centroidMinY, triangle.centroid.y);
    centroidMinZ = Math.min(centroidMinZ, triangle.centroid.z);
    centroidMaxX = Math.max(centroidMaxX, triangle.centroid.x);
    centroidMaxY = Math.max(centroidMaxY, triangle.centroid.y);
    centroidMaxZ = Math.max(centroidMaxZ, triangle.centroid.z);
  }

  const mortonCodes = new Uint32Array(triangleCount);
  const order = Array.from({ length: triangleCount }, (_, entry) => entry);
  for (let entry = 0; entry < triangleCount; entry += 1) {
    const boundsOffset = entry * 6;
    const centroidX =
      (requiredFloat(triangleBounds, boundsOffset) + requiredFloat(triangleBounds, boundsOffset + 3)) /
      2;
    const centroidY =
      (requiredFloat(triangleBounds, boundsOffset + 1) +
        requiredFloat(triangleBounds, boundsOffset + 4)) /
      2;
    const centroidZ =
      (requiredFloat(triangleBounds, boundsOffset + 2) +
        requiredFloat(triangleBounds, boundsOffset + 5)) /
      2;
    mortonCodes[entry] = mortonCode(
      normalizedCoordinate(centroidX, centroidMinX, centroidMaxX),
      normalizedCoordinate(centroidY, centroidMinY, centroidMaxY),
      normalizedCoordinate(centroidZ, centroidMinZ, centroidMaxZ),
    );
  }
  order.sort((left, right) => {
    const codeDifference = requiredUint(mortonCodes, left) - requiredUint(mortonCodes, right);
    if (codeDifference !== 0) {
      return codeDifference;
    }
    return requiredUint(triangleIds, left) - requiredUint(triangleIds, right);
  });

  const leafTriangleIds = new Uint32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) {
    leafTriangleIds[index] = requiredUint(triangleIds, requiredOrderEntry(order, index));
  }

  const subtreeNodeCounts = calculateSubtreeNodeCounts(triangleCount);
  const nodeCount = requiredMapValue(subtreeNodeCounts, triangleCount);
  const nodeBounds = new Float64Array(nodeCount * 6);
  const leafStarts = new Uint32Array(nodeCount);
  const leafCounts = new Uint32Array(nodeCount);
  const escapeIndices = new Uint32Array(nodeCount);
  let maxDepth = 0;

  const tasks: BuildTask[] = [{ node: 0, start: 0, count: triangleCount, depth: 0 }];
  while (tasks.length > 0) {
    const task = tasks.pop();
    if (task === undefined) {
      break;
    }
    maxDepth = Math.max(maxDepth, task.depth);
    escapeIndices[task.node] = task.node + requiredMapValue(subtreeNodeCounts, task.count);
    if (task.count <= LEAF_TRIANGLE_LIMIT) {
      leafStarts[task.node] = task.start;
      leafCounts[task.node] = task.count;
      continue;
    }

    const leftCount = Math.floor(task.count / 2);
    const rightCount = task.count - leftCount;
    const leftNode = task.node + 1;
    const rightNode = leftNode + requiredMapValue(subtreeNodeCounts, leftCount);
    tasks.push({
      node: rightNode,
      start: task.start + leftCount,
      count: rightCount,
      depth: task.depth + 1,
    });
    tasks.push({ node: leftNode, start: task.start, count: leftCount, depth: task.depth + 1 });
  }

  for (let node = nodeCount - 1; node >= 0; node -= 1) {
    const count = requiredUint(leafCounts, node);
    if (count > 0) {
      const start = requiredUint(leafStarts, node);
      setLeafBounds(nodeBounds, node, start, count, order, triangleBounds);
      continue;
    }
    const leftNode = node + 1;
    const rightNode = requiredUint(escapeIndices, leftNode);
    setUnionBounds(nodeBounds, node, leftNode, rightNode);
  }

  const retainedBytes =
    nodeBounds.byteLength +
    leafStarts.byteLength +
    leafCounts.byteLength +
    escapeIndices.byteLength +
    leafTriangleIds.byteLength;
  const estimatedBuildPeakBytes =
    retainedBytes +
    triangleIds.byteLength +
    triangleBounds.byteLength +
    mortonCodes.byteLength +
    order.length * 8;
  const stats = Object.freeze({
    triangleCount,
    nodeCount,
    maxDepth,
    retainedBytes,
    estimatedBuildPeakBytes,
    buildMilliseconds: performance.now() - buildStart,
  });

  return new SurfaceSpatialIndexImpl(
    geometry,
    nodeBounds,
    leafStarts,
    leafCounts,
    escapeIndices,
    leafTriangleIds,
    stats,
  );
}

class SurfaceSpatialIndexImpl implements SurfaceSpatialIndex {
  private disposed = false;

  constructor(
    private readonly geometry: PreparedReferenceGeometry,
    private nodeBounds: Float64Array,
    private leafStarts: Uint32Array,
    private leafCounts: Uint32Array,
    private escapeIndices: Uint32Array,
    private leafTriangleIds: Uint32Array,
    readonly stats: SurfaceSpatialIndexStats,
  ) {}

  forEachRayCandidate(ray: Ray, maxDistance: number | undefined, visit: CandidateVisitor): void {
    this.assertUsable();
    let activeDistance = maxDistance;
    let node = 0;
    while (node < this.leafCounts.length) {
      const boundsOffset = node * 6;
      const entryDistance = rayAabbEntryDistance(
        ray,
        requiredFloat(this.nodeBounds, boundsOffset),
        requiredFloat(this.nodeBounds, boundsOffset + 1),
        requiredFloat(this.nodeBounds, boundsOffset + 2),
        requiredFloat(this.nodeBounds, boundsOffset + 3),
        requiredFloat(this.nodeBounds, boundsOffset + 4),
        requiredFloat(this.nodeBounds, boundsOffset + 5),
        this.geometry.sceneScale,
        activeDistance,
      );
      if (entryDistance === null) {
        node = requiredUint(this.escapeIndices, node);
        continue;
      }

      const count = requiredUint(this.leafCounts, node);
      if (count > 0) {
        const start = requiredUint(this.leafStarts, node);
        for (let offset = 0; offset < count; offset += 1) {
          activeDistance = tightenDistance(
            activeDistance,
            visit(requiredUint(this.leafTriangleIds, start + offset)),
          );
        }
      }
      node += 1;
    }
  }

  forEachNearestCandidate(
    point: Vec3,
    maxDistance: number | undefined,
    visit: CandidateVisitor,
  ): void {
    this.assertUsable();
    let activeDistance = maxDistance;
    let node = 0;
    while (node < this.leafCounts.length) {
      const boundsOffset = node * 6;
      if (
        !aabbWithinDistance(
          point,
          requiredFloat(this.nodeBounds, boundsOffset),
          requiredFloat(this.nodeBounds, boundsOffset + 1),
          requiredFloat(this.nodeBounds, boundsOffset + 2),
          requiredFloat(this.nodeBounds, boundsOffset + 3),
          requiredFloat(this.nodeBounds, boundsOffset + 4),
          requiredFloat(this.nodeBounds, boundsOffset + 5),
          this.geometry.sceneScale,
          activeDistance,
        )
      ) {
        node = requiredUint(this.escapeIndices, node);
        continue;
      }

      const count = requiredUint(this.leafCounts, node);
      if (count > 0) {
        const start = requiredUint(this.leafStarts, node);
        for (let offset = 0; offset < count; offset += 1) {
          activeDistance = tightenDistance(
            activeDistance,
            visit(requiredUint(this.leafTriangleIds, start + offset)),
          );
        }
      }
      node += 1;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.nodeBounds = EMPTY_FLOAT64;
    this.leafStarts = EMPTY_UINT32;
    this.leafCounts = EMPTY_UINT32;
    this.escapeIndices = EMPTY_UINT32;
    this.leafTriangleIds = EMPTY_UINT32;
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("surface spatial index is disposed");
    }
    this.geometry.assertUsable();
  }
}

interface BuildTask {
  readonly node: number;
  readonly start: number;
  readonly count: number;
  readonly depth: number;
}

function calculateSubtreeNodeCounts(rootTriangleCount: number): ReadonlyMap<number, number> {
  const nodeCounts = new Map<number, number>();
  const stack: Array<readonly [number, boolean]> = [[rootTriangleCount, false]];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) {
      break;
    }
    const [count, expanded] = item;
    if (nodeCounts.has(count)) {
      continue;
    }
    if (count <= LEAF_TRIANGLE_LIMIT) {
      nodeCounts.set(count, 1);
      continue;
    }
    const leftCount = Math.floor(count / 2);
    const rightCount = count - leftCount;
    if (expanded) {
      nodeCounts.set(
        count,
        1 + requiredMapValue(nodeCounts, leftCount) + requiredMapValue(nodeCounts, rightCount),
      );
      continue;
    }
    stack.push([count, true]);
    if (!nodeCounts.has(rightCount)) {
      stack.push([rightCount, false]);
    }
    if (!nodeCounts.has(leftCount)) {
      stack.push([leftCount, false]);
    }
  }
  return nodeCounts;
}

function setLeafBounds(
  nodeBounds: Float64Array,
  node: number,
  start: number,
  count: number,
  order: ReadonlyArray<number>,
  triangleBounds: Float64Array,
): void {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < count; offset += 1) {
    const triangleEntry = requiredOrderEntry(order, start + offset);
    const triangleOffset = triangleEntry * 6;
    minX = Math.min(minX, requiredFloat(triangleBounds, triangleOffset));
    minY = Math.min(minY, requiredFloat(triangleBounds, triangleOffset + 1));
    minZ = Math.min(minZ, requiredFloat(triangleBounds, triangleOffset + 2));
    maxX = Math.max(maxX, requiredFloat(triangleBounds, triangleOffset + 3));
    maxY = Math.max(maxY, requiredFloat(triangleBounds, triangleOffset + 4));
    maxZ = Math.max(maxZ, requiredFloat(triangleBounds, triangleOffset + 5));
  }
  setBounds(nodeBounds, node, minX, minY, minZ, maxX, maxY, maxZ);
}

function setUnionBounds(
  nodeBounds: Float64Array,
  node: number,
  leftNode: number,
  rightNode: number,
): void {
  const left = leftNode * 6;
  const right = rightNode * 6;
  setBounds(
    nodeBounds,
    node,
    Math.min(requiredFloat(nodeBounds, left), requiredFloat(nodeBounds, right)),
    Math.min(requiredFloat(nodeBounds, left + 1), requiredFloat(nodeBounds, right + 1)),
    Math.min(requiredFloat(nodeBounds, left + 2), requiredFloat(nodeBounds, right + 2)),
    Math.max(requiredFloat(nodeBounds, left + 3), requiredFloat(nodeBounds, right + 3)),
    Math.max(requiredFloat(nodeBounds, left + 4), requiredFloat(nodeBounds, right + 4)),
    Math.max(requiredFloat(nodeBounds, left + 5), requiredFloat(nodeBounds, right + 5)),
  );
}

function setBounds(
  nodeBounds: Float64Array,
  node: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  const offset = node * 6;
  nodeBounds[offset] = minX;
  nodeBounds[offset + 1] = minY;
  nodeBounds[offset + 2] = minZ;
  nodeBounds[offset + 3] = maxX;
  nodeBounds[offset + 4] = maxY;
  nodeBounds[offset + 5] = maxZ;
}

function tightenDistance(current: number | undefined, candidate: number | undefined): number | undefined {
  if (candidate === undefined) {
    return current;
  }
  if (!Number.isFinite(candidate) || candidate < 0) {
    throw new RangeError("candidate visitor distance must be finite and non-negative");
  }
  return current === undefined ? candidate : Math.min(current, candidate);
}

function normalizedCoordinate(value: number, minimum: number, maximum: number): number {
  const extent = maximum - minimum;
  if (!(extent > 0)) {
    return 0;
  }
  return Math.min(1023, Math.max(0, Math.floor(((value - minimum) / extent) * 1023)));
}

function mortonCode(x: number, y: number, z: number): number {
  return (expandTenBits(x) | (expandTenBits(y) << 1) | (expandTenBits(z) << 2)) >>> 0;
}

function expandTenBits(value: number): number {
  let bits = value & 0x000003ff;
  bits = (bits | (bits << 16)) & 0x030000ff;
  bits = (bits | (bits << 8)) & 0x0300f00f;
  bits = (bits | (bits << 4)) & 0x030c30c3;
  bits = (bits | (bits << 2)) & 0x09249249;
  return bits;
}

function requiredMapValue(values: ReadonlyMap<number, number>, key: number): number {
  const value = values.get(key);
  if (value === undefined) {
    throw new Error(`subtree node count for ${key} is unexpectedly missing`);
  }
  return value;
}

function requiredOrderEntry(order: ReadonlyArray<number>, index: number): number {
  const value = order[index];
  if (value === undefined) {
    throw new Error(`triangle order entry ${index} is unexpectedly missing`);
  }
  return value;
}

function requiredFloat(values: Float64Array, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`floating point spatial entry ${index} is unexpectedly missing`);
  }
  return value;
}

function requiredUint(values: Uint32Array, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`integer spatial entry ${index} is unexpectedly missing`);
  }
  return value;
}
