export type VertexId = number;
export type EdgeId = number;
export type CornerId = number;
export type FaceId = number;
export type MaterialId = string;
export type AssetId = string;
export type ReferenceSurfaceId = string;
export type SurfaceTriangleId = number;

export type Unsubscribe = () => void;

export interface Disposable {
  dispose(): void;
}
