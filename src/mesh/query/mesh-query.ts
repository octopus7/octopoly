import type {
  CornerRecord,
  EdgeRecord,
  FaceRecord,
  MeshQuery,
  MeshSnapshot,
  VertexRecord,
} from "@octopoly/contracts";
import { ImmutableAttributeSnapshot } from "../attributes";
import { edgePairKey, type MeshState } from "../internal";

function sorted<T extends number>(values: Iterable<T>): ReadonlyArray<T> {
  return Object.freeze([...values].sort((a, b) => a - b));
}
function immutableVertex(record: VertexRecord): VertexRecord {
  return Object.freeze({ id: record.id, position: Object.freeze({ ...record.position }) });
}

function immutableEdge(record: EdgeRecord): EdgeRecord {
  return Object.freeze({ id: record.id, vertices: Object.freeze([...record.vertices]) as readonly [number, number] });
}

function immutableCorner(record: CornerRecord): CornerRecord {
  return Object.freeze({ ...record });
}

function immutableFace(record: FaceRecord): FaceRecord {
  return Object.freeze({ id: record.id, corners: Object.freeze([...record.corners]) });
}

export class InternalMeshQuery implements MeshQuery {
  public constructor(private readonly getState: () => MeshState) {}

  public snapshot(): MeshSnapshot {
    const state = this.getState();
    return Object.freeze({
      version: state.version,
      vertices: Object.freeze(
        [...state.vertices.values()].sort((a, b) => a.id - b.id).map(immutableVertex),
      ),
      edges: Object.freeze(
        [...state.edges.values()].sort((a, b) => a.id - b.id).map(immutableEdge),
      ),
      corners: Object.freeze(
        [...state.corners.values()].sort((a, b) => a.id - b.id).map(immutableCorner),
      ),
      faces: Object.freeze(
        [...state.faces.values()].sort((a, b) => a.id - b.id).map(immutableFace),
      ),
      attributes: new ImmutableAttributeSnapshot(state),
    });
  }

  public vertex(id: number): VertexRecord | null {
    const record = this.getState().vertices.get(id);
    return record ? immutableVertex(record) : null;
  }

  public edge(id: number): EdgeRecord | null {
    const record = this.getState().edges.get(id);
    return record ? immutableEdge(record) : null;
  }

  public corner(id: number): CornerRecord | null {
    const record = this.getState().corners.get(id);
    return record ? immutableCorner(record) : null;
  }

  public face(id: number): FaceRecord | null {
    const record = this.getState().faces.get(id);
    return record ? immutableFace(record) : null;
  }

  public incidentEdges(vertex: number): ReadonlyArray<number> {
    return sorted(this.getState().vertexEdges.get(vertex) ?? []);
  }

  public incidentFaces(vertex: number): ReadonlyArray<number> {
    return sorted(this.getState().vertexFaces.get(vertex) ?? []);
  }

  public adjacentFaces(edge: number): ReadonlyArray<number> {
    return sorted(this.getState().edgeFaces.get(edge) ?? []);
  }

  public findEdge(a: number, b: number): number | null {
    return this.getState().edgeByPair.get(edgePairKey(a, b)) ?? null;
  }
}
