import type { EdgeId, FaceId, Unsubscribe, VertexId } from "./fundamental";
import type { MeshQuery } from "./mesh";

export type SelectionMode = "replace" | "add" | "subtract" | "toggle";

export interface SelectionSnapshot {
  readonly version: number;
  readonly vertices: ReadonlySet<VertexId>;
  readonly edges: ReadonlySet<EdgeId>;
  readonly faces: ReadonlySet<FaceId>;
}

export interface SelectionChange {
  readonly vertices?: ReadonlySet<VertexId>;
  readonly edges?: ReadonlySet<EdgeId>;
  readonly faces?: ReadonlySet<FaceId>;
}

export interface SelectionService {
  snapshot(): SelectionSnapshot;
  update(mode: SelectionMode, change: SelectionChange): void;
  clear(): void;
  prune(mesh: MeshQuery): void;
  subscribe(listener: (snapshot: SelectionSnapshot) => void): Unsubscribe;
}
