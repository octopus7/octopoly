import type {
  MeshElementSet,
  PickHit,
  PickingService,
  PointerSample,
  SelectionSnapshot,
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
} from "./gesture";

const DELETE_COLOR = Object.freeze({ x: 1, y: 0.22, z: 0.2, w: 1 });

function hasSelection(selection: SelectionSnapshot): boolean {
  return selection.vertices.size + selection.edges.size + selection.faces.size > 0;
}

function elementsFromSelection(selection: SelectionSnapshot): MeshElementSet {
  return {
    vertices: [...selection.vertices],
    edges: [...selection.edges],
    faces: [...selection.faces],
  };
}

function elementsFromPick(hit: PickHit): MeshElementSet {
  switch (hit.kind) {
    case "vertex":
      if (hit.vertex === undefined) throw new Error("vertex pick is missing a vertex id");
      return { vertices: [hit.vertex] };
    case "edge":
      if (hit.edge === undefined) throw new Error("edge pick is missing an edge id");
      return { edges: [hit.edge] };
    case "face":
      if (hit.face === undefined) throw new Error("face pick is missing a face id");
      return { faces: [hit.face] };
  }
}

export class DeleteElementsTool implements Tool {
  readonly id = "basic.delete-elements";
  readonly #gesture = new MutationGesture();
  #elements: MeshElementSet | null = null;

  constructor(
    private readonly picking: PickingService,
    private readonly radiusCssPx = 12,
  ) {
    if (!Number.isFinite(radiusCssPx) || radiusCssPx < 0) {
      throw new RangeError("delete radius must be a non-negative finite CSS-pixel value");
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
      const selection = context.selection.snapshot();
      const hit = pickAt(sample, context, this.picking, this.radiusCssPx);
      if (!hasSelection(selection) && hit === null) return UNHANDLED;
      if (!this.#gesture.begin(sample.pointerId, "Delete elements", context)) return UNHANDLED;
      this.#elements = hasSelection(selection) ? elementsFromSelection(selection) : elementsFromPick(hit!);
      if (hit !== null) {
        this.#gesture.publishPreview(
          this.id,
          [pointsOverlay([hit.position], DELETE_COLOR, 12)],
          context,
        );
      }
      return CAPTURED;
    }

    if (!this.#gesture.active(sample.pointerId)) return UNHANDLED;
    if (sample.phase !== "up") return HANDLED;

    try {
      const result = context.mutations.execute("Delete elements", {
        kind: "deleteElements",
        elements: this.#elements!,
      });
      this.#gesture.record(result);
      this.#gesture.commit(context);
      this.#elements = null;
      context.selection.prune(context.mesh);
      return RELEASED;
    } catch (error) {
      this.#gesture.rollback(context);
      this.#elements = null;
      throw error;
    }
  }

  cancel(context: ToolContext): void {
    this.#gesture.rollback(context);
    this.#elements = null;
  }

  deactivate(context: ToolContext): void {
    this.cancel(context);
  }
}
