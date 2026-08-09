import type {
  PointerSample,
  Tool,
  ToolContext,
  ToolInputResult,
  ToolPreview,
} from "@octopoly/contracts";

import { TransactionCoordinator } from "./transaction-coordinator";

export type ToolSessionState = "idle" | "hover" | "armed" | "dragging" | "commit" | "cancel";

const UNHANDLED: ToolInputResult = Object.freeze({ handled: false });

/**
 * Owns the callback state for one active tool. Pointer ownership itself remains
 * in the router; this class only tracks the pointer associated with its gesture.
 */
export class ToolSession {
  private currentState: ToolSessionState = "idle";
  private gesturePointerId: number | null = null;
  private disposed = false;

  constructor(
    readonly tool: Tool,
    context: ToolContext,
    private readonly coordinator = new TransactionCoordinator(context),
  ) {}

  context(): ToolContext {
    return this.coordinator.context();
  }

  state(): ToolSessionState {
    return this.currentState;
  }

  activePointerId(): number | null {
    return this.gesturePointerId;
  }

  preview(): ToolPreview | null {
    return this.coordinator.preview();
  }

  previewRevision(): number | null {
    return this.coordinator.previewRevision();
  }

  dispatch(sample: PointerSample): ToolInputResult {
    this.assertUsable();

    if (this.gesturePointerId !== null && sample.pointerId !== this.gesturePointerId) {
      return UNHANDLED;
    }

    switch (sample.phase) {
      case "hover":
        return this.dispatchHover(sample);
      case "down":
        return this.dispatchDown(sample);
      case "move":
        return this.dispatchMove(sample);
      case "up":
        return this.dispatchUp(sample);
      case "cancel":
        return this.cancel(sample);
    }
  }

  cancel(sample?: PointerSample): ToolInputResult {
    if (this.disposed) {
      return UNHANDLED;
    }
    if (sample !== undefined && sample.phase !== "cancel") {
      throw new Error("ToolSession.cancel only accepts a normalized cancel sample");
    }
    if (
      sample !== undefined &&
      this.gesturePointerId !== null &&
      sample.pointerId !== this.gesturePointerId
    ) {
      return UNHANDLED;
    }

    const hasWork =
      this.gesturePointerId !== null ||
      this.coordinator.isGestureActive() ||
      this.coordinator.preview() !== null;
    if (!hasWork && this.currentState === "cancel") {
      return UNHANDLED;
    }
    if (!hasWork && sample === undefined) {
      return UNHANDLED;
    }

    this.currentState = "cancel";
    let result = UNHANDLED;
    let callbackError: unknown;

    if (sample !== undefined) {
      try {
        result = this.invokePointer(sample);
      } catch (error) {
        callbackError = error;
      }
    }

    const cleanupError = this.performCancelCleanup();
    if (callbackError !== undefined) {
      throw callbackError;
    }
    if (cleanupError !== undefined) {
      throw cleanupError;
    }

    return result;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    try {
      this.cancel();
    } finally {
      this.disposed = true;
    }
  }

  private dispatchHover(sample: PointerSample): ToolInputResult {
    if (this.gesturePointerId !== null) {
      return UNHANDLED;
    }

    this.currentState = "hover";
    try {
      const result = this.invokePointer(sample);
      return { handled: result.handled };
    } catch (error) {
      this.cleanupAfterCallbackError(error);
    }
  }

  private dispatchDown(sample: PointerSample): ToolInputResult {
    if (this.gesturePointerId !== null) {
      return UNHANDLED;
    }

    this.gesturePointerId = sample.pointerId;
    this.currentState = "armed";
    try {
      this.coordinator.beginGesture();
      const result = this.invokePointer(sample);

      if (!result.handled && result.capturePointer !== true) {
        this.coordinator.rollbackGesture();
        this.gesturePointerId = null;
        this.currentState = "idle";
        return result;
      }

      if (result.releasePointer === true) {
        this.finishSuccessfulGesture();
      }
      return result;
    } catch (error) {
      this.cleanupAfterCallbackError(error);
    }
  }

  private dispatchMove(sample: PointerSample): ToolInputResult {
    if (this.gesturePointerId === null) {
      return UNHANDLED;
    }

    this.currentState = "dragging";
    try {
      const result = this.invokePointer(sample);
      if (result.releasePointer === true) {
        this.finishSuccessfulGesture();
      }
      return result;
    } catch (error) {
      this.cleanupAfterCallbackError(error);
    }
  }

  private dispatchUp(sample: PointerSample): ToolInputResult {
    if (this.gesturePointerId === null) {
      return UNHANDLED;
    }

    try {
      const result = this.invokePointer(sample);
      this.finishSuccessfulGesture();
      return result;
    } catch (error) {
      this.cleanupAfterCallbackError(error);
    }
  }

  private finishSuccessfulGesture(): void {
    this.currentState = "commit";
    this.coordinator.clearPreview();
    this.coordinator.commitGesture();
    this.gesturePointerId = null;
  }

  private invokePointer(sample: PointerSample): ToolInputResult {
    return this.tool.pointer?.(sample, this.coordinator.context()) ?? UNHANDLED;
  }

  private performCancelCleanup(): unknown {
    const errors: unknown[] = [];

    try {
      this.tool.cancel?.(this.coordinator.context());
    } catch (error) {
      errors.push(error);
    }

    try {
      this.coordinator.clearPreview();
    } catch (error) {
      errors.push(error);
    }

    try {
      this.coordinator.rollbackGesture();
    } catch (error) {
      errors.push(error);
    } finally {
      this.gesturePointerId = null;
      this.currentState = "cancel";
    }

    return errors[0];
  }

  private cleanupAfterCallbackError(error: unknown): never {
    this.currentState = "cancel";
    this.performCancelCleanup();
    throw error;
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("ToolSession is disposed");
    }
  }
}
