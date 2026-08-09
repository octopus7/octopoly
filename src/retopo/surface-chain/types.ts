import type {
  EdgeId,
  FaceId,
  SurfaceHit,
  Vec3,
  VertexId,
} from "@octopoly/contracts";

export type RetopoChainAnchor =
  | { readonly kind: "surface" }
  | { readonly kind: "vertex"; readonly vertex: VertexId }
  | {
      readonly kind: "edge";
      readonly edge: EdgeId;
      readonly vertices: readonly [VertexId, VertexId];
      readonly t: number;
    };

export interface RetopoChainPoint {
  readonly inputIndex: number;
  readonly surfaceHit: SurfaceHit;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly anchor: RetopoChainAnchor;
}

export type RetopoChainContinuity =
  | { readonly kind: "surface" }
  | {
      readonly kind: "shared-vertex";
      readonly vertex: VertexId;
      readonly incidentEdges: ReadonlyArray<EdgeId>;
    }
  | {
      readonly kind: "mesh-edge";
      readonly edge: EdgeId;
      readonly adjacentFaces: ReadonlyArray<FaceId>;
    };

export interface RetopoChainSegment {
  readonly from: number;
  readonly to: number;
  readonly continuity: RetopoChainContinuity;
}

export interface RetopoSurfaceChain {
  readonly points: ReadonlyArray<RetopoChainPoint>;
  readonly segments: ReadonlyArray<RetopoChainSegment>;
}

export type SurfaceChainRejectionReason =
  | "surface-miss"
  | "surface-discontinuity"
  | "normal-discontinuity"
  | "degenerate-hit"
  | "degenerate-chain";

export type SurfaceChainResult =
  | { readonly kind: "complete"; readonly chain: RetopoSurfaceChain }
  | {
      readonly kind: "rejected";
      readonly reason: SurfaceChainRejectionReason;
      readonly inputIndex: number;
      readonly partial: RetopoSurfaceChain;
    };
