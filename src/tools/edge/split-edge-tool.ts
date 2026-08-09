import type {
  PickHit,
  PickingService,
  PointerSample,
  Tool,
  ToolContext,
  ToolInputResult,
} from "@octopoly/contracts";

import { pointsOverlay } from "../../renderer/overlays";
import {
  CAPTURED,
  HANDLED,
  isModelingPointer,
  MutationGesture,
  pickAt,
  RELEASED,
  UNHANDLED,
} from "../basic/gesture";

const SPLIT_EDGE_COLOR = Object.freeze({ x: 1, y: 0.58, z: 0.12, w: 1 });

export class SplitEdgeTool implements Tool {
  readonly id = "edge.split";
  readonly #gesture = new MutationGesture();
  #hit: PickHit | null = null;

  constructor(
    private readonly picking: PickingService,
    private readonly t = 0.5,
    private readonly radiusCssPx = 12,
  ) {
    if (!Number.isFinite(t) || t <= 0 || t >= 1) {
      throw new RangeError("split parameter must be strictly between zero and one");
    }
    if (!Number.isFinite(radiusCssPx) || radiusCssPx < 0) {
      throw new RangeError("split radius must be a non-negative finite CSS-pixel value");
    }
  }

  activate(context: ToolContext): void {
    this.cancel(context);
  }

  pointer(sample: PointerSample, context: ToolContext): ToolInputResult {
    if (sample.phase === "cancel" && this.#gesture.active(sample.pointerId)) {
      this.cancel(context);
      return RELEASED;
    }

    if (sample.phase === "down") {
      if (!isModelingPointer(sample)) return UNHANDLED;
      const hit = pickAt(sample, context, this.picking, this.radiusCssPx);
      if (
        hit?.kind !== "edge" ||
        hit.edge === undefined ||
        !this.#gesture.begin(sample.pointerId, "Split edge", context)
      ) {
        return UNHANDLED;
      }
      this.#hit = hit;
      this.#gesture.publishPreview(
        this.id,
        [pointsOverlay([hit.position], SPLIT_EDGE_COLOR, 10)],
        context,
      );
      return CAPTURED;
    }

    if (!this.#gesture.active(sample.pointerId)) return UNHANDLED;
    if (sample.phase !== "up") return HANDLED;

    try {
      const result = context.mutations.execute("Split edge", {
        kind: "splitEdge",
        edge: this.#hit!.edge!,
        t: this.t,
      });
      this.#gesture.record(result);
      this.#gesture.commit(context);
      this.#hit = null;
      return RELEASED;
    } catch (error) {
      this.#gesture.rollback(context);
      this.#hit = null;
      throw error;
    }
  }

  cancel(context: ToolContext): void {
    this.#gesture.rollback(context);
    this.#hit = null;
  }

  deactivate(context: ToolContext): void {
    this.cancel(context);
  }
}
