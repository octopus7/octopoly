import type {
  PickHit,
  PickingService,
  PointerSample,
  SelectionChange,
  SelectionMode,
  Tool,
  ToolContext,
  ToolInputResult,
} from "@octopoly/contracts";
import { incrementNonNegativeSafeInteger } from "@octopoly/contracts";

import { pointsOverlay, toolPreview } from "../../renderer/overlays";
import { CAPTURED, HANDLED, isModelingPointer, pickAt, RELEASED, UNHANDLED } from "./gesture";

const SELECT_COLOR = Object.freeze({ x: 1, y: 0.72, z: 0.1, w: 1 });

function selectionFor(hit: PickHit): SelectionChange {
  switch (hit.kind) {
    case "vertex":
      if (hit.vertex === undefined) throw new Error("vertex pick is missing a vertex id");
      return { vertices: new Set([hit.vertex]) };
    case "edge":
      if (hit.edge === undefined) throw new Error("edge pick is missing an edge id");
      return { edges: new Set([hit.edge]) };
    case "face":
      if (hit.face === undefined) throw new Error("face pick is missing a face id");
      return { faces: new Set([hit.face]) };
  }
}

export class SelectTool implements Tool {
  readonly id = "basic.select";
  #pointerId: number | null = null;
  #revision = 0;

  constructor(
    private readonly picking: PickingService,
    private readonly mode: SelectionMode = "replace",
    private readonly radiusCssPx = 12,
  ) {
    if (!Number.isFinite(radiusCssPx) || radiusCssPx < 0) {
      throw new RangeError("selection radius must be a non-negative finite CSS-pixel value");
    }
  }

  activate(context: ToolContext): void {
    this.cancel(context);
  }

  pointer(sample: PointerSample, context: ToolContext): ToolInputResult {
    if (sample.phase === "cancel" && this.#pointerId === sample.pointerId) {
      this.cancel(context);
      return RELEASED;
    }

    if (sample.phase === "down") {
      if (!isModelingPointer(sample) || this.#pointerId !== null) return UNHANDLED;
      this.#pointerId = sample.pointerId;
      this.#showPick(pickAt(sample, context, this.picking, this.radiusCssPx), context);
      return CAPTURED;
    }

    if (this.#pointerId !== sample.pointerId) return UNHANDLED;

    if (sample.phase === "move") {
      this.#showPick(pickAt(sample, context, this.picking, this.radiusCssPx), context);
      return HANDLED;
    }

    if (sample.phase === "up") {
      const hit = pickAt(sample, context, this.picking, this.radiusCssPx);
      if (hit === null) {
        if (this.mode === "replace") context.selection.clear();
      } else {
        context.selection.update(this.mode, selectionFor(hit));
      }
      this.#pointerId = null;
      context.setPreview(null);
      context.requestRender();
      return RELEASED;
    }

    return HANDLED;
  }

  cancel(context: ToolContext): void {
    this.#pointerId = null;
    context.setPreview(null);
    context.requestRender();
  }

  deactivate(context: ToolContext): void {
    this.cancel(context);
  }

  #showPick(hit: PickHit | null, context: ToolContext): void {
    if (hit === null) {
      context.setPreview(null);
    } else {
      const nextRevision = incrementNonNegativeSafeInteger(
        this.#revision,
        "selection preview revision",
      );
      context.setPreview(
        toolPreview(`${this.id}.hover`, this.#revision, [
          pointsOverlay([hit.position], SELECT_COLOR, 10),
        ]),
      );
      this.#revision = nextRevision;
    }
    context.requestRender();
  }
}
