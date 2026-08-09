import {
  NUMERIC_TOLERANCE_POLICY,
  type EdgeId,
  type MeshQuery,
  type Vec3,
  type VertexId,
} from "@octopoly/contracts";
import type {
  RetopoChainPoint,
  RetopoSurfaceChain,
} from "../surface-chain";

export type QuadInferenceRejectionReason =
  | "chain-length-mismatch"
  | "insufficient-chain-points"
  | "non-finite-geometry"
  | "missing-mesh-anchor"
  | "duplicate-corner"
  | "degenerate-quad"
  | "inconsistent-winding"
  | "non-manifold-risk";

export interface QuadBridgeCandidate {
  readonly first: readonly [EdgeId];
  readonly second: readonly [EdgeId];
}

export interface QuadCandidate {
  readonly index: number;
  readonly corners: readonly [
    RetopoChainPoint,
    RetopoChainPoint,
    RetopoChainPoint,
    RetopoChainPoint,
  ];
  readonly normal: Vec3;
  readonly bridge: QuadBridgeCandidate | null;
}

export type QuadInferenceResult =
  | { readonly kind: "accepted"; readonly candidates: ReadonlyArray<QuadCandidate> }
  | {
      readonly kind: "rejected";
      readonly reason: QuadInferenceRejectionReason;
      readonly candidateIndex: number | null;
    };

interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function isFiniteVector(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function squaredLength(value: Vec3): number {
  return value.x * value.x + value.y * value.y + value.z * value.z;
}

function normalize(value: Vec3): Vec3 | null {
  const lengthSquared = squaredLength(value);
  const minimum = NUMERIC_TOLERANCE_POLICY.normalizedVector;
  if (!Number.isFinite(lengthSquared) || lengthSquared < minimum * minimum) {
    return null;
  }

  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return {
    x: value.x * inverseLength,
    y: value.y * inverseLength,
    z: value.z * inverseLength,
  };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function createBounds(points: ReadonlyArray<Vec3>): Bounds | null {
  const first = points[0];
  if (first === undefined || !isFiniteVector(first)) {
    return null;
  }

  const bounds: Bounds = {
    minX: first.x,
    minY: first.y,
    minZ: first.z,
    maxX: first.x,
    maxY: first.y,
    maxZ: first.z,
  };

  for (const point of points) {
    if (!isFiniteVector(point)) {
      return null;
    }
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  }

  return bounds;
}

function sceneScale(mesh: MeshQuery, first: RetopoSurfaceChain, second: RetopoSurfaceChain): number | null {
  const positions = [
    ...mesh.snapshot().vertices.map((vertex) => vertex.position),
    ...first.points.map((point) => point.position),
    ...second.points.map((point) => point.position),
  ];
  const bounds = createBounds(positions);
  if (bounds === null) {
    return null;
  }

  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  const dz = bounds.maxZ - bounds.minZ;
  return Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
}

function squaredDistance(left: Vec3, right: Vec3): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
}

function newellVector(
  corners: readonly [RetopoChainPoint, RetopoChainPoint, RetopoChainPoint, RetopoChainPoint],
): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;

  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    if (current === undefined || next === undefined) {
      throw new Error("quad corners must contain exactly four points");
    }
    x += (current.position.y - next.position.y) * (current.position.z + next.position.z);
    y += (current.position.z - next.position.z) * (current.position.x + next.position.x);
    z += (current.position.x - next.position.x) * (current.position.y + next.position.y);
  }

  return { x, y, z };
}

function averageNormal(
  corners: readonly [RetopoChainPoint, RetopoChainPoint, RetopoChainPoint, RetopoChainPoint],
): Vec3 | null {
  const sum = corners.reduce<Vec3>(
    (result, point) => ({
      x: result.x + point.normal.x,
      y: result.y + point.normal.y,
      z: result.z + point.normal.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return normalize(sum);
}

function vertexId(point: RetopoChainPoint): VertexId | null {
  return point.anchor.kind === "vertex" ? point.anchor.vertex : null;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePoints(left: RetopoChainPoint, right: RetopoChainPoint): number {
  const leftKind = left.anchor.kind === "vertex" ? 0 : left.anchor.kind === "edge" ? 1 : 2;
  const rightKind = right.anchor.kind === "vertex" ? 0 : right.anchor.kind === "edge" ? 1 : 2;
  let comparison = compareNumbers(leftKind, rightKind);
  if (comparison !== 0) {
    return comparison;
  }

  if (left.anchor.kind === "vertex" && right.anchor.kind === "vertex") {
    comparison = compareNumbers(left.anchor.vertex, right.anchor.vertex);
  } else if (left.anchor.kind === "edge" && right.anchor.kind === "edge") {
    comparison = compareNumbers(left.anchor.edge, right.anchor.edge);
    if (comparison === 0) {
      comparison = compareNumbers(left.anchor.t, right.anchor.t);
    }
  }
  if (comparison !== 0) {
    return comparison;
  }

  comparison = compareNumbers(left.position.x, right.position.x);
  if (comparison === 0) comparison = compareNumbers(left.position.y, right.position.y);
  if (comparison === 0) comparison = compareNumbers(left.position.z, right.position.z);
  if (comparison === 0) comparison = compareNumbers(left.inputIndex, right.inputIndex);
  return comparison;
}

function rotateToCanonicalCorner(
  corners: readonly [RetopoChainPoint, RetopoChainPoint, RetopoChainPoint, RetopoChainPoint],
): readonly [RetopoChainPoint, RetopoChainPoint, RetopoChainPoint, RetopoChainPoint] {
  let firstIndex = 0;
  for (let index = 1; index < corners.length; index += 1) {
    const candidate = corners[index];
    const current = corners[firstIndex];
    if (candidate !== undefined && current !== undefined && comparePoints(candidate, current) < 0) {
      firstIndex = index;
    }
  }

  const first = corners[firstIndex];
  const second = corners[(firstIndex + 1) % 4];
  const third = corners[(firstIndex + 2) % 4];
  const fourth = corners[(firstIndex + 3) % 4];
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    throw new Error("quad corners must contain exactly four points");
  }
  return [first, second, third, fourth];
}

function segmentEdge(chain: RetopoSurfaceChain, segmentIndex: number, mesh: MeshQuery): EdgeId | null {
  const segment = chain.segments.find(
    (candidate) =>
      (candidate.from === segmentIndex && candidate.to === segmentIndex + 1) ||
      (candidate.to === segmentIndex && candidate.from === segmentIndex + 1),
  );
  if (segment?.continuity.kind === "mesh-edge") {
    return segment.continuity.edge;
  }

  const from = chain.points[segmentIndex];
  const to = chain.points[segmentIndex + 1];
  if (from === undefined || to === undefined) {
    return null;
  }
  const fromVertex = vertexId(from);
  const toVertex = vertexId(to);
  return fromVertex === null || toVertex === null ? null : mesh.findEdge(fromVertex, toVertex);
}

function hasNonManifoldPerimeter(
  corners: readonly [RetopoChainPoint, RetopoChainPoint, RetopoChainPoint, RetopoChainPoint],
  mesh: MeshQuery,
): boolean {
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    if (current === undefined || next === undefined) {
      return true;
    }
    const currentVertex = vertexId(current);
    const nextVertex = vertexId(next);
    if (currentVertex === null || nextVertex === null) {
      continue;
    }
    const edge = mesh.findEdge(currentVertex, nextVertex);
    if (edge !== null && mesh.adjacentFaces(edge).length >= 2) {
      return true;
    }
  }
  return false;
}

function rejection(
  reason: QuadInferenceRejectionReason,
  candidateIndex: number | null,
): QuadInferenceResult {
  return Object.freeze({ kind: "rejected", reason, candidateIndex });
}

/**
 * Infers a deterministic quad strip between two equally sampled surface chains.
 * The function only queries topology through MeshQuery and never mutates it.
 */
export function inferQuadStrip(
  first: RetopoSurfaceChain,
  second: RetopoSurfaceChain,
  mesh: MeshQuery,
): QuadInferenceResult {
  if (first.points.length !== second.points.length) {
    return rejection("chain-length-mismatch", null);
  }
  if (first.points.length < 2) {
    return rejection("insufficient-chain-points", null);
  }

  const scale = sceneScale(mesh, first, second);
  if (scale === null) {
    return rejection("non-finite-geometry", null);
  }
  const distanceTolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * scale,
  );
  const areaTolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance * NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.areaScaleFactor * scale * scale,
  );

  const candidates: QuadCandidate[] = [];
  for (let index = 0; index < first.points.length - 1; index += 1) {
    const firstStart = first.points[index];
    const firstEnd = first.points[index + 1];
    const secondStart = second.points[index];
    const secondEnd = second.points[index + 1];
    if (
      firstStart === undefined ||
      firstEnd === undefined ||
      secondStart === undefined ||
      secondEnd === undefined
    ) {
      throw new Error("chain length changed during quad inference");
    }

    let corners: readonly [
      RetopoChainPoint,
      RetopoChainPoint,
      RetopoChainPoint,
      RetopoChainPoint,
    ] = [firstStart, firstEnd, secondEnd, secondStart];

    if (corners.some((point) => !isFiniteVector(point.position) || !isFiniteVector(point.normal))) {
      return rejection("non-finite-geometry", index);
    }
    if (corners.some((point) => point.anchor.kind === "edge" && !Number.isFinite(point.anchor.t))) {
      return rejection("non-finite-geometry", index);
    }
    if (corners.some((point) => {
      if (point.anchor.kind === "vertex") {
        return mesh.vertex(point.anchor.vertex) === null;
      }
      if (point.anchor.kind !== "edge" || point.anchor.t < 0 || point.anchor.t > 1) {
        return point.anchor.kind === "edge";
      }
      const edge = mesh.edge(point.anchor.edge);
      return edge === null ||
        !edge.vertices.includes(point.anchor.vertices[0]) ||
        !edge.vertices.includes(point.anchor.vertices[1]);
    })) {
      return rejection("missing-mesh-anchor", index);
    }

    for (let left = 0; left < corners.length; left += 1) {
      for (let right = left + 1; right < corners.length; right += 1) {
        const leftPoint = corners[left];
        const rightPoint = corners[right];
        if (leftPoint === undefined || rightPoint === undefined) {
          throw new Error("quad corners must contain exactly four points");
        }
        const leftVertex = vertexId(leftPoint);
        const rightVertex = vertexId(rightPoint);
        if (
          (leftVertex !== null && leftVertex === rightVertex) ||
          squaredDistance(leftPoint.position, rightPoint.position) <= distanceTolerance * distanceTolerance
        ) {
          return rejection("duplicate-corner", index);
        }
      }
    }

    let polygonVector = newellVector(corners);
    const doubledArea = Math.sqrt(squaredLength(polygonVector));
    if (!Number.isFinite(doubledArea) || doubledArea * 0.5 <= areaTolerance) {
      return rejection("degenerate-quad", index);
    }
    const desiredNormal = averageNormal(corners);
    const polygonNormal = normalize(polygonVector);
    if (desiredNormal === null || polygonNormal === null) {
      return rejection("inconsistent-winding", index);
    }

    const alignment = dot(polygonNormal, desiredNormal);
    if (!Number.isFinite(alignment) || Math.abs(alignment) <= Math.sin(NUMERIC_TOLERANCE_POLICY.angleRadians)) {
      return rejection("inconsistent-winding", index);
    }
    if (alignment < 0) {
      corners = [corners[0], corners[3], corners[2], corners[1]];
      polygonVector = {
        x: -polygonVector.x,
        y: -polygonVector.y,
        z: -polygonVector.z,
      };
    }
    corners = rotateToCanonicalCorner(corners);

    if (hasNonManifoldPerimeter(corners, mesh)) {
      return rejection("non-manifold-risk", index);
    }

    const firstEdge = segmentEdge(first, index, mesh);
    const secondEdge = segmentEdge(second, index, mesh);
    let bridge: QuadBridgeCandidate | null = null;
    if (firstEdge !== null && secondEdge !== null) {
      if (
        mesh.edge(firstEdge) === null ||
        mesh.edge(secondEdge) === null ||
        firstEdge === secondEdge ||
        mesh.adjacentFaces(firstEdge).length >= 2 ||
        mesh.adjacentFaces(secondEdge).length >= 2
      ) {
        return rejection("non-manifold-risk", index);
      }
      bridge = Object.freeze(
        firstEdge < secondEdge
          ? {
              first: Object.freeze([firstEdge]) as readonly [EdgeId],
              second: Object.freeze([secondEdge]) as readonly [EdgeId],
            }
          : {
              first: Object.freeze([secondEdge]) as readonly [EdgeId],
              second: Object.freeze([firstEdge]) as readonly [EdgeId],
            },
      );
    }

    candidates.push(Object.freeze({
      index,
      corners: Object.freeze([...corners]) as QuadCandidate["corners"],
      normal: Object.freeze(normalize(polygonVector) ?? polygonNormal),
      bridge,
    }));
  }

  return Object.freeze({ kind: "accepted", candidates: Object.freeze(candidates) });
}
