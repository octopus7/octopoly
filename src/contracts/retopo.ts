import type { Disposable } from "./fundamental";
import type { PointerSample } from "./input";
import type { Ray } from "./math";
import type { MeshCommand, MeshMutationResult, MeshQuery } from "./mesh";
import type { SurfaceHit } from "./surface";
import type { ToolPreview } from "./tools";

export interface RetopoStrokeInput {
  readonly sample: PointerSample;
  readonly ray: Ray;
  readonly surfaceHit: SurfaceHit | null;
}

export type RetopoStep =
  | { readonly kind: "none"; readonly preview?: ToolPreview }
  | { readonly kind: "preview"; readonly preview: ToolPreview }
  | {
      readonly kind: "commit";
      readonly label: string;
      readonly command: MeshCommand;
      readonly preview?: ToolPreview;
    }
  | { readonly kind: "complete" }
  | { readonly kind: "rejected"; readonly reason: string; readonly preview?: ToolPreview };

export interface RetopoStrokeSession extends Disposable {
  update(input: RetopoStrokeInput, mesh: MeshQuery): RetopoStep;
  continue(result: MeshMutationResult, mesh: MeshQuery): RetopoStep;
  cancel(): void;
}

export interface RetopoEngine {
  begin(): RetopoStrokeSession;
}
