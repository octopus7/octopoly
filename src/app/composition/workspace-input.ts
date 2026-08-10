import type {
  Disposable,
  PointerInputSink,
  PointerSample,
  ToolInputResult,
  Vec2,
  ViewportSnapshot,
} from "@octopoly/contracts";

import type { OrbitCameraController } from "../../camera";
import { createWheelZoomAdapter } from "../../input/mouse";
import type { ToolRuntime } from "../../tools/runtime";

interface TouchPoint extends Vec2 {}

type MouseNavigationMode = "orbit" | "pan";

interface MouseNavigationOwner {
  readonly pointerId: number;
  readonly mode: MouseNavigationMode;
  previous: Vec2;
}

const MOUSE_PRIMARY_BUTTON = 1;
const MOUSE_MIDDLE_BUTTON = 4;

const UNHANDLED: ToolInputResult = Object.freeze({ handled: false });
const CAPTURED: ToolInputResult = Object.freeze({ handled: true, capturePointer: true });
const HANDLED: ToolInputResult = Object.freeze({ handled: true });
const RELEASED: ToolInputResult = Object.freeze({ handled: true, releasePointer: true });

function isTerminal(sample: PointerSample): boolean {
  return sample.phase === "up" || sample.phase === "cancel";
}

/**
 * Owns workspace-level pointer arbitration. Camera navigation and Tool Runtime
 * logical capture are mutually exclusive, while suppressed touches retain only
 * enough state to return their eventual DOM release intent.
 */
export class WorkspaceInputController implements PointerInputSink {
  readonly #touches = new Map<number, TouchPoint>();
  readonly #suppressedTouches = new Set<number>();
  #mouseNavigation: MouseNavigationOwner | null = null;
  #disposed = false;

  constructor(
    private readonly tools: ToolRuntime,
    private readonly camera: OrbitCameraController,
    private readonly viewport: () => ViewportSnapshot,
    private readonly cameraChanged: () => void,
  ) {}

  dispatch(sample: PointerSample): ToolInputResult {
    if (this.#disposed) {
      return UNHANDLED;
    }

    // Terminal cleanup must precede arbitration so a later tool capture cannot
    // strand a touch or mouse-navigation pointer in workspace state.
    const terminalResult = this.#cleanupTerminalNavigationSample(sample);
    if (terminalResult !== null) {
      return terminalResult;
    }

    const toolOwner = this.tools.capturedPointerId();
    if (toolOwner !== null) {
      if (sample.pointerType === "touch") {
        if (this.#touches.has(sample.pointerId)) {
          this.#suppressTouches();
          return HANDLED;
        }
        if (this.#suppressedTouches.has(sample.pointerId)) {
          return HANDLED;
        }
      }
      return sample.pointerId === toolOwner ? this.tools.dispatch(sample) : UNHANDLED;
    }

    if (this.#mouseNavigation !== null) {
      return this.#dispatchDuringMouseNavigation(sample);
    }

    if (sample.pointerType === "touch") {
      return this.#dispatchTouch(sample);
    }

    if (this.#touches.size > 0) {
      return this.#dispatchPotentialToolPreemption(sample);
    }

    if (sample.pointerType === "mouse") {
      return this.#dispatchIdleMouse(sample);
    }

    return this.tools.dispatch(sample);
  }

  /** True when mouse/touch navigation currently owns workspace input. */
  hasNavigationOwner(): boolean {
    return this.#mouseNavigation !== null || this.#touches.size > 0 || this.#suppressedTouches.size > 0;
  }

  /** Local gate consumed by the wheel adapter without changing PointerSample. */
  canHandleWheel(): boolean {
    return !this.#disposed && !this.hasNavigationOwner() && this.tools.capturedPointerId() === null;
  }

  /**
   * Clears state for blur, document replacement, disconnected input, or another
   * lifecycle boundary that already owns physical DOM capture cleanup.
   */
  cancelNavigation(): void {
    this.#mouseNavigation = null;
    this.#touches.clear();
    this.#suppressedTouches.clear();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.cancelNavigation();
  }

  #cleanupTerminalNavigationSample(sample: PointerSample): ToolInputResult | null {
    if (!isTerminal(sample)) {
      return null;
    }

    if (sample.pointerType === "touch") {
      if (this.#touches.delete(sample.pointerId)) {
        return RELEASED;
      }
      if (this.#suppressedTouches.delete(sample.pointerId)) {
        return RELEASED;
      }
    }

    if (this.#mouseNavigation?.pointerId === sample.pointerId) {
      this.#mouseNavigation = null;
      return RELEASED;
    }

    return null;
  }

  #dispatchDuringMouseNavigation(sample: PointerSample): ToolInputResult {
    const owner = this.#mouseNavigation;
    if (owner === null || sample.pointerId !== owner.pointerId || sample.pointerType !== "mouse") {
      return UNHANDLED;
    }

    if (
      (sample.phase === "move" || sample.phase === "hover") &&
      (sample.buttons & MOUSE_MIDDLE_BUTTON) === 0
    ) {
      this.#mouseNavigation = null;
      return RELEASED;
    }

    if (sample.phase !== "move") {
      return HANDLED;
    }

    const next = { x: sample.x, y: sample.y };
    const delta = { x: next.x - owner.previous.x, y: next.y - owner.previous.y };
    owner.previous = next;

    try {
      if (owner.mode === "pan") {
        this.camera.pan(delta, this.viewport());
      } else {
        const viewport = this.viewport();
        this.camera.orbit(
          (delta.x / Math.max(1, viewport.cssWidth)) * Math.PI,
          (delta.y / Math.max(1, viewport.cssHeight)) * Math.PI,
        );
      }
      this.cameraChanged();
    } catch (error: unknown) {
      this.#mouseNavigation = null;
      throw error;
    }
    return HANDLED;
  }

  #dispatchIdleMouse(sample: PointerSample): ToolInputResult {
    if (sample.phase === "hover") {
      return this.tools.dispatch(sample);
    }

    if (sample.phase !== "down") {
      return UNHANDLED;
    }

    if (sample.buttons === MOUSE_MIDDLE_BUTTON) {
      this.#mouseNavigation = {
        pointerId: sample.pointerId,
        mode: sample.modifiers.shift ? "pan" : "orbit",
        previous: { x: sample.x, y: sample.y },
      };
      return CAPTURED;
    }

    if (sample.buttons !== MOUSE_PRIMARY_BUTTON) {
      return UNHANDLED;
    }

    return this.tools.dispatch(sample);
  }

  #dispatchPotentialToolPreemption(sample: PointerSample): ToolInputResult {
    if (sample.pointerType === "mouse") {
      if (sample.phase === "hover") {
        return this.tools.dispatch(sample);
      }
      if (sample.phase !== "down" || sample.buttons !== MOUSE_PRIMARY_BUTTON) {
        return UNHANDLED;
      }
    }

    const result = this.tools.dispatch(sample);
    if (this.tools.capturedPointerId() === sample.pointerId) {
      this.#suppressTouches();
    }
    return result;
  }

  #dispatchTouch(sample: PointerSample): ToolInputResult {
    if (this.#suppressedTouches.has(sample.pointerId)) {
      return HANDLED;
    }

    if (sample.phase === "down") {
      this.#touches.set(sample.pointerId, { x: sample.x, y: sample.y });
      return CAPTURED;
    }

    const previous = this.#touches.get(sample.pointerId);
    if (previous === undefined) {
      return UNHANDLED;
    }

    if (sample.phase !== "move") {
      return HANDLED;
    }

    const next = { x: sample.x, y: sample.y };
    this.#touches.set(sample.pointerId, next);
    const viewport = this.viewport();
    const width = Math.max(1, viewport.cssWidth);
    const height = Math.max(1, viewport.cssHeight);

    try {
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
    } catch (error: unknown) {
      this.cancelNavigation();
      throw error;
    }
    return HANDLED;
  }

  #suppressTouches(): void {
    for (const pointerId of this.#touches.keys()) {
      this.#suppressedTouches.add(pointerId);
    }
    this.#touches.clear();
  }
}

/** Branch-local composition seam; CoreWorkspace wiring remains owned by workstream 19. */
export function connectDesktopWheelCamera(
  element: HTMLElement,
  input: WorkspaceInputController,
  camera: OrbitCameraController,
  requestRender: () => void,
): Disposable {
  return createWheelZoomAdapter(element, {
    canZoom: () => input.canHandleWheel(),
    zoom: (scale) => camera.zoom(scale),
    requestRender,
  });
}
