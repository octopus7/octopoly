import type {
  PickingService,
  PointerSample,
  SurfaceHit,
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
  RELEASED,
  surfaceAt,
  UNHANDLED,
} from "../basic/gesture";

const CREATE_VERTEX_COLOR = Object.freeze({ x: 0.4, y: 1, z: 0.42, w: 1 });

export class CreateVertexTool implements Tool {
  readonly id = "vertex.create";
  readonly #gesture = new MutationGesture();
  #hit: SurfaceHit | null = null;

  constructor(private readonly picking: PickingService) {}

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
      const hit = surfaceAt(sample, context, this.picking);
      if (hit === null || !this.#gesture.begin(sample.pointerId, "Create vertex", context)) {
        return UNHANDLED;
      }
      this.#hit = hit;
      this.#publish(context);
      return CAPTURED;
    }

    if (!this.#gesture.active(sample.pointerId)) return UNHANDLED;
    if (sample.phase === "move" || sample.phase === "up") {
      const hit = surfaceAt(sample, context, this.picking);
      if (hit !== null) this.#hit = hit;
      this.#publish(context);
    }

    if (sample.phase !== "up") return HANDLED;
    try {
      const result = context.mutations.execute("Create vertex", {
        kind: "createVertex",
        position: this.#hit!.position,
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

  #publish(context: ToolContext): void {
    if (this.#hit === null) return;
    this.#gesture.publishPreview(
      this.id,
      [pointsOverlay([this.#hit.position], CREATE_VERTEX_COLOR, 10)],
      context,
    );
  }
}
