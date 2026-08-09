import type {
  PointerInputSink,
  PointerSample,
  ToolInputResult,
  Vec2,
  ViewportSnapshot,
} from "@octopoly/contracts";

import type { OrbitCameraController } from "../../camera";
import type { ToolRuntime } from "../../tools/runtime";

interface TouchPoint extends Vec2 {}

const UNHANDLED: ToolInputResult = Object.freeze({ handled: false });
const CAPTURED: ToolInputResult = Object.freeze({ handled: true, capturePointer: true });
const HANDLED: ToolInputResult = Object.freeze({ handled: true });
const RELEASED: ToolInputResult = Object.freeze({ handled: true, releasePointer: true });

/** Keeps touch camera navigation disjoint from Pencil/mouse modeling input. */
export class WorkspaceInputController implements PointerInputSink {
  readonly #touches = new Map<number, TouchPoint>();

  constructor(
    private readonly tools: ToolRuntime,
    private readonly camera: OrbitCameraController,
    private readonly viewport: () => ViewportSnapshot,
    private readonly cameraChanged: () => void,
  ) {}

  dispatch(sample: PointerSample): ToolInputResult {
    if (sample.pointerType !== "touch") {
      return this.tools.dispatch(sample);
    }

    // A captured modeling gesture always wins; touch cannot steal Pencil capture.
    if (this.tools.capturedPointerId() !== null) {
      return UNHANDLED;
    }

    if (sample.phase === "down") {
      this.#touches.set(sample.pointerId, { x: sample.x, y: sample.y });
      return CAPTURED;
    }

    const previous = this.#touches.get(sample.pointerId);
    if (previous === undefined) {
      return UNHANDLED;
    }

    if (sample.phase === "cancel" || sample.phase === "up") {
      this.#touches.delete(sample.pointerId);
      return RELEASED;
    }

    if (sample.phase !== "move") {
      return HANDLED;
    }

    const next = { x: sample.x, y: sample.y };
    this.#touches.set(sample.pointerId, next);
    const viewport = this.viewport();
    const width = Math.max(1, viewport.cssWidth);
    const height = Math.max(1, viewport.cssHeight);

    if (this.#touches.size === 1) {
      this.camera.orbit(
        ((next.x - previous.x) / width) * Math.PI,
        ((next.y - previous.y) / height) * Math.PI,
      );
    } else {
      const partner = [...this.#touches.entries()].find(([id]) => id !== sample.pointerId)?.[1];
      if (partner !== undefined) {
        const previousDistance = Math.hypot(previous.x - partner.x, previous.y - partner.y);
        const nextDistance = Math.hypot(next.x - partner.x, next.y - partner.y);
        if (previousDistance > 0 && nextDistance > 0) {
          this.camera.zoom(previousDistance / nextDistance);
        }
        this.camera.pan(
          { x: (next.x - previous.x) / 2, y: (next.y - previous.y) / 2 },
          viewport,
        );
      }
    }

    this.cameraChanged();
    return HANDLED;
  }

  cancelNavigation(): void {
    this.#touches.clear();
  }
}
