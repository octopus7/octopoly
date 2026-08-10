import type {
  Ray,
  PickingService,
  PointerSample,
  Tool,
  ToolContext,
  ToolInputResult,
  Vec3,
  VertexId,
} from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

import { pointsOverlay } from "../../renderer/overlays";
import {
  CAPTURED,
  HANDLED,
  isModelingPointer,
  MutationGesture,
  pickAt,
  RELEASED,
  surfaceAt,
  UNHANDLED,
} from "./gesture";
import {
  cameraFacingGesturePlane,
  type ConstructionPlane,
  intersectRayPlane,
} from "./construction-plane";

const MOVE_COLOR = Object.freeze({ x: 0.2, y: 0.82, z: 1, w: 1 });

type MoveTargetMode =
  | { readonly kind: "surface" }
  | { readonly kind: "plane"; readonly plane: ConstructionPlane };

function add(value: Vec3, delta: Vec3): Vec3 {
  return { x: value.x + delta.x, y: value.y + delta.y, z: value.z + delta.z };
}

export class MoveVerticesTool implements Tool {
  readonly id = "basic.move-vertices";
  readonly #gesture = new MutationGesture();
  #anchor: Vec3 | null = null;
  #target: Vec3 | null = null;
  #targetMode: MoveTargetMode | null = null;
  #origins = new Map<VertexId, Vec3>();

  constructor(
    private readonly picking: PickingService,
    private readonly radiusCssPx = 12,
  ) {
    if (!Number.isFinite(radiusCssPx) || radiusCssPx < 0) {
      throw new RangeError("move radius must be a non-negative finite CSS-pixel value");
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
      if (hit?.kind !== "vertex" || hit.vertex === undefined) return UNHANDLED;

      const selected = context.selection.snapshot().vertices;
      const vertices = selected.has(hit.vertex) && selected.size > 0 ? [...selected] : [hit.vertex];
      const origins = new Map<VertexId, Vec3>();
      for (const id of vertices) {
        const vertex = context.mesh.vertex(id);
        if (vertex !== null) origins.set(id, vertex.position);
      }
      if (origins.size === 0) {
        return UNHANDLED;
      }

      const surface = surfaceAt(sample, context, this.picking);
      let anchor: Vec3;
      let target: Vec3;
      let targetMode: MoveTargetMode;
      if (surface !== null) {
        anchor = hit.position;
        target = surface.position;
        targetMode = { kind: "surface" };
      } else {
        const ray = this.#ray(sample, context);
        const plane = cameraFacingGesturePlane(hit.position, context.getCamera());
        const intersection = plane === null ? null : intersectRayPlane(ray, plane);
        if (plane === null || intersection === null) return UNHANDLED;
        anchor = intersection;
        target = intersection;
        targetMode = { kind: "plane", plane };
      }
      if (!this.#gesture.begin(sample.pointerId, "Move vertices", context)) return UNHANDLED;

      this.#origins = origins;
      this.#anchor = anchor;
      this.#target = target;
      this.#targetMode = targetMode;
      this.#publish(context);
      return CAPTURED;
    }

    if (!this.#gesture.active(sample.pointerId)) return UNHANDLED;
    if (sample.phase === "move" || sample.phase === "up") {
      if (this.#targetMode?.kind === "surface") {
        const hit = surfaceAt(sample, context, this.picking);
        if (hit !== null) this.#target = hit.position;
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

    if (sample.phase === "up") {
      const positions = this.#positions();
      if (positions === null) {
        this.#gesture.rollback(context);
        this.#clearState();
        return RELEASED;
      }
      try {
        const result = context.mutations.execute("Move vertices", {
          kind: "setVertexPositions",
          positions,
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

    return HANDLED;
  }

  cancel(context: ToolContext): void {
    this.#gesture.rollback(context);
    this.#clearState();
  }

  deactivate(context: ToolContext): void {
    this.cancel(context);
  }

  #positions(): ReadonlyMap<VertexId, Vec3> | null {
    if (this.#anchor === null || this.#target === null) return null;
    const delta = {
      x: this.#target.x - this.#anchor.x,
      y: this.#target.y - this.#anchor.y,
      z: this.#target.z - this.#anchor.z,
    };
    if (
      !Number.isFinite(delta.x) ||
      !Number.isFinite(delta.y) ||
      !Number.isFinite(delta.z) ||
      Math.hypot(delta.x, delta.y, delta.z) <= NUMERIC_TOLERANCE_POLICY.absoluteDistance
    ) {
      return null;
    }
    return new Map([...this.#origins].map(([id, origin]) => [id, add(origin, delta)]));
  }

  #publish(context: ToolContext): void {
    if (this.#anchor === null || this.#target === null) return;
    const delta = {
      x: this.#target.x - this.#anchor.x,
      y: this.#target.y - this.#anchor.y,
      z: this.#target.z - this.#anchor.z,
    };
    const positions = [...this.#origins.values()].map((origin) => add(origin, delta));
    this.#gesture.publishPreview(this.id, [pointsOverlay(positions, MOVE_COLOR, 11)], context);
  }

  #clearState(): void {
    this.#anchor = null;
    this.#target = null;
    this.#targetMode = null;
    this.#origins.clear();
  }

  #ray(sample: PointerSample, context: ToolContext): Ray {
    return this.picking.rayFromScreen(
      { x: sample.x, y: sample.y },
      context.getCamera(),
      context.getViewport(),
    );
  }
}
