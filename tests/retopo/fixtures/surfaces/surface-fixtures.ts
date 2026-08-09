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
  PointerSample,
  RetopoStrokeInput,
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

const MODIFIERS = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });
const DOWNWARD_RAY = Object.freeze({
  origin: Object.freeze({ x: 0, y: 1, z: 0 }),
  direction: Object.freeze({ x: 0, y: -1, z: 0 }),
});

export function hitInput(
  position: Vec3,
  timestamp: number,
  normal: Vec3 = { x: 0, y: 1, z: 0 },
  surfaceId = "reference",
): RetopoStrokeInput {
  return Object.freeze({
    sample: pointerSample(timestamp),
    ray: DOWNWARD_RAY,
    surfaceHit: Object.freeze({
      surfaceId,
      triangleId: timestamp,
      position: Object.freeze({ ...position }),
      normal: Object.freeze({ ...normal }),
      barycentric: Object.freeze({ x: 0.25, y: 0.25, z: 0.5 }),
      distance: 1,
    }),
  });
}

export function missInput(timestamp: number): RetopoStrokeInput {
  return Object.freeze({
    sample: pointerSample(timestamp),
    ray: DOWNWARD_RAY,
    surfaceHit: null,
  });
}

function pointerSample(timestamp: number): PointerSample {
  return Object.freeze({
    pointerId: 1,
    pointerType: "pen",
    phase: timestamp === 0 ? "down" : "move",
    isPrimary: true,
    x: timestamp,
    y: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    buttons: 1,
    modifiers: MODIFIERS,
    timestamp,
    coalesced: timestamp > 0,
  });
}

interface FakeMeshOptions {
  readonly vertices?: ReadonlyArray<VertexRecord>;
  readonly edges?: ReadonlyArray<EdgeRecord>;
  readonly incidentEdges?: ReadonlyMap<VertexId, ReadonlyArray<EdgeId>>;
  readonly adjacentFaces?: ReadonlyMap<EdgeId, ReadonlyArray<FaceId>>;
}

export class FakeMeshQuery implements MeshQuery {
  snapshotCalls = 0;

  private readonly vertices: ReadonlyArray<VertexRecord>;
  private readonly edges: ReadonlyArray<EdgeRecord>;
  private readonly verticesById: ReadonlyMap<VertexId, VertexRecord>;
  private readonly edgesById: ReadonlyMap<EdgeId, EdgeRecord>;
  private readonly incidentEdgeResults: ReadonlyMap<VertexId, ReadonlyArray<EdgeId>>;
  private readonly adjacentFaceResults: ReadonlyMap<EdgeId, ReadonlyArray<FaceId>>;

  constructor(options: FakeMeshOptions = {}) {
    this.vertices = Object.freeze([...(options.vertices ?? [])]);
    this.edges = Object.freeze([...(options.edges ?? [])]);
    this.verticesById = new Map(this.vertices.map((vertex) => [vertex.id, vertex]));
    this.edgesById = new Map(this.edges.map((edge) => [edge.id, edge]));
    this.incidentEdgeResults = options.incidentEdges ?? new Map();
    this.adjacentFaceResults = options.adjacentFaces ?? new Map();
  }

  snapshot(): MeshSnapshot {
    this.snapshotCalls += 1;
    return Object.freeze({
      version: 0,
      vertices: this.vertices,
      edges: this.edges,
      corners: Object.freeze([]),
      faces: Object.freeze([]),
      attributes: EMPTY_ATTRIBUTES,
    });
  }

  vertex(id: VertexId): VertexRecord | null {
    return this.verticesById.get(id) ?? null;
  }

  edge(id: EdgeId): EdgeRecord | null {
    return this.edgesById.get(id) ?? null;
  }

  corner(_id: CornerId): CornerRecord | null {
    return null;
  }

  face(_id: FaceId): FaceRecord | null {
    return null;
  }

  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId> {
    return this.incidentEdgeResults.get(vertex) ?? Object.freeze([]);
  }

  incidentFaces(_vertex: VertexId): ReadonlyArray<FaceId> {
    return Object.freeze([]);
  }

  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId> {
    return this.adjacentFaceResults.get(edge) ?? Object.freeze([]);
  }

  findEdge(a: VertexId, b: VertexId): EdgeId | null {
    const matches = this.edges
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

export function adjacencyMesh(reverseSnapshotOrder = false): FakeMeshQuery {
  const vertices: ReadonlyArray<VertexRecord> = [
    vertex(9, 0, 0, 0),
    vertex(2, 1, 0, 0),
    vertex(7, 2, 0, 0),
  ];
  const edges: ReadonlyArray<EdgeRecord> = [edge(20, 9, 2), edge(10, 2, 7)];
  return new FakeMeshQuery({
    vertices: reverseSnapshotOrder ? [...vertices].reverse() : vertices,
    edges: reverseSnapshotOrder ? [...edges].reverse() : edges,
    incidentEdges: new Map([[2, Object.freeze([20, 10, 20])]]),
    adjacentFaces: new Map([
      [20, Object.freeze([4, 1, 4])],
      [10, Object.freeze([3])],
    ]),
  });
}

export function crossingEdgesMesh(reverseSnapshotOrder = false): FakeMeshQuery {
  const vertices: ReadonlyArray<VertexRecord> = [
    vertex(1, -1, 0, 0),
    vertex(2, 1, 0, 0),
    vertex(3, 0, 0, -1),
    vertex(4, 0, 0, 1),
  ];
  const edges: ReadonlyArray<EdgeRecord> = [edge(20, 1, 2), edge(5, 3, 4)];
  return new FakeMeshQuery({
    vertices: reverseSnapshotOrder ? [...vertices].reverse() : vertices,
    edges: reverseSnapshotOrder ? [...edges].reverse() : edges,
  });
}

export function scaleMesh(scale: number): FakeMeshQuery {
  return new FakeMeshQuery({
    vertices: [vertex(1, 0, 0, 0), vertex(2, scale, 0, 0)],
    edges: [edge(1, 1, 2)],
  });
}

function vertex(id: VertexId, x: number, y: number, z: number): VertexRecord {
  return Object.freeze({ id, position: Object.freeze({ x, y, z }) });
}

function edge(id: EdgeId, first: VertexId, second: VertexId): EdgeRecord {
  return Object.freeze({
    id,
    vertices: Object.freeze([first, second]) as readonly [VertexId, VertexId],
  });
}
