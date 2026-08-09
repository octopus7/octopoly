import type {
  CornerId,
  Disposable,
  EdgeId,
  FaceId,
  VertexId,
} from "./fundamental";
import type { Vec2, Vec3, Vec4 } from "./math";

export interface VertexRecord {
  readonly id: VertexId;
  readonly position: Vec3;
}

export interface EdgeRecord {
  readonly id: EdgeId;
  readonly vertices: readonly [VertexId, VertexId];
}

export interface CornerRecord {
  readonly id: CornerId;
  readonly face: FaceId;
  readonly vertex: VertexId;
  readonly edge: EdgeId;
}

export interface FaceRecord {
  readonly id: FaceId;
  readonly corners: ReadonlyArray<CornerId>;
}

export interface MeshSnapshot {
  readonly version: number;
  readonly vertices: ReadonlyArray<VertexRecord>;
  readonly edges: ReadonlyArray<EdgeRecord>;
  readonly corners: ReadonlyArray<CornerRecord>;
  readonly faces: ReadonlyArray<FaceRecord>;
  readonly attributes: AttributeSnapshot;
}

export interface MeshQuery {
  snapshot(): MeshSnapshot;
  vertex(id: VertexId): VertexRecord | null;
  edge(id: EdgeId): EdgeRecord | null;
  corner(id: CornerId): CornerRecord | null;
  face(id: FaceId): FaceRecord | null;
  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId>;
  incidentFaces(vertex: VertexId): ReadonlyArray<FaceId>;
  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId>;
  findEdge(a: VertexId, b: VertexId): EdgeId | null;
}

export interface TriangleMeshSnapshot {
  readonly version: number;
  readonly positions: ReadonlyArray<Vec3>;
  readonly normals?: ReadonlyArray<Vec3>;
  readonly indices: ReadonlyArray<number>;
}

export type AttributeDomain = "vertex" | "corner" | "face";
export type AttributeValue = number | string | boolean | Vec2 | Vec3 | Vec4 | ReadonlyArray<number>;

export interface AttributeKey<T extends AttributeValue> {
  readonly domain: AttributeDomain;
  readonly name: string;
}

export interface AttributeSnapshot {
  has<T extends AttributeValue>(key: AttributeKey<T>): boolean;
  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined;
}

export interface MeshElementSet {
  readonly vertices?: ReadonlyArray<VertexId>;
  readonly edges?: ReadonlyArray<EdgeId>;
  readonly corners?: ReadonlyArray<CornerId>;
  readonly faces?: ReadonlyArray<FaceId>;
}

export type MeshCommand =
  | { readonly kind: "createVertex"; readonly position: Vec3 }
  | { readonly kind: "createFace"; readonly vertices: ReadonlyArray<VertexId> }
  | { readonly kind: "setVertexPositions"; readonly positions: ReadonlyMap<VertexId, Vec3> }
  | { readonly kind: "deleteElements"; readonly elements: MeshElementSet }
  | { readonly kind: "splitEdge"; readonly edge: EdgeId; readonly t: number }
  | { readonly kind: "collapseEdge"; readonly edge: EdgeId; readonly keep?: VertexId }
  | { readonly kind: "dissolveEdges"; readonly edges: ReadonlyArray<EdgeId> }
  | { readonly kind: "weldVertices"; readonly vertices: ReadonlyArray<VertexId>; readonly target: Vec3 }
  | {
      readonly kind: "bridgeEdges";
      readonly first: ReadonlyArray<EdgeId>;
      readonly second: ReadonlyArray<EdgeId>;
    }
  | { readonly kind: "extrudeEdges"; readonly edges: ReadonlyArray<EdgeId>; readonly offset: Vec3 }
  | { readonly kind: "extrudeFaces"; readonly faces: ReadonlyArray<FaceId>; readonly offset: Vec3 }
  | { readonly kind: "rotateDiagonal"; readonly edge: EdgeId }
  | {
      readonly kind: "setAttribute";
      readonly key: AttributeKey<AttributeValue>;
      readonly values: ReadonlyMap<number, AttributeValue | undefined>;
    }
  | { readonly kind: "batch"; readonly commands: ReadonlyArray<MeshCommand> };

export interface ReversibleChange {
  readonly id: string;
  readonly label: string;
  apply(): void;
  revert(): void;
  dispose?(): void;
}

export interface MeshPatch extends ReversibleChange {
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly affected: MeshElementSet;
}

export interface MeshMutationResult {
  readonly patch: MeshPatch;
  readonly snapshot: MeshSnapshot;
  readonly created: MeshElementSet;
  readonly updated: MeshElementSet;
  readonly deleted: MeshElementSet;
}

export interface MeshMutationService {
  execute(label: string, command: MeshCommand): MeshMutationResult;
  validate(command: MeshCommand): ReadonlyArray<string>;
}

export interface MeshDocument extends MeshQuery, MeshMutationService, Disposable {
  serialize(): SerializedMesh;
}

export interface MeshFactory {
  createEmpty(): MeshDocument;
  restore(source: SerializedMesh): MeshDocument;
}

export interface SerializedAttribute {
  readonly domain: AttributeDomain;
  readonly name: string;
  readonly entries: ReadonlyArray<readonly [number, AttributeValue]>;
}

export interface SerializedMesh {
  readonly version: number;
  readonly vertices: ReadonlyArray<VertexRecord>;
  readonly edges: ReadonlyArray<EdgeRecord>;
  readonly corners: ReadonlyArray<CornerRecord>;
  readonly faces: ReadonlyArray<FaceRecord>;
  readonly attributes: ReadonlyArray<SerializedAttribute>;
}
