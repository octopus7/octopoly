import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  CornerId,
  CornerRecord,
  EdgeId,
  EdgeRecord,
  FaceId,
  FaceRecord,
  MeshQuery,
  MeshSnapshot,
  Vec3,
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";

const EMPTY_ATTRIBUTES: AttributeSnapshot = Object.freeze({
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
});

export interface MeshFixtureOptions {
  readonly version?: number;
  readonly positions: Readonly<Record<number, Vec3>>;
  readonly faces: ReadonlyArray<{
    readonly id: FaceId;
    readonly vertices: ReadonlyArray<VertexId>;
  }>;
  readonly edgeIds?: Readonly<Record<string, EdgeId>>;
  readonly reverseSnapshotOrder?: boolean;
}

function edgeKey(first: VertexId, second: VertexId): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

export class CanonicalMeshFixture implements MeshQuery {
  readonly #snapshot: MeshSnapshot;
  readonly #vertices: ReadonlyMap<VertexId, VertexRecord>;
  readonly #edges: ReadonlyMap<EdgeId, EdgeRecord>;
  readonly #corners: ReadonlyMap<CornerId, CornerRecord>;
  readonly #faces: ReadonlyMap<FaceId, FaceRecord>;
  readonly #incidentEdges = new Map<VertexId, EdgeId[]>();
  readonly #incidentFaces = new Map<VertexId, FaceId[]>();
  readonly #adjacentFaces = new Map<EdgeId, FaceId[]>();
  readonly #edgeByVertices = new Map<string, EdgeId>();

  snapshotCalls = 0;

  constructor(options: MeshFixtureOptions) {
    const vertices = Object.entries(options.positions).map(([id, position]) => ({
      id: Number(id),
      position: { ...position },
    }));
    const vertexMap = new Map(vertices.map((vertex) => [vertex.id, vertex]));
    const edges = new Map<EdgeId, EdgeRecord>();
    const corners = new Map<CornerId, CornerRecord>();
    const faces = new Map<FaceId, FaceRecord>();
    let nextEdgeId = 0;
    let nextCornerId = 0;

    for (const faceSource of options.faces) {
      const faceCorners: CornerId[] = [];
      faceSource.vertices.forEach((vertexId, index) => {
        const nextVertex = faceSource.vertices[(index + 1) % faceSource.vertices.length];
        if (nextVertex === undefined) {
          throw new Error("Fixture faces must contain vertices.");
        }
        const key = edgeKey(vertexId, nextVertex);
        let edgeId = this.#edgeByVertices.get(key);
        if (edgeId === undefined) {
          edgeId = options.edgeIds?.[key] ?? nextEdgeId;
          while (edges.has(edgeId)) edgeId += 1;
          nextEdgeId = Math.max(nextEdgeId, edgeId + 1);
          this.#edgeByVertices.set(key, edgeId);
          edges.set(edgeId, { id: edgeId, vertices: [vertexId, nextVertex] });
        }
        const cornerId = nextCornerId++;
        corners.set(cornerId, { id: cornerId, face: faceSource.id, vertex: vertexId, edge: edgeId });
        faceCorners.push(cornerId);
        this.#append(this.#incidentEdges, vertexId, edgeId);
        this.#append(this.#incidentEdges, nextVertex, edgeId);
        this.#append(this.#incidentFaces, vertexId, faceSource.id);
        this.#append(this.#adjacentFaces, edgeId, faceSource.id);
      });
      faces.set(faceSource.id, { id: faceSource.id, corners: faceCorners });
    }

    for (const [vertexId, ids] of this.#incidentEdges) {
      this.#incidentEdges.set(vertexId, [...new Set(ids)]);
    }
    for (const [vertexId, ids] of this.#incidentFaces) {
      this.#incidentFaces.set(vertexId, [...new Set(ids)]);
    }

    const order = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
      options.reverseSnapshotOrder ? [...values].reverse() : [...values];
    this.#vertices = vertexMap;
    this.#edges = edges;
    this.#corners = corners;
    this.#faces = faces;
    this.#snapshot = Object.freeze({
      version: options.version ?? 1,
      vertices: order(vertices),
      edges: order([...edges.values()]),
      corners: order([...corners.values()]),
      faces: order([...faces.values()]),
      attributes: EMPTY_ATTRIBUTES,
    });
  }

  snapshot(): MeshSnapshot {
    this.snapshotCalls += 1;
    return this.#snapshot;
  }

  vertex(id: VertexId): VertexRecord | null { return this.#vertices.get(id) ?? null; }
  edge(id: EdgeId): EdgeRecord | null { return this.#edges.get(id) ?? null; }
  corner(id: CornerId): CornerRecord | null { return this.#corners.get(id) ?? null; }
  face(id: FaceId): FaceRecord | null { return this.#faces.get(id) ?? null; }
  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId> { return [...(this.#incidentEdges.get(vertex) ?? [])]; }
  incidentFaces(vertex: VertexId): ReadonlyArray<FaceId> { return [...(this.#incidentFaces.get(vertex) ?? [])]; }
  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId> { return [...(this.#adjacentFaces.get(edge) ?? [])]; }
  findEdge(first: VertexId, second: VertexId): EdgeId | null {
    return this.#edgeByVertices.get(edgeKey(first, second)) ?? null;
  }

  #append<K>(map: Map<K, number[]>, key: K, value: number): void {
    const values = map.get(key) ?? [];
    values.push(value);
    map.set(key, values);
  }
}

export const adversarialNonManifoldFixture = (): CanonicalMeshFixture =>
  new CanonicalMeshFixture({
    version: 7,
    reverseSnapshotOrder: true,
    positions: {
      1: { x: 0, y: 0, z: 0 },
      2: { x: 1, y: 0, z: 0 },
      3: { x: 0, y: 1, z: 0 },
      4: { x: 0, y: -1, z: 0 },
      5: { x: 0, y: 0, z: 1 },
      6: { x: 1, y: 1, z: 0 },
      7: { x: 2, y: 1, z: 0 },
      8: { x: 2, y: 0, z: 0 },
    },
    edgeIds: { "1:2": 90, "6:7": 12 },
    faces: [
      { id: 30, vertices: [1, 2, 3] },
      { id: 10, vertices: [2, 1, 4] },
      { id: 20, vertices: [1, 2, 5] },
      { id: 41, vertices: [6, 7, 8] },
      { id: 40, vertices: [7, 6, 8] },
      { id: 42, vertices: [6, 7, 3] },
    ],
  });

export interface ClosedLoopFixtureOptions {
  readonly version?: number;
  readonly radius?: number;
  readonly startId?: number;
  readonly segments?: number;
  readonly rotationRadians?: number;
  readonly reverseSnapshotOrder?: boolean;
}

export const closedLoopFixture = (options: ClosedLoopFixtureOptions = {}): CanonicalMeshFixture => {
  const radius = options.radius ?? 1;
  const startId = options.startId ?? 1;
  const rotation = options.rotationRadians ?? 0;
  const segments = options.segments ?? 4;
  if (!Number.isSafeInteger(segments) || segments < 3) throw new RangeError("segments must be at least 3");
  const positions: Record<number, Vec3> = {};
  for (let index = 0; index < segments; index += 1) {
    const angle = rotation + (Math.PI * 2 * index) / segments;
    positions[startId + index] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
  }
  return new CanonicalMeshFixture({
    ...(options.version === undefined ? {} : { version: options.version }),
    positions,
    ...(options.reverseSnapshotOrder === undefined
      ? {}
      : { reverseSnapshotOrder: options.reverseSnapshotOrder }),
    faces: [{
      id: startId + 100,
      vertices: Array.from({ length: segments }, (_, index) => startId + index),
    }],
  });
};

export const openChainFixture = (): CanonicalMeshFixture =>
  new CanonicalMeshFixture({
    version: 2,
    positions: {
      1: { x: 0, y: 0, z: 0 },
      2: { x: 1, y: 0, z: 0 },
      3: { x: 2, y: 0, z: 0 },
      4: { x: 0, y: 1, z: 0 },
    },
    faces: [{ id: 10, vertices: [1, 2, 3, 4] }],
  });
