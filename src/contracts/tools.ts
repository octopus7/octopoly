import type { CameraSnapshot, ViewportSnapshot } from "./camera";
import type { Disposable } from "./fundamental";
import type { HistoryService } from "./history";
import type { PointerSample } from "./input";
import type { Vec3, Vec4 } from "./math";
import type { MeshMutationService, MeshQuery } from "./mesh";
import type { SelectionService } from "./selection";
import type { SurfaceQuery } from "./surface";

export type OverlayPrimitive =
  | {
      readonly kind: "points";
      readonly positions: ReadonlyArray<Vec3>;
      readonly color: Vec4;
      readonly sizeCssPx: number;
    }
  | {
      readonly kind: "polyline";
      readonly positions: ReadonlyArray<Vec3>;
      readonly color: Vec4;
      readonly widthCssPx: number;
    }
  | { readonly kind: "triangles"; readonly positions: ReadonlyArray<Vec3>; readonly color: Vec4 };

export interface ToolPreview {
  readonly id: string;
  readonly revision: number;
  readonly primitives: ReadonlyArray<OverlayPrimitive>;
}

export interface ToolContext {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly surface: SurfaceQuery;
  getCamera(): CameraSnapshot;
  getViewport(): ViewportSnapshot;
  setPreview(preview: ToolPreview | null): void;
  requestRender(): void;
}

export interface ToolInputResult {
  readonly handled: boolean;
  readonly capturePointer?: boolean;
  readonly releasePointer?: boolean;
}

export interface Tool {
  readonly id: string;
  activate?(context: ToolContext): void;
  deactivate?(context: ToolContext): void;
  pointer?(sample: PointerSample, context: ToolContext): ToolInputResult;
  cancel?(context: ToolContext): void;
}

export interface ToolRegistry extends Disposable {
  register(tool: Tool): void;
  unregister(id: string): void;
  activate(id: string): void;
  activateScoped(id: string): Disposable;
  active(): Tool | null;
}
