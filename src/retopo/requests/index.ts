import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
  incrementNonNegativeSafeInteger,
  type Disposable,
  type MeshCommand,
  type MeshMutationResult,
  type MeshQuery,
  type RetopoStep,
  type ToolPreview,
  type Vec3,
  type VertexId,
} from "@octopoly/contracts";
import type { RetopoChainPoint } from "../surface-chain";
import type { QuadCandidate } from "../quad";

export interface QuadRequestSequence extends Disposable {
  start(mesh: MeshQuery): RetopoStep;
  continue(result: MeshMutationResult, mesh: MeshQuery): RetopoStep;
  cancel(): void;
}

type SequenceState = "initial" | "waiting" | "complete" | "rejected" | "disposed";

type PendingRequest =
  | {
      readonly kind: "anchor";
      readonly point: RetopoChainPoint;
      readonly command: MeshCommand;
      readonly beforeVersion: number;
    }
  | {
      readonly kind: "topology";
      readonly candidate: QuadCandidate;
      readonly command: MeshCommand;
      readonly beforeVersion: number;
    };

const PREVIEW_COLOR = Object.freeze({ x: 0.12, y: 0.82, z: 0.94, w: 0.34 });

function orderedCandidates(candidates: ReadonlyArray<QuadCandidate>): ReadonlyArray<QuadCandidate> {
  const ordered = [...candidates].sort((left, right) => left.index - right.index);
  for (let index = 0; index < ordered.length; index += 1) {
    const candidate = ordered[index];
    if (candidate === undefined) {
      throw new Error("quad candidate ordering failed");
    }
    assertNonNegativeSafeInteger(candidate.index, "quad candidate index");
    const previous = ordered[index - 1];
    if (previous !== undefined && previous.index === candidate.index) {
      throw new Error(`duplicate quad candidate index ${candidate.index}`);
    }
  }
  return ordered;
}

export function buildQuadPreview(
  candidates: ReadonlyArray<QuadCandidate>,
  revision = 0,
): ToolPreview {
  assertNonNegativeSafeInteger(revision, "quad preview revision");
  const positions: Vec3[] = [];
  for (const candidate of orderedCandidates(candidates)) {
    const [first, second, third, fourth] = candidate.corners;
    positions.push(
      first.position,
      second.position,
      third.position,
      first.position,
      third.position,
      fourth.position,
    );
  }

  return {
    id: "retopo-quad-preview",
    revision,
    primitives:
      positions.length === 0
        ? []
        : [
            {
              kind: "triangles",
              positions,
              color: PREVIEW_COLOR,
            },
          ],
  };
}

function isSamePoint(left: RetopoChainPoint, right: RetopoChainPoint): boolean {
  return left === right;
}

function unresolvedPoints(candidates: ReadonlyArray<QuadCandidate>): ReadonlyArray<RetopoChainPoint> {
  const points: RetopoChainPoint[] = [];
  for (const candidate of candidates) {
    for (const point of candidate.corners) {
      if (point.anchor.kind === "vertex") {
        continue;
      }
      if (!points.some((existing) => isSamePoint(existing, point))) {
        points.push(point);
      }
    }
  }
  return points;
}

function commandForPoint(point: RetopoChainPoint): MeshCommand {
  switch (point.anchor.kind) {
    case "surface":
      return { kind: "createVertex", position: point.position };
    case "edge":
      return { kind: "splitEdge", edge: point.anchor.edge, t: point.anchor.t };
    case "vertex":
      throw new Error("a stable vertex anchor does not need a creation request");
  }
}

function commandLabel(command: MeshCommand): string {
  switch (command.kind) {
    case "createVertex":
      return "Retopo: Create Vertex";
    case "splitEdge":
      return "Retopo: Split Edge";
    case "createFace":
      return "Retopo: Create Quad";
    case "bridgeEdges":
      return "Retopo: Bridge Edges";
    default:
      throw new Error(`unsupported retopo request ${command.kind}`);
  }
}

function commitStep(command: MeshCommand, preview: ToolPreview): RetopoStep {
  return {
    kind: "commit",
    label: commandLabel(command),
    command,
    preview,
  };
}

function distanceTolerance(mesh: MeshQuery, point: Vec3): number {
  const positions = [...mesh.snapshot().vertices.map((vertex) => vertex.position), point];
  let minX = point.x;
  let minY = point.y;
  let minZ = point.z;
  let maxX = point.x;
  let maxY = point.y;
  let maxZ = point.z;
  for (const position of positions) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const scale = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * scale,
  );
}

function pointsMatch(left: Vec3, right: Vec3, tolerance: number): boolean {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz <= tolerance * tolerance;
}

class DeterministicQuadRequestSequence implements QuadRequestSequence {
  readonly #candidates: ReadonlyArray<QuadCandidate>;
  readonly #points: ReadonlyArray<RetopoChainPoint>;
  readonly #preview: ToolPreview;
  readonly #validationError: string | null;
  readonly #resolved = new Map<RetopoChainPoint, VertexId>();
  #pointIndex = 0;
  #candidateIndex = 0;
  #state: SequenceState = "initial";
  #pending: PendingRequest | null = null;

  constructor(candidates: ReadonlyArray<QuadCandidate>, preview: ToolPreview) {
    this.#candidates = orderedCandidates(candidates);
    this.#points = unresolvedPoints(this.#candidates);
    this.#preview = preview;
    const edgeAnchors = new Set<number>();
    let validationError: string | null = null;
    for (const point of this.#points) {
      if (point.anchor.kind !== "edge") {
        continue;
      }
      if (edgeAnchors.has(point.anchor.edge)) {
        validationError = "multiple unresolved anchors on one edge cannot be staged safely";
        break;
      }
      edgeAnchors.add(point.anchor.edge);
    }
    this.#validationError = validationError;
  }

  start(mesh: MeshQuery): RetopoStep {
    if (this.#state === "disposed") {
      throw new Error("quad request sequence is disposed");
    }
    if (this.#state !== "initial") {
      throw new Error("quad request sequence has already started");
    }
    return this.#next(mesh);
  }

  continue(result: MeshMutationResult, mesh: MeshQuery): RetopoStep {
    if (this.#state === "disposed") {
      throw new Error("quad request sequence is disposed");
    }
    if (this.#state !== "waiting" || this.#pending === null) {
      throw new Error("quad request sequence is not waiting for a mutation result");
    }
    if (
      result.patch.beforeVersion !== this.#pending.beforeVersion ||
      result.patch.afterVersion !==
        incrementNonNegativeSafeInteger(this.#pending.beforeVersion, "mesh version") ||
      result.snapshot.version !== mesh.snapshot().version ||
      result.patch.afterVersion !== result.snapshot.version
    ) {
      return this.#reject("mutation result does not match the supplied mesh snapshot");
    }

    const pending = this.#pending;
    this.#pending = null;
    if (pending.kind === "anchor") {
      const created = result.created.vertices ?? [];
      if (created.length !== 1) {
        return this.#reject("anchor mutation must create exactly one stable vertex ID");
      }
      const createdVertex = created[0];
      if (createdVertex === undefined) {
        return this.#reject("anchor mutation omitted its stable vertex ID");
      }
      assertNonNegativeSafeInteger(createdVertex, "created vertex ID");
      const vertex = mesh.vertex(createdVertex);
      if (vertex === null) {
        return this.#reject("created vertex ID is absent from the supplied mesh");
      }
      const tolerance = distanceTolerance(mesh, pending.point.position);
      if (!pointsMatch(vertex.position, pending.point.position, tolerance)) {
        return this.#reject("created vertex position does not match the requested anchor");
      }
      this.#resolved.set(pending.point, createdVertex);
      this.#pointIndex += 1;
      return this.#next(mesh);
    }

    const createdFaces = result.created.faces ?? [];
    if (createdFaces.length === 0) {
      return this.#reject("topology mutation did not create a face");
    }
    for (const face of createdFaces) {
      assertNonNegativeSafeInteger(face, "created face ID");
    }
    this.#candidateIndex += 1;
    return this.#next(mesh);
  }

  cancel(): void {
    if (this.#state === "disposed") {
      return;
    }
    this.#pending = null;
    this.#resolved.clear();
    this.#state = "disposed";
  }

  dispose(): void {
    this.cancel();
  }

  #next(mesh: MeshQuery): RetopoStep {
    if (this.#validationError !== null) {
      return this.#reject(this.#validationError);
    }
    const point = this.#points[this.#pointIndex];
    if (point !== undefined) {
      const command = commandForPoint(point);
      const beforeVersion = mesh.snapshot().version;
      assertNonNegativeSafeInteger(beforeVersion, "mesh version");
      this.#pending = { kind: "anchor", point, command, beforeVersion };
      this.#state = "waiting";
      return commitStep(command, this.#preview);
    }

    const candidate = this.#candidates[this.#candidateIndex];
    if (candidate === undefined) {
      this.#state = "complete";
      return { kind: "complete" };
    }

    const command = this.#topologyCommand(candidate, mesh);
    if (typeof command === "string") {
      return this.#reject(command);
    }
    const beforeVersion = mesh.snapshot().version;
    assertNonNegativeSafeInteger(beforeVersion, "mesh version");
    this.#pending = { kind: "topology", candidate, command, beforeVersion };
    this.#state = "waiting";
    return commitStep(command, this.#preview);
  }

  #topologyCommand(candidate: QuadCandidate, mesh: MeshQuery): MeshCommand | string {
    if (
      candidate.bridge !== null &&
      candidate.corners.every((point) => point.anchor.kind === "vertex")
    ) {
      const first = candidate.bridge.first[0];
      const second = candidate.bridge.second[0];
      if (
        mesh.edge(first) === null ||
        mesh.edge(second) === null ||
        mesh.adjacentFaces(first).length >= 2 ||
        mesh.adjacentFaces(second).length >= 2
      ) {
        return "bridge candidate is no longer manifold-safe";
      }
      return {
        kind: "bridgeEdges",
        first: candidate.bridge.first,
        second: candidate.bridge.second,
      };
    }

    const vertices: VertexId[] = [];
    for (const point of candidate.corners) {
      const vertex =
        point.anchor.kind === "vertex" ? point.anchor.vertex : (this.#resolved.get(point) ?? null);
      if (vertex === null || mesh.vertex(vertex) === null) {
        return "quad corner does not have a stable vertex ID";
      }
      if (vertices.includes(vertex)) {
        return "quad face would contain a duplicate vertex ID";
      }
      vertices.push(vertex);
    }

    for (let index = 0; index < vertices.length; index += 1) {
      const current = vertices[index];
      const next = vertices[(index + 1) % vertices.length];
      if (current === undefined || next === undefined) {
        return "quad face is missing a corner vertex ID";
      }
      const edge = mesh.findEdge(current, next);
      if (edge !== null && mesh.adjacentFaces(edge).length >= 2) {
        return "quad face would create a non-manifold edge";
      }
    }

    return { kind: "createFace", vertices };
  }

  #reject(reason: string): RetopoStep {
    this.#pending = null;
    this.#state = "rejected";
    return { kind: "rejected", reason };
  }
}

/**
 * Creates a side-effect-free staged request sequence. Each unresolved anchor is
 * emitted separately so the following face can only reference IDs supplied by
 * MeshMutationResult.created.vertices.
 */
export function createQuadRequestSequence(
  candidates: ReadonlyArray<QuadCandidate>,
  preview: ToolPreview = buildQuadPreview(candidates),
): QuadRequestSequence {
  return new DeterministicQuadRequestSequence(candidates, preview);
}
