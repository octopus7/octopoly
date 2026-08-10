import type {
  FaceId,
  PickingService,
  PointerSample,
  Ray,
  Tool,
  ToolContext,
  ToolInputResult,
  Vec3,
} from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

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
import {
  type ConstructionPlane,
  intersectRayPlane,
  selectedFacesAreaWeightedNormal,
  wellConditionedNormalDragPlane,
} from "../basic/construction-plane";

const EXTRUDE_FACE_COLOR = Object.freeze({ x: 0.75, y: 0.42, z: 1, w: 1 });

type ExtrudeTargetMode =
  | { readonly kind: "surface" }
  | {
      readonly kind: "plane";
      readonly plane: ConstructionPlane;
      readonly faceNormal: Vec3;
    };

export class ExtrudeFacesTool implements Tool {
  readonly id = "face.extrude";
  readonly #gesture = new MutationGesture();
  #faces: ReadonlyArray<FaceId> = [];
  #anchor: Vec3 | null = null;
  #target: Vec3 | null = null;
  #targetMode: ExtrudeTargetMode | null = null;

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
      if (pick?.kind !== "face" || pick.face === undefined) {
        return UNHANDLED;
      }
      const selected = context.selection.snapshot().faces;
      const faces = selected.has(pick.face) && selected.size > 0 ? [...selected] : [pick.face];
      const surface = surfaceAt(sample, context, this.picking);
      let anchor: Vec3;
      let targetMode: ExtrudeTargetMode;
      if (surface !== null) {
        anchor = surface.position;
        targetMode = { kind: "surface" };
      } else {
        const ray = this.#ray(sample, context);
        const faceNormal = selectedFacesAreaWeightedNormal(context.mesh, faces);
        const plane =
          faceNormal === null
            ? null
            : wellConditionedNormalDragPlane(pick.position, faceNormal, ray);
        const intersection = plane === null ? null : intersectRayPlane(ray, plane);
        if (faceNormal === null || plane === null || intersection === null) return UNHANDLED;
        anchor = intersection;
        targetMode = { kind: "plane", plane, faceNormal };
      }
      if (!this.#gesture.begin(sample.pointerId, "Extrude faces", context)) return UNHANDLED;
      this.#faces = faces;
      this.#anchor = anchor;
      this.#target = anchor;
      this.#targetMode = targetMode;
      this.#publish(context);
      return CAPTURED;
    }

    if (!this.#gesture.active(sample.pointerId)) return UNHANDLED;
    if (sample.phase === "move" || sample.phase === "up") {
      if (this.#targetMode?.kind === "surface") {
        const surface = surfaceAt(sample, context, this.picking);
        if (surface !== null) this.#target = surface.position;
      } else if (this.#targetMode?.kind === "plane") {
        this.#target = intersectRayPlane(this.#ray(sample, context), this.#targetMode.plane);
      }
      if (this.#target === null) {
        context.setPreview(null);
        context.requestRender();
      } else {
        this.#publish(context);
      }
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
    const delta = {
      x: this.#target.x - this.#anchor.x,
      y: this.#target.y - this.#anchor.y,
      z: this.#target.z - this.#anchor.z,
    };
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y) || !Number.isFinite(delta.z)) {
      return null;
    }
    if (this.#targetMode?.kind === "plane") {
      const normal = this.#targetMode.faceNormal;
      const distance = delta.x * normal.x + delta.y * normal.y + delta.z * normal.z;
      if (!Number.isFinite(distance) || Math.abs(distance) <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
        return null;
      }
      return { x: normal.x * distance, y: normal.y * distance, z: normal.z * distance };
    }
    if (Math.hypot(delta.x, delta.y, delta.z) <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
      return null;
    }
    return delta;
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
    this.#targetMode = null;
  }

  #ray(sample: PointerSample, context: ToolContext): Ray {
    return this.picking.rayFromScreen(
      { x: sample.x, y: sample.y },
      context.getCamera(),
      context.getViewport(),
    );
  }
}
