import type { PointerInputSink, PointerSample, ToolInputResult } from "@octopoly/contracts";

import { PointerCaptureState } from "./pointer-capture-state";

export type PointerRouterDelegate = (sample: PointerSample) => ToolInputResult;

const UNHANDLED_RESULT: ToolInputResult = Object.freeze({ handled: false });

function createResult(handled: boolean, capturePointer: boolean, releasePointer: boolean): ToolInputResult {
  if (capturePointer && releasePointer) {
    return Object.freeze({ handled, capturePointer: true, releasePointer: true });
  }
  if (capturePointer) {
    return Object.freeze({ handled, capturePointer: true });
  }
  if (releasePointer) {
    return Object.freeze({ handled, releasePointer: true });
  }
  return Object.freeze({ handled });
}

/**
 * Routes already-normalized samples to a tool callback and coordinates logical
 * pointer capture. Samples are delegated synchronously and unchanged.
 */
export class PointerRouter implements PointerInputSink {
  readonly captureState: PointerCaptureState;

  private readonly delegate: PointerRouterDelegate;

  constructor(delegate: PointerRouterDelegate, captureState: PointerCaptureState = new PointerCaptureState()) {
    this.delegate = delegate;
    this.captureState = captureState;
  }

  dispatch(sample: PointerSample): ToolInputResult {
    const capturedPointerId = this.captureState.capturedPointerId();
    if (capturedPointerId !== null && capturedPointerId !== sample.pointerId) {
      return UNHANDLED_RESULT;
    }

    let delegatedResult: ToolInputResult;
    try {
      delegatedResult = this.delegate(sample);
    } catch (error: unknown) {
      this.captureState.reset();
      throw error;
    }

    const capturePointer = delegatedResult.capturePointer === true && this.captureState.capture(sample.pointerId);
    const terminalPhase = sample.phase === "up" || sample.phase === "cancel";
    const shouldRelease = delegatedResult.releasePointer === true || terminalPhase;
    const releasePointer = shouldRelease && this.captureState.release(sample.pointerId);

    return createResult(delegatedResult.handled, capturePointer, releasePointer);
  }

  capturedPointerId(): number | null {
    return this.captureState.capturedPointerId();
  }

  /**
   * Releases a particular logical owner. This supports normalized lost-capture
   * handling without accepting or synthesizing a raw DOM event.
   */
  releasePointer(pointerId: number): boolean {
    return this.captureState.release(pointerId);
  }

  /** Clears logical capture for a programmatic tool switch or runtime teardown. */
  resetCapture(): number | null {
    return this.captureState.reset();
  }
}
