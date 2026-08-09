import type {
  HistoryTransaction,
  MeshMutationResult,
  OverlayPrimitive,
  PickingService,
  PointerSample,
  SurfaceHit,
  ToolContext,
} from "@octopoly/contracts";
import { incrementNonNegativeSafeInteger } from "@octopoly/contracts";

import { toolPreview } from "../../renderer/overlays";

export const HANDLED = Object.freeze({ handled: true });
export const CAPTURED = Object.freeze({ handled: true, capturePointer: true });
export const RELEASED = Object.freeze({ handled: true, releasePointer: true });
export const UNHANDLED = Object.freeze({ handled: false });

export function isModelingPointer(sample: PointerSample): boolean {
  return sample.isPrimary && sample.pointerType !== "touch";
}

export function pickAt(
  sample: PointerSample,
  context: ToolContext,
  picking: PickingService,
  radiusCssPx: number,
) {
  return picking.pick(
    { x: sample.x, y: sample.y },
    context.getCamera(),
    context.getViewport(),
    context.mesh.snapshot(),
    radiusCssPx,
  );
}

export function surfaceAt(
  sample: PointerSample,
  context: ToolContext,
  picking: PickingService,
): SurfaceHit | null {
  const ray = picking.rayFromScreen(
    { x: sample.x, y: sample.y },
    context.getCamera(),
    context.getViewport(),
  );
  return context.surface.raycast(ray);
}

export class MutationGesture {
  #pointerId: number | null = null;
  #transaction: HistoryTransaction | null = null;
  #previewRevision = 0;

  begin(pointerId: number, label: string, context: ToolContext): boolean {
    if (this.#pointerId !== null) {
      return false;
    }
    this.#transaction = context.history.begin(label);
    this.#pointerId = pointerId;
    return true;
  }

  active(pointerId: number): boolean {
    return this.#pointerId === pointerId;
  }

  publishPreview(
    id: string,
    primitives: ReadonlyArray<OverlayPrimitive>,
    context: ToolContext,
  ): void {
    const nextRevision = incrementNonNegativeSafeInteger(
      this.#previewRevision,
      "tool preview revision",
    );
    context.setPreview(toolPreview(id, this.#previewRevision, primitives));
    this.#previewRevision = nextRevision;
    context.requestRender();
  }

  record(result: MeshMutationResult): void {
    if (this.#transaction === null) {
      throw new Error("no active tool transaction");
    }
    this.#transaction.recordApplied(result.patch);
  }

  commit(context: ToolContext): void {
    if (this.#transaction === null || this.#pointerId === null) {
      throw new Error("no active tool transaction");
    }
    this.#transaction.commit();
    this.#reset(context);
  }

  rollback(context: ToolContext): void {
    this.#transaction?.rollback();
    this.#reset(context);
  }

  #reset(context: ToolContext): void {
    this.#pointerId = null;
    this.#transaction = null;
    context.setPreview(null);
    context.requestRender();
  }
}
