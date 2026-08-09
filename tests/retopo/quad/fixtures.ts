import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  EdgeId,
  EdgeRecord,
  FaceId,
  FaceRecord,
  MeshQuery,
  MeshSnapshot,
  SurfaceHit,
  Vec3,
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";
import type {
  RetopoChainAnchor,
  RetopoChainContinuity,
  RetopoChainPoint,
  RetopoSurfaceChain,
} from "../../../src/retopo/surface-chain";

const EMPTY_ATTRIBUTES: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
};

export class FakeMeshQuery implements MeshQuery {
  readonly #vertices = new Map<VertexId, VertexRecord>();
  readonly #edges = new Map<EdgeId, EdgeRecord>();
  readonly #faces = new Map<FaceId, FaceRecord>();
  readonly #adjacentFaces = new Map<EdgeId, ReadonlyArray<FaceId>>();
  version = 0;

  addVertex(id: VertexId, position: Vec3): void {
    this.#vertices.set(id, { id, position });
  }

  addEdge(id: EdgeId, vertices: readonly [VertexId, VertexId], faces: ReadonlyArray<FaceId> = []): void {
    this.#edges.set(id, { id, vertices });
    this.#adjacentFaces.set(id, [...faces]);
  }

  addFace(id: FaceId): void {
    this.#faces.set(id, { id, corners: [] });
  }

  setAdjacentFaces(edge: EdgeId, faces: ReadonlyArray<FaceId>): void {
    this.#adjacentFaces.set(edge, [...faces]);
  }

  snapshot(): MeshSnapshot {
    return {
      version: this.version,
      vertices: [...this.#vertices.values()].sort((left, right) => left.id - right.id),
      edges: [...this.#edges.values()].sort((left, right) => left.id - right.id),
      corners: [],
      faces: [...this.#faces.values()].sort((left, right) => left.id - right.id),
      attributes: EMPTY_ATTRIBUTES,
    };
  }

  vertex(id: VertexId): VertexRecord | null {
    return this.#vertices.get(id) ?? null;
  }

  edge(id: EdgeId): EdgeRecord | null {
    return this.#edges.get(id) ?? null;
  }

  corner(): null {
    return null;
  }

  face(id: FaceId): FaceRecord | null {
    return this.#faces.get(id) ?? null;
  }

  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId> {
    return [...this.#edges.values()]
      .filter((edge) => edge.vertices.includes(vertex))
      .map((edge) => edge.id)
      .sort((left, right) => left - right);
  }

  incidentFaces(): ReadonlyArray<FaceId> {
    return [];
  }

  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId> {
    return this.#adjacentFaces.get(edge) ?? [];
  }

  findEdge(a: VertexId, b: VertexId): EdgeId | null {
    const matches = [...this.#edges.values()]
      .filter(
        (edge) =>
          (edge.vertices[0] === a && edge.vertices[1] === b) ||
          (edge.vertices[0] === b && edge.vertices[1] === a),
      )
      .map((edge) => edge.id)
      .sort((left, right) => left - right);
    return matches[0] ?? null;
  }
}

function hit(position: Vec3, normal: Vec3, triangleId: number): SurfaceHit {
  return {
    surfaceId: "retopo-fixture",
    triangleId,
    position,
    normal,
    barycentric: { x: 1, y: 0, z: 0 },
    distance: 1,
  };
}

export function chain(
  points: ReadonlyArray<{
    readonly position: Vec3;
    readonly normal?: Vec3;
    readonly anchor?: RetopoChainAnchor;
  }>,
  continuity?: RetopoChainContinuity,
): RetopoSurfaceChain {
  const chainPoints: RetopoChainPoint[] = points.map((point, inputIndex) => {
    const normal = point.normal ?? { x: 0, y: 1, z: 0 };
    return {
      inputIndex,
      surfaceHit: hit(point.position, normal, inputIndex),
      position: point.position,
      normal,
      anchor: point.anchor ?? { kind: "surface" },
    };
  });
  return {
    points: chainPoints,
    segments: chainPoints.slice(1).map((_point, index) => ({
      from: index,
      to: index + 1,
      continuity: continuity ?? { kind: "surface" },
    })),
  };
}

export function bridgedFixture(): {
  readonly mesh: FakeMeshQuery;
  readonly first: RetopoSurfaceChain;
  readonly second: RetopoSurfaceChain;
} {
  const mesh = new FakeMeshQuery();
  mesh.addVertex(10, { x: 0, y: 0, z: 0 });
  mesh.addVertex(11, { x: 1, y: 0, z: 0 });
  mesh.addVertex(20, { x: 0, y: 0, z: 1 });
  mesh.addVertex(21, { x: 1, y: 0, z: 1 });
  mesh.addEdge(5, [10, 11], [40]);
  mesh.addEdge(6, [20, 21], [41]);

  return {
    mesh,
    first: chain(
      [
        { position: { x: 0, y: 0, z: 0 }, anchor: { kind: "vertex", vertex: 10 } },
        { position: { x: 1, y: 0, z: 0 }, anchor: { kind: "vertex", vertex: 11 } },
      ],
      { kind: "mesh-edge", edge: 5, adjacentFaces: [40] },
    ),
    second: chain(
      [
        { position: { x: 0, y: 0, z: 1 }, anchor: { kind: "vertex", vertex: 20 } },
        { position: { x: 1, y: 0, z: 1 }, anchor: { kind: "vertex", vertex: 21 } },
      ],
      { kind: "mesh-edge", edge: 6, adjacentFaces: [41] },
    ),
  };
}
