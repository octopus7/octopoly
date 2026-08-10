import {
  NUMERIC_TOLERANCE_POLICY,
  type EdgeId,
  type FaceId,
  type MeshQuery,
  type MeshSnapshot,
  type Vec3,
  type VertexId,
} from "@octopoly/contracts";

export type GuidedDiagnosticSeverity = "completion-blocker" | "info" | "warning";
export type GuidedDiagnosticElement =
  | { readonly kind: "edge"; readonly id: EdgeId }
  | { readonly kind: "face"; readonly id: FaceId }
  | { readonly kind: "vertex"; readonly id: VertexId };

export interface GuidedTopologyDiagnostic {
  readonly severity: GuidedDiagnosticSeverity;
  readonly code: string;
  readonly element: GuidedDiagnosticElement;
  readonly messageKey: string;
  readonly relatedIds: ReadonlyArray<number>;
}

export interface GuidedDensityBand {
  readonly minRatio: number;
  readonly maxRatio: number;
}

export interface GuidedAnalysisOptions {
  readonly densityBand?: GuidedDensityBand;
}

export interface GuidedPurposeConstraintInput {
  readonly constraintIds: ReadonlyArray<string>;
  readonly regionEdgeIds: ReadonlyArray<EdgeId>;
  readonly densityBand?: GuidedDensityBand;
}

export interface GuidedPurposeConstraintResult {
  readonly satisfied: boolean;
  readonly blockers: ReadonlyArray<GuidedTopologyDiagnostic>;
  readonly diagnostics: ReadonlyArray<GuidedTopologyDiagnostic>;
}

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function faceArea(snapshot: MeshSnapshot, faceId: FaceId): number {
  const face = snapshot.faces.find((candidate) => candidate.id === faceId);
  if (face === undefined || face.corners.length < 3) return 0;
  const positions = face.corners.map((cornerId) => {
    const corner = snapshot.corners.find((candidate) => candidate.id === cornerId);
    return corner === undefined
      ? undefined
      : snapshot.vertices.find((vertex) => vertex.id === corner.vertex)?.position;
  });
  const origin = positions[0];
  if (origin === undefined) return 0;
  let doubleArea = 0;
  for (let index = 1; index + 1 < positions.length; index += 1) {
    const b = positions[index];
    const c = positions[index + 1];
    if (b === undefined || c === undefined) return 0;
    const ab = { x: b.x - origin.x, y: b.y - origin.y, z: b.z - origin.z };
    const ac = { x: c.x - origin.x, y: c.y - origin.y, z: c.z - origin.z };
    doubleArea += Math.hypot(
      ab.y * ac.z - ab.z * ac.y,
      ab.z * ac.x - ab.x * ac.z,
      ab.x * ac.y - ab.y * ac.x,
    );
  }
  return doubleArea * 0.5;
}

function faceExtent(snapshot: MeshSnapshot, faceId: FaceId): number {
  const face = snapshot.faces.find((candidate) => candidate.id === faceId);
  if (face === undefined) return 0;
  const positions = face.corners.flatMap((cornerId) => {
    const corner = snapshot.corners.find((candidate) => candidate.id === cornerId);
    if (corner === undefined) return [];
    const vertex = snapshot.vertices.find((candidate) => candidate.id === corner.vertex);
    return vertex === undefined ? [] : [vertex.position];
  });
  if (positions.length === 0) return 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

function diagnostic(
  severity: GuidedDiagnosticSeverity,
  code: string,
  element: GuidedDiagnosticElement,
  relatedIds: ReadonlyArray<number> = [],
): GuidedTopologyDiagnostic {
  return Object.freeze({
    severity,
    code,
    element: Object.freeze(element),
    messageKey: `guided.diagnostic.${code}`,
    relatedIds: Object.freeze([...relatedIds].sort((a, b) => a - b)),
  });
}

function sortDiagnostics(items: ReadonlyArray<GuidedTopologyDiagnostic>): ReadonlyArray<GuidedTopologyDiagnostic> {
  const kindRank = { edge: 0, face: 1, vertex: 2 } as const;
  return Object.freeze([...items].sort((left, right) =>
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    kindRank[left.element.kind] - kindRank[right.element.kind] ||
    left.element.id - right.element.id));
}

function validDensityBand(band: GuidedDensityBand): boolean {
  return Number.isFinite(band.minRatio) && Number.isFinite(band.maxRatio) &&
    band.minRatio >= 0 && band.maxRatio >= band.minRatio;
}

function densityDiagnostics(
  mesh: MeshQuery,
  edgeIds: ReadonlyArray<EdgeId>,
  band: GuidedDensityBand,
): ReadonlyArray<GuidedTopologyDiagnostic> {
  if (!validDensityBand(band)) {
    return Object.freeze([diagnostic("completion-blocker", "invalid-density-band", { kind: "edge", id: 0 })]);
  }
  const lengths = [...new Set(edgeIds)].sort((a, b) => a - b).flatMap((id) => {
    const edge = mesh.edge(id);
    if (edge === null) return [];
    const a = mesh.vertex(edge.vertices[0]);
    const b = mesh.vertex(edge.vertices[1]);
    return a === null || b === null ? [] : [{ id, length: distance(a.position, b.position) }];
  });
  const ordered = lengths.map((item) => item.length).filter((value) => value > 0).sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
  if (median <= 0) return Object.freeze([]);
  const output: GuidedTopologyDiagnostic[] = [];
  for (const edge of lengths) {
    const ratio = edge.length / median;
    if (ratio < band.minRatio) output.push(diagnostic("warning", "density-too-high", { kind: "edge", id: edge.id }));
    if (ratio > band.maxRatio) output.push(diagnostic("warning", "density-too-low", { kind: "edge", id: edge.id }));
  }
  return sortDiagnostics(output);
}

export function analyzeTopology(mesh: MeshQuery, options: GuidedAnalysisOptions = {}): ReadonlyArray<GuidedTopologyDiagnostic> {
  const snapshot = mesh.snapshot();
  const output: GuidedTopologyDiagnostic[] = [];
  for (const edge of snapshot.edges) {
    const adjacent = [...mesh.adjacentFaces(edge.id)].sort((a, b) => a - b);
    if (adjacent.length > 2) output.push(diagnostic("completion-blocker", "non-manifold-edge", { kind: "edge", id: edge.id }, adjacent));
  }
  for (const face of snapshot.faces) {
    const scale = Math.max(NUMERIC_TOLERANCE_POLICY.absoluteDistance, faceExtent(snapshot, face.id));
    const areaThreshold = Math.max(
      NUMERIC_TOLERANCE_POLICY.absoluteDistance * NUMERIC_TOLERANCE_POLICY.absoluteDistance,
      NUMERIC_TOLERANCE_POLICY.areaScaleFactor * scale * scale,
    );
    if (faceArea(snapshot, face.id) <= areaThreshold) {
      output.push(diagnostic("completion-blocker", "degenerate-face", { kind: "face", id: face.id }));
    }
  }
  for (const vertex of snapshot.vertices) {
    const valence = mesh.incidentEdges(vertex.id).length;
    if (valence > 0 && valence !== 4) output.push(diagnostic("info", "pole-valence", { kind: "vertex", id: vertex.id }, [valence]));
  }
  if (options.densityBand !== undefined) {
    output.push(...densityDiagnostics(mesh, snapshot.edges.map((edge) => edge.id), options.densityBand));
  }
  return sortDiagnostics(output);
}

function regionGraph(mesh: MeshQuery, edgeIds: ReadonlyArray<EdgeId>): {
  readonly degrees: ReadonlyMap<VertexId, number>;
  readonly connected: boolean;
  readonly missing: ReadonlyArray<EdgeId>;
  readonly edgeCount: number;
} {
  const degrees = new Map<VertexId, number>();
  const adjacency = new Map<VertexId, Set<VertexId>>();
  const missing: EdgeId[] = [];
  let edgeCount = 0;
  for (const id of [...new Set(edgeIds)].sort((a, b) => a - b)) {
    const edge = mesh.edge(id);
    if (edge === null) { missing.push(id); continue; }
    edgeCount += 1;
    const [a, b] = edge.vertices;
    degrees.set(a, (degrees.get(a) ?? 0) + 1);
    degrees.set(b, (degrees.get(b) ?? 0) + 1);
    const adjacentA = adjacency.get(a) ?? new Set<VertexId>();
    adjacentA.add(b);
    adjacency.set(a, adjacentA);
    const adjacentB = adjacency.get(b) ?? new Set<VertexId>();
    adjacentB.add(a);
    adjacency.set(b, adjacentB);
  }
  const first = degrees.keys().next().value as VertexId | undefined;
  const visited = new Set<VertexId>();
  if (first !== undefined) {
    const pending = [first];
    while (pending.length > 0) {
      const value = pending.pop();
      if (value === undefined || visited.has(value)) continue;
      visited.add(value);
      adjacency.get(value)?.forEach((next) => pending.push(next));
    }
  }
  return { degrees, connected: visited.size === degrees.size && degrees.size > 0, missing, edgeCount };
}

export function evaluatePurposeConstraints(mesh: MeshQuery, input: GuidedPurposeConstraintInput): GuidedPurposeConstraintResult {
  const diagnostics: GuidedTopologyDiagnostic[] = [];
  const graph = regionGraph(mesh, input.regionEdgeIds);
  for (const id of graph.missing) diagnostics.push(diagnostic("completion-blocker", "missing-region-edge", { kind: "edge", id }));
  for (const constraint of input.constraintIds) {
    if (constraint === "manifold") {
      diagnostics.push(...analyzeTopology(mesh).filter((item) => item.code === "non-manifold-edge" || item.code === "degenerate-face"));
    } else if (constraint === "closed-loop") {
      const invalidVertices = [...graph.degrees].filter(([, degree]) => degree !== 2).map(([id]) => id).sort((a, b) => a - b);
      if (!graph.connected || invalidVertices.length > 0 || graph.edgeCount < 3) {
        diagnostics.push(diagnostic("completion-blocker", "open-loop", { kind: "vertex", id: invalidVertices[0] ?? 0 }, invalidVertices));
      }
    } else if (constraint === "joint-support") {
      const hasCorridor = graph.connected && graph.edgeCount >= 6 && [...graph.degrees.values()].every((degree) => degree === 2);
      if (!hasCorridor) {
        diagnostics.push(diagnostic("completion-blocker", "insufficient-joint-support", {
          kind: "edge",
          id: [...new Set(input.regionEdgeIds)].sort((a, b) => a - b)[0] ?? 0,
        }));
      }
    } else if (constraint === "density-band") {
      if (input.densityBand === undefined) {
        diagnostics.push(diagnostic("completion-blocker", "missing-density-band", { kind: "edge", id: 0 }));
      } else {
        diagnostics.push(...densityDiagnostics(mesh, input.regionEdgeIds, input.densityBand));
      }
    } else {
      diagnostics.push(diagnostic("completion-blocker", "unknown-constraint", { kind: "face", id: 0 }));
    }
  }
  const sorted = sortDiagnostics(diagnostics);
  const blockers = Object.freeze(sorted.filter((item) => item.severity === "completion-blocker"));
  return Object.freeze({ satisfied: blockers.length === 0, blockers, diagnostics: sorted });
}
