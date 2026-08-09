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
  SelectionSnapshot,
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";

interface FixtureFace {
  readonly id: FaceId;
  readonly vertices: ReadonlyArray<VertexId>;
  readonly edges: ReadonlyArray<EdgeId>;
}

interface FixtureDefinition {
  readonly vertices: ReadonlyArray<VertexId>;
  readonly edges: ReadonlyArray<readonly [EdgeId, VertexId, VertexId]>;
  readonly faces: ReadonlyArray<FixtureFace>;
}

const EMPTY_ATTRIBUTES: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
};

export class MeshQueryFake implements MeshQuery {
  readonly #vertices: ReadonlyArray<VertexRecord>;
  readonly #edges: ReadonlyArray<EdgeRecord>;
  readonly #corners: ReadonlyArray<CornerRecord>;
  readonly #faces: ReadonlyArray<FaceRecord>;
  readonly #vertexById: ReadonlyMap<VertexId, VertexRecord>;
  readonly #edgeById: ReadonlyMap<EdgeId, EdgeRecord>;
  readonly #cornerById: ReadonlyMap<CornerId, CornerRecord>;
  readonly #faceById: ReadonlyMap<FaceId, FaceRecord>;

  constructor(definition: FixtureDefinition) {
    this.#vertices = definition.vertices.map((id) => ({ id, position: { x: id, y: 0, z: 0 } }));
    this.#edges = definition.edges.map(([id, first, second]) => ({
      id,
      vertices: [first, second],
    }));

    let nextCornerId = 1_000;
    const corners: CornerRecord[] = [];
    const faces: FaceRecord[] = [];
    for (const fixtureFace of definition.faces) {
      if (fixtureFace.vertices.length !== fixtureFace.edges.length) {
        throw new Error(`Fixture face ${fixtureFace.id} has mismatched vertices and edges.`);
      }

      const cornerIds: CornerId[] = [];
      for (let index = 0; index < fixtureFace.vertices.length; index += 1) {
        const vertex = fixtureFace.vertices[index];
        const edge = fixtureFace.edges[index];
        if (vertex === undefined || edge === undefined) {
          throw new Error(`Fixture face ${fixtureFace.id} has an incomplete corner.`);
        }
        const cornerId = nextCornerId;
        nextCornerId += 1;
        cornerIds.push(cornerId);
        corners.push({ id: cornerId, face: fixtureFace.id, vertex, edge });
      }
      faces.push({ id: fixtureFace.id, corners: cornerIds });
    }

    this.#corners = corners;
    this.#faces = faces;
    this.#vertexById = new Map(this.#vertices.map((vertex) => [vertex.id, vertex]));
    this.#edgeById = new Map(this.#edges.map((edge) => [edge.id, edge]));
    this.#cornerById = new Map(this.#corners.map((corner) => [corner.id, corner]));
    this.#faceById = new Map(this.#faces.map((face) => [face.id, face]));
  }

  snapshot(): MeshSnapshot {
    return {
      version: 3,
      vertices: this.#vertices,
      edges: this.#edges,
      corners: this.#corners,
      faces: this.#faces,
      attributes: EMPTY_ATTRIBUTES,
    };
  }

  vertex(id: VertexId): VertexRecord | null {
    return this.#vertexById.get(id) ?? null;
  }

  edge(id: EdgeId): EdgeRecord | null {
    return this.#edgeById.get(id) ?? null;
  }

  corner(id: CornerId): CornerRecord | null {
    return this.#cornerById.get(id) ?? null;
  }

  face(id: FaceId): FaceRecord | null {
    return this.#faceById.get(id) ?? null;
  }

  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId> {
    return this.#edges
      .filter((edge) => edge.vertices.includes(vertex))
      .map((edge) => edge.id);
  }

  incidentFaces(vertex: VertexId): ReadonlyArray<FaceId> {
    return this.#faces
      .filter((face) =>
        face.corners.some((cornerId) => this.#cornerById.get(cornerId)?.vertex === vertex),
      )
      .map((face) => face.id);
  }

  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId> {
    return this.#faces
      .filter((face) =>
        face.corners.some((cornerId) => this.#cornerById.get(cornerId)?.edge === edge),
      )
      .map((face) => face.id);
  }

  findEdge(first: VertexId, second: VertexId): EdgeId | null {
    return (
      this.#edges.find(
        (edge) =>
          (edge.vertices[0] === first && edge.vertices[1] === second) ||
          (edge.vertices[0] === second && edge.vertices[1] === first),
      )?.id ?? null
    );
  }
}

export function mixedTopologyFixture(): MeshQueryFake {
  return new MeshQueryFake({
    vertices: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    edges: [
      [36, 13, 9],
      [35, 10, 13],
      [34, 12, 10],
      [33, 9, 12],
      [32, 11, 9],
      [31, 10, 11],
      [30, 9, 10],
      [22, 8, 6],
      [21, 7, 8],
      [20, 6, 7],
      [16, 5, 4],
      [15, 2, 5],
      [14, 1, 2],
      [13, 3, 0],
      [12, 4, 3],
      [11, 1, 4],
      [10, 0, 1],
    ],
    faces: [
      { id: 105, vertices: [9, 10, 13], edges: [30, 35, 36] },
      { id: 100, vertices: [0, 1, 4, 3], edges: [10, 11, 12, 13] },
      { id: 104, vertices: [10, 9, 12], edges: [30, 33, 34] },
      { id: 102, vertices: [6, 7, 8], edges: [20, 21, 22] },
      { id: 101, vertices: [1, 2, 5, 4], edges: [14, 15, 16, 11] },
      { id: 103, vertices: [9, 10, 11], edges: [30, 31, 32] },
    ],
  });
}

export function selectionSnapshot(
  vertices: ReadonlyArray<VertexId> = [],
  edges: ReadonlyArray<EdgeId> = [],
  faces: ReadonlyArray<FaceId> = [],
): SelectionSnapshot {
  return {
    version: 7,
    vertices: new Set(vertices),
    edges: new Set(edges),
    faces: new Set(faces),
  };
}
