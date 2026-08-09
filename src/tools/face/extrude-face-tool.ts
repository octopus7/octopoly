import type {
  FaceId,
  PickingService,
  PointerSample,
  Tool,
  ToolContext,
  ToolInputResult,
  Vec3,
} from "@octopoly/contracts";

import { pointsOverlay, polylineOverlay } from "../../renderer/overlays";
import {
  CAPTURED,
  HANDLED,
  isModelingPointer,
  MutationGesture,
  pickAt,
  RELEASED,
  surfaceAt,
  UNHANDLED,
} from "../basic/gesture";

const EXTRUDE_FACE_COLOR = Object.freeze({ x: 0.75, y: 0.42, z: 1, w: 1 });

export class ExtrudeFacesTool implements Tool {
  readonly id = "face.extrude";
  readonly #gesture = new MutationGesture();
  #faces: ReadonlyArray<FaceId> = [];
  #anchor: Vec3 | null = null;
  #target: Vec3 | null = null;

  constructor(
    private readonly picking: PickingService,
    private readonly radiusCssPx = 12,
  ) {
    if (!Number.isFinite(radiusCssPx) || radiusCssPx < 0) {
      throw new RangeError("extrude radius must be a non-negative finite CSS-pixel value");
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
      const pick = pickAt(sample, context, this.picking, this.radiusCssPx);
      if (
        pick?.kind !== "face" ||
        pick.face === undefined ||
        !this.#gesture.begin(sample.pointerId, "Extrude faces", context)
      ) {
        return UNHANDLED;
      }
      const selected = context.selection.snapshot().faces;
      this.#faces = selected.has(pick.face) && selected.size > 0 ? [...selected] : [pick.face];
      this.#anchor = surfaceAt(sample, context, this.picking)?.position ?? pick.position;
      this.#target = this.#anchor;
      this.#publish(context);
      return CAPTURED;
    }

    if (!this.#gesture.active(sample.pointerId)) return UNHANDLED;
    if (sample.phase === "move" || sample.phase === "up") {
      const surface = surfaceAt(sample, context, this.picking);
      if (surface !== null) this.#target = surface.position;
      this.#publish(context);
    }

    if (sample.phase !== "up") return HANDLED;
    const offset = this.#offset();
    if (offset === null || (offset.x === 0 && offset.y === 0 && offset.z === 0)) {
      this.#gesture.rollback(context);
      this.#clearState();
      return RELEASED;
    }

    try {
      const result = context.mutations.execute("Extrude faces", {
        kind: "extrudeFaces",
        faces: this.#faces,
        offset,
      });
      this.#gesture.record(result);
      this.#gesture.commit(context);
      this.#clearState();
      return RELEASED;
    } catch (error) {
      this.#gesture.rollback(context);
      this.#clearState();
      throw error;
    }
  }

  cancel(context: ToolContext): void {
    this.#gesture.rollback(context);
    this.#clearState();
  }

  deactivate(context: ToolContext): void {
    this.cancel(context);
  }

  #offset(): Vec3 | null {
    if (this.#anchor === null || this.#target === null) return null;
    return {
      x: this.#target.x - this.#anchor.x,
      y: this.#target.y - this.#anchor.y,
      z: this.#target.z - this.#anchor.z,
    };
  }

  #publish(context: ToolContext): void {
    if (this.#anchor === null || this.#target === null) return;
    this.#gesture.publishPreview(
      this.id,
      [
        polylineOverlay([this.#anchor, this.#target], EXTRUDE_FACE_COLOR, 2),
        pointsOverlay([this.#target], EXTRUDE_FACE_COLOR, 9),
      ],
      context,
    );
  }

  #clearState(): void {
    this.#faces = [];
    this.#anchor = null;
    this.#target = null;
  }
}
