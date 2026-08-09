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
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";

const EMPTY_ATTRIBUTES: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
};

function edgeKey(first: VertexId, second: VertexId): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

export class MeshQueryFake implements MeshQuery {
  readonly #vertices = new Map<VertexId, VertexRecord>();
  readonly #edges = new Map<EdgeId, EdgeRecord>();
  readonly #corners = new Map<CornerId, CornerRecord>();
  readonly #faces = new Map<FaceId, FaceRecord>();
  readonly #edgeByVertices = new Map<string, EdgeId>();
  readonly #incidentEdges = new Map<VertexId, Set<EdgeId>>();
  readonly #incidentFaces = new Map<VertexId, Set<FaceId>>();
  readonly #adjacentFaces = new Map<EdgeId, FaceId[]>();

  snapshotCalls = 0;

  constructor(faceVertices: ReadonlyArray<ReadonlyArray<VertexId>>) {
    let nextEdgeId = 0;
    let nextCornerId = 0;

    faceVertices.forEach((vertices, faceId) => {
      const corners: CornerId[] = [];

      vertices.forEach((vertexId, index) => {
        const nextVertexId = vertices[(index + 1) % vertices.length];
        if (nextVertexId === undefined) {
          throw new Error("A fixture face must contain at least one vertex.");
        }

        if (!this.#vertices.has(vertexId)) {
          this.#vertices.set(vertexId, {
            id: vertexId,
            position: { x: vertexId, y: 0, z: 0 },
          });
        }
        this.#incidentFacesFor(vertexId).add(faceId);

        const key = edgeKey(vertexId, nextVertexId);
        let edgeId = this.#edgeByVertices.get(key);
        if (edgeId === undefined) {
          edgeId = nextEdgeId++;
          this.#edgeByVertices.set(key, edgeId);
          this.#edges.set(edgeId, { id: edgeId, vertices: [vertexId, nextVertexId] });
          this.#adjacentFaces.set(edgeId, []);
        }

        this.#incidentEdgesFor(vertexId).add(edgeId);
        this.#incidentEdgesFor(nextVertexId).add(edgeId);
        this.#adjacentFaces.get(edgeId)?.push(faceId);

        const cornerId = nextCornerId++;
        corners.push(cornerId);
        this.#corners.set(cornerId, {
          id: cornerId,
          face: faceId,
          vertex: vertexId,
          edge: edgeId,
        });
      });

      this.#faces.set(faceId, { id: faceId, corners });
    });
  }

  snapshot(): MeshSnapshot {
    this.snapshotCalls += 1;
    return {
      version: 0,
      vertices: [...this.#vertices.values()],
      edges: [...this.#edges.values()],
      corners: [...this.#corners.values()],
      faces: [...this.#faces.values()],
      attributes: EMPTY_ATTRIBUTES,
    };
  }

  vertex(id: VertexId): VertexRecord | null {
    return this.#vertices.get(id) ?? null;
  }

  edge(id: EdgeId): EdgeRecord | null {
    return this.#edges.get(id) ?? null;
  }

  corner(id: CornerId): CornerRecord | null {
    return this.#corners.get(id) ?? null;
  }

  face(id: FaceId): FaceRecord | null {
    return this.#faces.get(id) ?? null;
  }

  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId> {
    return [...(this.#incidentEdges.get(vertex) ?? [])];
  }

  incidentFaces(vertex: VertexId): ReadonlyArray<FaceId> {
    return [...(this.#incidentFaces.get(vertex) ?? [])];
  }

  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId> {
    return [...(this.#adjacentFaces.get(edge) ?? [])];
  }

  findEdge(first: VertexId, second: VertexId): EdgeId | null {
    return this.#edgeByVertices.get(edgeKey(first, second)) ?? null;
  }

  #incidentEdgesFor(vertexId: VertexId): Set<EdgeId> {
    let result = this.#incidentEdges.get(vertexId);
    if (result === undefined) {
      result = new Set();
      this.#incidentEdges.set(vertexId, result);
    }
    return result;
  }

  #incidentFacesFor(vertexId: VertexId): Set<FaceId> {
    let result = this.#incidentFaces.get(vertexId);
    if (result === undefined) {
      result = new Set();
      this.#incidentFaces.set(vertexId, result);
    }
    return result;
  }
}

export function requireEdge(mesh: MeshQuery, first: VertexId, second: VertexId): EdgeId {
  const edgeId = mesh.findEdge(first, second);
  if (edgeId === null) {
    throw new Error(`Fixture edge ${first}:${second} is missing.`);
  }
  return edgeId;
}

export function sorted(ids: ReadonlyArray<EdgeId>): ReadonlyArray<EdgeId> {
  return [...ids].sort((left, right) => left - right);
}
