import {
  assertNonNegativeSafeInteger,
  NUMERIC_TOLERANCE_POLICY,
} from "@octopoly/contracts";
import type {
  EdgeId,
  EdgeRecord,
  FaceId,
  MeshQuery,
  RetopoStrokeInput,
  SurfaceHit,
  Vec3,
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";

import type {
  RetopoChainAnchor,
  RetopoChainContinuity,
  RetopoChainPoint,
  RetopoChainSegment,
  RetopoSurfaceChain,
  SurfaceChainRejectionReason,
  SurfaceChainResult,
} from "./types";

interface IndexedHit {
  readonly inputIndex: number;
  readonly hit: SurfaceHit;
}

type SnapCandidate =
  | {
      readonly kind: "vertex";
      readonly id: VertexId;
      readonly distance: number;
      readonly position: Vec3;
    }
  | {
      readonly kind: "edge";
      readonly id: EdgeId;
      readonly distance: number;
      readonly position: Vec3;
      readonly vertices: readonly [VertexId, VertexId];
      readonly t: number;
    };

interface MeshCandidates {
  readonly vertices: ReadonlyArray<VertexRecord>;
  readonly edges: ReadonlyArray<EdgeRecord>;
  readonly verticesById: ReadonlyMap<VertexId, VertexRecord>;
  readonly edgesById: ReadonlyMap<EdgeId, EdgeRecord>;
  readonly sceneScale: number;
}

interface SequenceResult {
  readonly hits: ReadonlyArray<IndexedHit>;
  readonly rejection?: {
    readonly reason: SurfaceChainRejectionReason;
    readonly inputIndex: number;
  };
}

const EMPTY_CHAIN: RetopoSurfaceChain = Object.freeze({
  points: Object.freeze([]),
  segments: Object.freeze([]),
});

export function buildSurfaceChain(
  inputs: ReadonlyArray<RetopoStrokeInput>,
  mesh: MeshQuery,
): SurfaceChainResult {
  validateFiniteInputs(inputs);

  const sequence = collectContinuousHits(inputs);
  if (sequence.hits.length === 0) {
    const rejection = sequence.rejection ?? {
      reason: "degenerate-chain" as const,
      inputIndex: 0,
    };
    return rejected(rejection.reason, rejection.inputIndex, EMPTY_CHAIN);
  }

  const candidates = collectMeshCandidates(mesh, sequence.hits);
  const points = buildPoints(sequence.hits, candidates);
  const segments = buildSegments(points, mesh, candidates.edgesById);
  const chain = freezeChain(points, segments);

  if (sequence.rejection !== undefined) {
    return rejected(sequence.rejection.reason, sequence.rejection.inputIndex, chain);
  }
  if (chain.points.length < 2) {
    return rejected(
      "degenerate-chain",
      sequence.hits[sequence.hits.length - 1]?.inputIndex ?? 0,
      chain,
    );
  }
  return Object.freeze({ kind: "complete", chain });
}

function validateFiniteInputs(inputs: ReadonlyArray<RetopoStrokeInput>): void {
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (input === undefined) {
      throw new TypeError(`retopo input ${index} is missing`);
    }

    const sample = input.sample;
    assertFiniteNumber(sample.pointerId, `retopo input ${index} pointer id`);
    assertFiniteNumber(sample.x, `retopo input ${index} sample x`);
    assertFiniteNumber(sample.y, `retopo input ${index} sample y`);
    assertFiniteNumber(sample.pressure, `retopo input ${index} pressure`);
    assertFiniteNumber(sample.tiltX, `retopo input ${index} tilt x`);
    assertFiniteNumber(sample.tiltY, `retopo input ${index} tilt y`);
    assertFiniteNumber(sample.buttons, `retopo input ${index} buttons`);
    assertFiniteNumber(sample.timestamp, `retopo input ${index} timestamp`);
    if (sample.pressure < 0 || sample.pressure > 1) {
      throw new RangeError(`retopo input ${index} pressure must be in the range 0..1`);
    }

    assertFiniteVector(input.ray.origin, `retopo input ${index} ray origin`);
    assertFiniteVector(input.ray.direction, `retopo input ${index} ray direction`);
    const rayLength = vectorLength(input.ray.direction);
    if (!approximatelyEqual(rayLength, 1)) {
      throw new RangeError(`retopo input ${index} ray direction must be normalized`);
    }

    if (input.surfaceHit === null) {
      continue;
    }
    validateFiniteHit(input.surfaceHit, index);
  }
}

function validateFiniteHit(hit: SurfaceHit, inputIndex: number): void {
  if (hit.surfaceId.length === 0) {
    throw new RangeError(`retopo input ${inputIndex} surface id must not be empty`);
  }
  assertNonNegativeSafeInteger(hit.triangleId, `retopo input ${inputIndex} triangle id`);
  assertFiniteVector(hit.position, `retopo input ${inputIndex} hit position`);
  assertFiniteVector(hit.normal, `retopo input ${inputIndex} hit normal`);
  assertFiniteVector(hit.barycentric, `retopo input ${inputIndex} hit barycentric`);
  assertFiniteNumber(hit.distance, `retopo input ${inputIndex} hit distance`);

  if (hit.distance < 0) {
    throw new RangeError(`retopo input ${inputIndex} hit distance must be non-negative`);
  }

  const barycentric = hit.barycentric;
  const barycentricTolerance = NUMERIC_TOLERANCE_POLICY.barycentric;
  if (
    barycentric.x < -barycentricTolerance ||
    barycentric.y < -barycentricTolerance ||
    barycentric.z < -barycentricTolerance ||
    barycentric.x > 1 + barycentricTolerance ||
    barycentric.y > 1 + barycentricTolerance ||
    barycentric.z > 1 + barycentricTolerance ||
    Math.abs(barycentric.x + barycentric.y + barycentric.z - 1) > barycentricTolerance
  ) {
    throw new RangeError(`retopo input ${inputIndex} hit barycentric is invalid`);
  }
}

function collectContinuousHits(inputs: ReadonlyArray<RetopoStrokeInput>): SequenceResult {
  const hits: IndexedHit[] = [];
  let previous: SurfaceHit | undefined;

  for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
    const input = inputs[inputIndex];
    if (input === undefined) {
      throw new TypeError(`retopo input ${inputIndex} is missing`);
    }
    const hit = input.surfaceHit;
    if (hit === null) {
      return Object.freeze({
        hits: Object.freeze(hits),
        rejection: Object.freeze({ reason: "surface-miss", inputIndex }),
      });
    }

    const normalLength = vectorLength(hit.normal);
    if (normalLength < NUMERIC_TOLERANCE_POLICY.normalizedVector) {
      return Object.freeze({
        hits: Object.freeze(hits),
        rejection: Object.freeze({ reason: "degenerate-hit", inputIndex }),
      });
    }

    const normalizedHit = copyHit(hit, scale(hit.normal, 1 / normalLength));
    if (previous !== undefined) {
      if (normalizedHit.surfaceId !== previous.surfaceId) {
        return Object.freeze({
          hits: Object.freeze(hits),
          rejection: Object.freeze({ reason: "surface-discontinuity", inputIndex }),
        });
      }
      const normalDot = dot(previous.normal, normalizedHit.normal);
      if (normalDot <= Math.sin(NUMERIC_TOLERANCE_POLICY.angleRadians)) {
        return Object.freeze({
          hits: Object.freeze(hits),
          rejection: Object.freeze({ reason: "normal-discontinuity", inputIndex }),
        });
      }
    }

    hits.push(Object.freeze({ inputIndex, hit: normalizedHit }));
    previous = normalizedHit;
  }

  return Object.freeze({ hits: Object.freeze(hits) });
}

function collectMeshCandidates(
  mesh: MeshQuery,
  hits: ReadonlyArray<IndexedHit>,
): MeshCandidates {
  const snapshot = mesh.snapshot();
  assertNonNegativeSafeInteger(snapshot.version, "mesh snapshot version");

  const vertices = [...snapshot.vertices].sort((left, right) => left.id - right.id);
  const edges = [...snapshot.edges].sort((left, right) => left.id - right.id);
  const verticesById = new Map<VertexId, VertexRecord>();
  const edgesById = new Map<EdgeId, EdgeRecord>();

  const bounds = createEmptyBounds();
  for (const indexedHit of hits) {
    includeInBounds(bounds, indexedHit.hit.position);
  }

  for (const vertex of vertices) {
    assertNonNegativeSafeInteger(vertex.id, "mesh vertex id");
    assertFiniteVector(vertex.position, `mesh vertex ${vertex.id} position`);
    if (verticesById.has(vertex.id)) {
      throw new Error(`duplicate mesh vertex id ${vertex.id}`);
    }
    verticesById.set(vertex.id, vertex);
    includeInBounds(bounds, vertex.position);
  }

  for (const edge of edges) {
    assertNonNegativeSafeInteger(edge.id, "mesh edge id");
    assertNonNegativeSafeInteger(edge.vertices[0], `mesh edge ${edge.id} first vertex`);
    assertNonNegativeSafeInteger(edge.vertices[1], `mesh edge ${edge.id} second vertex`);
    if (!verticesById.has(edge.vertices[0]) || !verticesById.has(edge.vertices[1])) {
      throw new Error(`mesh edge ${edge.id} references a missing vertex`);
    }
    if (edgesById.has(edge.id)) {
      throw new Error(`duplicate mesh edge id ${edge.id}`);
    }
    edgesById.set(edge.id, edge);
  }

  return {
    vertices: Object.freeze(vertices),
    edges: Object.freeze(edges),
    verticesById,
    edgesById,
    sceneScale: boundsDiagonal(bounds),
  };
}

function buildPoints(
  hits: ReadonlyArray<IndexedHit>,
  candidates: MeshCandidates,
): ReadonlyArray<RetopoChainPoint> {
  const points: RetopoChainPoint[] = [];
  const distanceTolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * candidates.sceneScale,
  );

  for (const indexedHit of hits) {
    const candidate = findSnapCandidate(indexedHit.hit.position, candidates, distanceTolerance);
    const position = candidate?.position ?? indexedHit.hit.position;
    const previous = points[points.length - 1];
    if (previous !== undefined && distance(previous.position, position) <= distanceTolerance) {
      continue;
    }

    points.push(
      Object.freeze({
        inputIndex: indexedHit.inputIndex,
        surfaceHit: indexedHit.hit,
        position: copyVector(position),
        normal: indexedHit.hit.normal,
        anchor: anchorFromCandidate(candidate),
      }),
    );
  }
  return Object.freeze(points);
}

function findSnapCandidate(
  point: Vec3,
  mesh: MeshCandidates,
  distanceTolerance: number,
): SnapCandidate | undefined {
  let best: SnapCandidate | undefined;

  for (const vertex of mesh.vertices) {
    const candidate: SnapCandidate = {
      kind: "vertex",
      id: vertex.id,
      distance: distance(point, vertex.position),
      position: vertex.position,
    };
    if (candidate.distance <= distanceTolerance && isBetterCandidate(candidate, best, distanceTolerance)) {
      best = candidate;
    }
  }

  for (const edge of mesh.edges) {
    const first = mesh.verticesById.get(edge.vertices[0]);
    const second = mesh.verticesById.get(edge.vertices[1]);
    if (first === undefined || second === undefined) {
      throw new Error(`mesh edge ${edge.id} references a missing vertex`);
    }
    const projection = projectToSegment(point, first.position, second.position, distanceTolerance);
    if (projection === undefined) {
      continue;
    }
    const candidate: SnapCandidate = {
      kind: "edge",
      id: edge.id,
      distance: distance(point, projection.position),
      position: projection.position,
      vertices: edge.vertices,
      t: projection.t,
    };
    if (candidate.distance <= distanceTolerance && isBetterCandidate(candidate, best, distanceTolerance)) {
      best = candidate;
    }
  }

  return best;
}

function isBetterCandidate(
  candidate: SnapCandidate,
  current: SnapCandidate | undefined,
  distanceTolerance: number,
): boolean {
  if (current === undefined) {
    return true;
  }
  if (candidate.distance < current.distance - distanceTolerance) {
    return true;
  }
  if (candidate.distance > current.distance + distanceTolerance) {
    return false;
  }
  const candidateRank = candidate.kind === "vertex" ? 0 : 1;
  const currentRank = current.kind === "vertex" ? 0 : 1;
  return candidateRank < currentRank || (candidateRank === currentRank && candidate.id < current.id);
}

function anchorFromCandidate(candidate: SnapCandidate | undefined): RetopoChainAnchor {
  if (candidate === undefined) {
    return Object.freeze({ kind: "surface" });
  }
  if (candidate.kind === "vertex") {
    return Object.freeze({ kind: "vertex", vertex: candidate.id });
  }
  return Object.freeze({
    kind: "edge",
    edge: candidate.id,
    vertices: Object.freeze([candidate.vertices[0], candidate.vertices[1]]) as readonly [
      VertexId,
      VertexId,
    ],
    t: candidate.t,
  });
}

function buildSegments(
  points: ReadonlyArray<RetopoChainPoint>,
  mesh: MeshQuery,
  edgesById: ReadonlyMap<EdgeId, EdgeRecord>,
): ReadonlyArray<RetopoChainSegment> {
  const segments: RetopoChainSegment[] = [];
  for (let to = 1; to < points.length; to += 1) {
    const from = to - 1;
    const first = points[from];
    const second = points[to];
    if (first === undefined || second === undefined) {
      throw new Error("surface chain point ordering invariant failed");
    }
    segments.push(
      Object.freeze({
        from,
        to,
        continuity: determineContinuity(first.anchor, second.anchor, mesh, edgesById),
      }),
    );
  }
  return Object.freeze(segments);
}

function determineContinuity(
  first: RetopoChainAnchor,
  second: RetopoChainAnchor,
  mesh: MeshQuery,
  edgesById: ReadonlyMap<EdgeId, EdgeRecord>,
): RetopoChainContinuity {
  if (first.kind === "surface" || second.kind === "surface") {
    return Object.freeze({ kind: "surface" });
  }

  if (first.kind === "vertex" && second.kind === "vertex") {
    const edge = mesh.findEdge(first.vertex, second.vertex);
    return edge === null ? Object.freeze({ kind: "surface" }) : meshEdgeContinuity(edge, mesh);
  }

  if (first.kind === "vertex" && second.kind === "edge") {
    return second.vertices.includes(first.vertex)
      ? meshEdgeContinuity(second.edge, mesh)
      : Object.freeze({ kind: "surface" });
  }
  if (first.kind === "edge" && second.kind === "vertex") {
    return first.vertices.includes(second.vertex)
      ? meshEdgeContinuity(first.edge, mesh)
      : Object.freeze({ kind: "surface" });
  }

  if (first.kind === "edge" && second.kind === "edge") {
    if (first.edge === second.edge) {
      return meshEdgeContinuity(first.edge, mesh);
    }
    const firstEdge = edgesById.get(first.edge);
    const secondEdge = edgesById.get(second.edge);
    if (firstEdge === undefined || secondEdge === undefined) {
      throw new Error("surface chain edge anchor references a missing edge");
    }
    const shared = firstEdge.vertices
      .filter((vertex): vertex is VertexId => secondEdge.vertices.includes(vertex))
      .sort((left, right) => left - right)[0];
    if (shared !== undefined) {
      return Object.freeze({
        kind: "shared-vertex",
        vertex: shared,
        incidentEdges: stableIds(mesh.incidentEdges(shared), `vertex ${shared} incident edge`),
      });
    }
  }

  return Object.freeze({ kind: "surface" });
}

function meshEdgeContinuity(edge: EdgeId, mesh: MeshQuery): RetopoChainContinuity {
  assertNonNegativeSafeInteger(edge, "chain continuity edge");
  if (mesh.edge(edge) === null) {
    throw new Error(`chain continuity references missing edge ${edge}`);
  }
  return Object.freeze({
    kind: "mesh-edge",
    edge,
    adjacentFaces: stableIds(mesh.adjacentFaces(edge), `edge ${edge} adjacent face`) as ReadonlyArray<FaceId>,
  });
}

function stableIds(values: ReadonlyArray<number>, label: string): ReadonlyArray<number> {
  const unique = new Set<number>();
  for (const value of values) {
    assertNonNegativeSafeInteger(value, label);
    unique.add(value);
  }
  return Object.freeze([...unique].sort((left, right) => left - right));
}

function freezeChain(
  points: ReadonlyArray<RetopoChainPoint>,
  segments: ReadonlyArray<RetopoChainSegment>,
): RetopoSurfaceChain {
  return Object.freeze({ points, segments });
}

function rejected(
  reason: SurfaceChainRejectionReason,
  inputIndex: number,
  partial: RetopoSurfaceChain,
): SurfaceChainResult {
  return Object.freeze({ kind: "rejected", reason, inputIndex, partial });
}

function copyHit(hit: SurfaceHit, normal: Vec3): SurfaceHit {
  return Object.freeze({
    surfaceId: hit.surfaceId,
    triangleId: hit.triangleId,
    position: copyVector(hit.position),
    normal: copyVector(normal),
    barycentric: copyVector(hit.barycentric),
    distance: hit.distance,
  });
}

function copyVector(value: Vec3): Vec3 {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function assertFiniteVector(value: Vec3, label: string): void {
  assertFiniteNumber(value.x, `${label}.x`);
  assertFiniteNumber(value.y, `${label}.y`);
  assertFiniteNumber(value.z, `${label}.z`);
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function approximatelyEqual(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    Math.max(
      NUMERIC_TOLERANCE_POLICY.absoluteDistance,
      NUMERIC_TOLERANCE_POLICY.relativeDistance * Math.max(Math.abs(left), Math.abs(right)),
    )
  );
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function scale(value: Vec3, amount: number): Vec3 {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function vectorLength(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function distance(left: Vec3, right: Vec3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function projectToSegment(
  point: Vec3,
  first: Vec3,
  second: Vec3,
  distanceTolerance: number,
): { readonly position: Vec3; readonly t: number } | undefined {
  const delta = {
    x: second.x - first.x,
    y: second.y - first.y,
    z: second.z - first.z,
  };
  const lengthSquared = dot(delta, delta);
  if (lengthSquared <= distanceTolerance * distanceTolerance) {
    return undefined;
  }
  const fromFirst = {
    x: point.x - first.x,
    y: point.y - first.y,
    z: point.z - first.z,
  };
  const t = Math.max(0, Math.min(1, dot(fromFirst, delta) / lengthSquared));
  return {
    t,
    position: {
      x: first.x + delta.x * t,
      y: first.y + delta.y * t,
      z: first.z + delta.z * t,
    },
  };
}

interface MutableBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function createEmptyBounds(): MutableBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function includeInBounds(bounds: MutableBounds, point: Vec3): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.minZ = Math.min(bounds.minZ, point.z);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
  bounds.maxZ = Math.max(bounds.maxZ, point.z);
}

function boundsDiagonal(bounds: MutableBounds): number {
  if (!Number.isFinite(bounds.minX)) {
    return 1;
  }
  return Math.max(
    1,
    Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ),
  );
}
