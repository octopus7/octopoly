import type {
  AttributeDomain,
  AttributeValue,
  CornerId,
  EdgeId,
  FaceId,
  Vec3,
  VertexId,
} from "@octopoly/contracts";

export type ElementDomain = "vertex" | "edge" | "corner" | "face";

export interface MutableVertexRecord {
  id: VertexId;
  position: Vec3;
}
export interface MutableEdgeRecord {
  id: EdgeId;
  vertices: [VertexId, VertexId];
}

export interface MutableCornerRecord {
  id: CornerId;
  face: FaceId;
  vertex: VertexId;
  edge: EdgeId;
}

export interface MutableFaceRecord {
  id: FaceId;
  corners: CornerId[];
}

export interface IdAllocatorState {
  next: number;
  retired: Set<number>;
}

export interface MutableAttributeStore {
  domain: AttributeDomain;
  name: string;
  entries: Map<number, AttributeValue>;
}

export interface MeshState {
  version: number;
  stamp: number;
  vertices: Map<VertexId, MutableVertexRecord>;
  edges: Map<EdgeId, MutableEdgeRecord>;
  corners: Map<CornerId, MutableCornerRecord>;
  faces: Map<FaceId, MutableFaceRecord>;
  attributes: Map<string, MutableAttributeStore>;
  allocators: Record<ElementDomain, IdAllocatorState>;
  edgeByPair: Map<string, EdgeId>;
  vertexEdges: Map<VertexId, Set<EdgeId>>;
  vertexFaces: Map<VertexId, Set<FaceId>>;
  edgeFaces: Map<EdgeId, Set<FaceId>>;
  edgeCorners: Map<EdgeId, Set<CornerId>>;
}

export interface CreatedFaceRecords {
  readonly face: FaceId;
  readonly corners: ReadonlyArray<CornerId>;
  readonly edges: ReadonlyArray<EdgeId>;
}

export interface RemovedElementIds {
  readonly vertices: ReadonlyArray<VertexId>;
  readonly edges: ReadonlyArray<EdgeId>;
  readonly corners: ReadonlyArray<CornerId>;
  readonly faces: ReadonlyArray<FaceId>;
}
