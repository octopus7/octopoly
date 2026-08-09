import type {
  AttributeKey,
  CornerId,
  EdgeId,
  FaceId,
  MeshQuery,
  MeshSnapshot,
  Vec2,
  VertexId,
} from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

import { UV0_ATTRIBUTE } from "../data/attributes";
import { immutableReadonlyMap } from "../operations/immutable-readonly-map";

export interface UvIsland {
  readonly faces: ReadonlyArray<FaceId>;
  readonly corners: ReadonlyArray<CornerId>;
}

export interface UvEdgeCandidate {
  readonly edge: EdgeId;
  readonly faces: readonly [FaceId, FaceId];
  /** Corner pairs are ordered by the edge's canonical vertex order. */
  readonly cornerPairs: readonly [
    readonly [CornerId, CornerId],
    readonly [CornerId, CornerId],
  ];
}

interface EdgeSide {
  readonly edge: EdgeId;
  readonly face: FaceId;
  readonly cornersByVertex: ReadonlyMap<VertexId, CornerId>;
  readonly valuesByVertex: ReadonlyMap<VertexId, Vec2>;
}

interface ClassifiedCandidate {
  readonly candidate: UvEdgeCandidate;
  readonly continuous: boolean;
}

class DisjointFaces {
  readonly #parents = new Map<FaceId, FaceId>();

  add(face: FaceId): void {
    this.#parents.set(face, face);
  }

  find(face: FaceId): FaceId {
    const parent = this.#parents.get(face);
    if (parent === undefined) {
      throw new Error(`face ${face} is not part of the UV island set`);
    }
    if (parent === face) {
      return face;
    }
    const root = this.find(parent);
    this.#parents.set(face, root);
    return root;
  }

  union(first: FaceId, second: FaceId): void {
    const firstRoot = this.find(first);
    const secondRoot = this.find(second);
    if (firstRoot === secondRoot) {
      return;
    }

    const low = Math.min(firstRoot, secondRoot);
    const high = Math.max(firstRoot, secondRoot);
    this.#parents.set(high, low);
  }
}

function isFiniteUv(value: Vec2 | undefined): value is Vec2 {
  return value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function nearlyEqual(first: number, second: number): boolean {
  const scale = Math.max(Math.abs(first), Math.abs(second));
  const tolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * scale,
  );
  return Math.abs(first - second) <= tolerance;
}

function uvEqual(first: Vec2, second: Vec2): boolean {
  return nearlyEqual(first.x, second.x) && nearlyEqual(first.y, second.y);
}

function completeUvFaces(snapshot: MeshSnapshot, key: AttributeKey<Vec2>): ReadonlySet<FaceId> {
  const corners = new Map(snapshot.corners.map((corner) => [corner.id, corner]));
  const complete = new Set<FaceId>();

  for (const face of snapshot.faces) {
    if (
      face.corners.length >= 3
      && face.corners.every((cornerId) => {
        const corner = corners.get(cornerId);
        return corner?.face === face.id && isFiniteUv(snapshot.attributes.get(key, cornerId));
      })
    ) {
      complete.add(face.id);
    }
  }

  return complete;
}

function collectEdgeSides(
  snapshot: MeshSnapshot,
  completeFaces: ReadonlySet<FaceId>,
  key: AttributeKey<Vec2>,
): ReadonlyMap<EdgeId, ReadonlyArray<EdgeSide>> {
  const corners = new Map(snapshot.corners.map((corner) => [corner.id, corner]));
  const edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
  const byEdge = new Map<EdgeId, EdgeSide[]>();

  for (const face of [...snapshot.faces].sort((first, second) => first.id - second.id)) {
    if (!completeFaces.has(face.id)) {
      continue;
    }

    for (let index = 0; index < face.corners.length; index += 1) {
      const cornerId = face.corners[index];
      const nextCornerId = face.corners[(index + 1) % face.corners.length];
      if (cornerId === undefined || nextCornerId === undefined) {
        continue;
      }
      const corner = corners.get(cornerId);
      const nextCorner = corners.get(nextCornerId);
      if (corner === undefined || nextCorner === undefined) {
        continue;
      }
      const edge = edges.get(corner.edge);
      if (
        edge === undefined
        || !edge.vertices.includes(corner.vertex)
        || !edge.vertices.includes(nextCorner.vertex)
        || corner.vertex === nextCorner.vertex
      ) {
        continue;
      }
      const firstUv = snapshot.attributes.get(key, corner.id);
      const secondUv = snapshot.attributes.get(key, nextCorner.id);
      if (!isFiniteUv(firstUv) || !isFiniteUv(secondUv)) {
        continue;
      }

      const side: EdgeSide = {
        edge: edge.id,
        face: face.id,
        cornersByVertex: new Map([
          [corner.vertex, corner.id],
          [nextCorner.vertex, nextCorner.id],
        ]),
        valuesByVertex: new Map([
          [corner.vertex, firstUv],
          [nextCorner.vertex, secondUv],
        ]),
      };
      const sides = byEdge.get(edge.id);
      if (sides === undefined) {
        byEdge.set(edge.id, [side]);
      } else {
        sides.push(side);
      }
    }
  }

  return byEdge;
}

function classifyCandidates(snapshot: MeshSnapshot, key: AttributeKey<Vec2>): ReadonlyArray<ClassifiedCandidate> {
  const completeFaces = completeUvFaces(snapshot, key);
  const sidesByEdge = collectEdgeSides(snapshot, completeFaces, key);
  const edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
  const classified: ClassifiedCandidate[] = [];

  for (const [edgeId, unsortedSides] of [...sidesByEdge].sort(([first], [second]) => first - second)) {
    const edge = edges.get(edgeId);
    if (edge === undefined) {
      continue;
    }
    const sides = [...unsortedSides].sort((first, second) => first.face - second.face);
    for (let firstIndex = 0; firstIndex < sides.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < sides.length; secondIndex += 1) {
        const first = sides[firstIndex];
        const second = sides[secondIndex];
        if (first === undefined || second === undefined) {
          continue;
        }

        const firstVertex = edge.vertices[0];
        const secondVertex = edge.vertices[1];
        const firstCornerA = first.cornersByVertex.get(firstVertex);
        const firstCornerB = second.cornersByVertex.get(firstVertex);
        const secondCornerA = first.cornersByVertex.get(secondVertex);
        const secondCornerB = second.cornersByVertex.get(secondVertex);
        const firstValueA = first.valuesByVertex.get(firstVertex);
        const firstValueB = second.valuesByVertex.get(firstVertex);
        const secondValueA = first.valuesByVertex.get(secondVertex);
        const secondValueB = second.valuesByVertex.get(secondVertex);
        if (
          firstCornerA === undefined
          || firstCornerB === undefined
          || secondCornerA === undefined
          || secondCornerB === undefined
          || firstValueA === undefined
          || firstValueB === undefined
          || secondValueA === undefined
          || secondValueB === undefined
        ) {
          continue;
        }

        const firstCornerPair = Object.freeze([firstCornerA, firstCornerB]) as readonly [CornerId, CornerId];
        const secondCornerPair = Object.freeze([secondCornerA, secondCornerB]) as readonly [CornerId, CornerId];
        const cornerPairs = Object.freeze([
          firstCornerPair,
          secondCornerPair,
        ]) as UvEdgeCandidate["cornerPairs"];
        const faces = Object.freeze([first.face, second.face]) as readonly [FaceId, FaceId];
        const candidate: UvEdgeCandidate = Object.freeze({
            edge: edgeId,
            faces,
            cornerPairs,
          });
        classified.push(Object.freeze({
          candidate,
          continuous: uvEqual(firstValueA, firstValueB)
            && uvEqual(secondValueA, secondValueB),
        }));
      }
    }
  }

  return classified;
}

/** Finds UV-connected face components without consulting the optional seam hint. */
export class UvIslandService {
  constructor(private readonly key: AttributeKey<Vec2> = UV0_ATTRIBUTE) {}

  findIslands(mesh: MeshQuery): ReadonlyArray<UvIsland> {
    const snapshot = mesh.snapshot();
    const completeFaces = completeUvFaces(snapshot, this.key);
    const disjoint = new DisjointFaces();
    for (const face of completeFaces) {
      disjoint.add(face);
    }
    for (const entry of classifyCandidates(snapshot, this.key)) {
      if (entry.continuous) {
        disjoint.union(entry.candidate.faces[0], entry.candidate.faces[1]);
      }
    }

    const groups = new Map<FaceId, FaceId[]>();
    for (const face of [...completeFaces].sort((first, second) => first - second)) {
      const root = disjoint.find(face);
      const faces = groups.get(root);
      if (faces === undefined) {
        groups.set(root, [face]);
      } else {
        faces.push(face);
      }
    }

    const facesById = new Map(snapshot.faces.map((face) => [face.id, face]));
    const islands = [...groups.values()]
      .map((faces): UvIsland => Object.freeze({
        faces: Object.freeze([...faces]),
        corners: Object.freeze(
          [...new Set(faces.flatMap((face) => facesById.get(face)?.corners ?? []))]
            .sort((first, second) => first - second),
        ),
      }))
      .sort((first, second) => (first.faces[0] ?? 0) - (second.faces[0] ?? 0));
    return Object.freeze(islands);
  }

  splitCandidates(mesh: MeshQuery): ReadonlyArray<UvEdgeCandidate> {
    return Object.freeze(classifyCandidates(mesh.snapshot(), this.key)
      .filter((entry) => entry.continuous)
      .map((entry) => entry.candidate));
  }

  weldCandidates(mesh: MeshQuery): ReadonlyArray<UvEdgeCandidate> {
    return Object.freeze(classifyCandidates(mesh.snapshot(), this.key)
      .filter((entry) => !entry.continuous)
      .map((entry) => entry.candidate));
  }

  /** Returns the corner-value map that welds a current discontinuous candidate at its midpoint. */
  weldValues(
    mesh: MeshQuery,
    candidate: UvEdgeCandidate,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    const current = this.weldCandidates(mesh).find((entry) => (
      entry.edge === candidate.edge
      && entry.faces[0] === candidate.faces[0]
      && entry.faces[1] === candidate.faces[1]
    ));
    if (current === undefined) {
      throw new Error("UV weld candidate is stale or is already continuous");
    }

    const snapshot = mesh.snapshot();
    const values = new Map<CornerId, Vec2 | undefined>();
    for (const [firstCorner, secondCorner] of current.cornerPairs) {
      const first = snapshot.attributes.get(this.key, firstCorner);
      const second = snapshot.attributes.get(this.key, secondCorner);
      if (!isFiniteUv(first) || !isFiniteUv(second)) {
        throw new Error("UV weld candidate contains a missing or non-finite value");
      }
      const midpoint = Object.freeze({
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      });
      values.set(firstCorner, midpoint);
      values.set(secondCorner, midpoint);
    }
    return immutableReadonlyMap(values);
  }
}
