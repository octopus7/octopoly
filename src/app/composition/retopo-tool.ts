import type {
  HistoryTransaction,
  MeshMutationResult,
  PickingService,
  PointerSample,
  RetopoEngine,
  RetopoStep,
  RetopoStrokeSession,
  Tool,
  ToolContext,
  ToolInputResult,
} from "@octopoly/contracts";

export const RETOPO_ADAPTER_STEP_BUDGET = 4_096;

const UNHANDLED: ToolInputResult = Object.freeze({ handled: false });
const HANDLED: ToolInputResult = Object.freeze({ handled: true });
const CAPTURED: ToolInputResult = Object.freeze({ handled: true, capturePointer: true });
const RELEASED: ToolInputResult = Object.freeze({ handled: true, releasePointer: true });

/**
 * Adapts the staged RetopoEngine boundary to the canonical Tool runtime.
 *
 * The engine remains side-effect free: this adapter owns mutation execution,
 * stable-ID feedback, one-gesture history grouping, preview publication, and
 * every rollback path.
 */
export class RetopoStrokeTool implements Tool {
  readonly id = "retopo.stroke";

  #engine: RetopoEngine;
  #session: RetopoStrokeSession | null = null;
  #transaction: HistoryTransaction | null = null;
  #pointerId: number | null = null;
  #appliedSteps = 0;
  #pendingFirstChain = false;

  constructor(
    private readonly createEngine: () => RetopoEngine,
    private readonly picking: PickingService,
    private readonly maximumSteps = RETOPO_ADAPTER_STEP_BUDGET,
  ) {
    this.#engine = createEngine();
    if (
      !Number.isSafeInteger(maximumSteps) ||
      maximumSteps <= 0 ||
      maximumSteps > RETOPO_ADAPTER_STEP_BUDGET
    ) {
      throw new RangeError(
        `maximumSteps must be a positive safe integer no greater than ${RETOPO_ADAPTER_STEP_BUDGET}`,
      );
    }
  }

  pointer(sample: PointerSample, context: ToolContext): ToolInputResult {
    if (sample.phase === "cancel") {
      if (this.#pointerId !== sample.pointerId) {
        return UNHANDLED;
      }
      this.#cancelGesture(context, true);
      return RELEASED;
    }

    if (sample.phase === "down") {
      if (
        sample.pointerType !== "pen" ||
        !sample.isPrimary ||
        this.#session !== null
      ) {
        return UNHANDLED;
      }
      this.#session = this.#engine.begin();
      this.#transaction = context.history.begin("Retopo stroke");
      this.#pointerId = sample.pointerId;
      this.#appliedSteps = 0;
      try {
        this.#process(sample, context);
      } catch (error) {
        this.#cancelGesture(context, true);
        throw error;
      }
      return this.#session === null ? RELEASED : CAPTURED;
    }

    if (this.#pointerId !== sample.pointerId || this.#session === null) {
      return UNHANDLED;
    }

    if (sample.phase === "hover") {
      return UNHANDLED;
    }

    try {
      this.#process(sample, context);
    } catch (error) {
      this.#cancelGesture(context, true);
      throw error;
    }
    return sample.phase === "up" || this.#session === null ? RELEASED : HANDLED;
  }

  cancel(context: ToolContext): void {
    this.#cancelGesture(context, true);
  }

  deactivate(context: ToolContext): void {
    this.#cancelGesture(context, true);
    this.resetDocumentState();
  }

  /** Clears a completed first chain when a project document is replaced. */
  resetDocumentState(): void {
    if (this.#session !== null) {
      throw new Error("cannot reset retopo document state during an active gesture");
    }
    this.#clearPendingFirstChain();
  }

  #process(sample: PointerSample, context: ToolContext): void {
    const session = this.#session;
    if (session === null) {
      return;
    }
    const ray = this.picking.rayFromScreen(
      { x: sample.x, y: sample.y },
      context.getCamera(),
      context.getViewport(),
    );
    const surfaceHit = context.surface.raycast(ray);
    let step = session.update({ sample, ray, surfaceHit }, context.mesh);
    this.#consume(step, context);
  }

  #consume(initial: RetopoStep, context: ToolContext): void {
    let step = initial;
    while (true) {
      switch (step.kind) {
        case "none":
          if (step.preview !== undefined) {
            context.setPreview(step.preview);
            context.requestRender();
          }
          return;
        case "preview":
          context.setPreview(step.preview);
          context.requestRender();
          return;
        case "commit": {
          if (this.#appliedSteps >= this.maximumSteps) {
            this.#cancelGesture(context, true);
            return;
          }
          if (step.preview !== undefined) {
            context.setPreview(step.preview);
          }
          const session = this.#session;
          const transaction = this.#transaction;
          if (session === null || transaction === null) {
            throw new Error("retopo commit has no active session transaction");
          }
          const result: MeshMutationResult = context.mutations.execute(step.label, step.command);
          transaction.recordApplied(result.patch);
          this.#appliedSteps += 1;
          context.selection.prune(context.mesh);
          context.requestRender();
          step = session.continue(result, context.mesh);
          break;
        }
        case "complete":
          this.#pendingFirstChain = this.#appliedSteps === 0;
          this.#finishGesture(context, true);
          return;
        case "rejected":
          this.#finishGesture(context, false);
          this.#clearPendingFirstChain();
          return;
      }
    }
  }

  #finishGesture(context: ToolContext, commit: boolean): void {
    const session = this.#session;
    const transaction = this.#transaction;
    this.#session = null;
    this.#transaction = null;
    this.#pointerId = null;
    this.#appliedSteps = 0;

    try {
      if (transaction !== null) {
        if (commit) {
          transaction.commit();
        } else {
          transaction.rollback();
        }
      }
    } finally {
      session?.dispose();
      context.setPreview(null);
      context.requestRender();
    }
  }

  #cancelGesture(context: ToolContext, clearPendingChain: boolean): void {
    const session = this.#session;
    const transaction = this.#transaction;
    this.#session = null;
    this.#transaction = null;
    this.#pointerId = null;
    this.#appliedSteps = 0;

    try {
      session?.cancel();
    } finally {
      try {
        transaction?.rollback();
      } finally {
        session?.dispose();
        context.setPreview(null);
        context.requestRender();
      }
    }

    if (clearPendingChain) {
      this.#clearPendingFirstChain();
    }
  }

  #clearPendingFirstChain(): void {
    if (!this.#pendingFirstChain) {
      return;
    }
    // RetopoEngine intentionally exposes no mutation/reset API. Replacing the
    // document therefore replaces the engine instance instead of trying to
    // reach into its retained first-chain state.
    this.#engine = this.createEngine();
    this.#pendingFirstChain = false;
  }
}
