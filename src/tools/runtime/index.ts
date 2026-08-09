import type {
  Disposable,
  PointerInputSink,
  PointerSample,
  Tool,
  ToolContext,
  ToolInputResult,
  ToolRegistry,
} from "@octopoly/contracts";

import { PointerCaptureState } from "./pointer-capture-state";
import { PointerRouter } from "./pointer-router";
import { ToolRegistryImpl } from "./tool-registry";
import { ToolSession } from "./tool-session";
import { TransactionCoordinator } from "./transaction-coordinator";

const UNHANDLED: ToolInputResult = Object.freeze({ handled: false });

/**
 * Composes the canonical tool registry and normalized pointer sink without
 * taking ownership of DOM input, concrete tools, or concrete domain services.
 */
export class ToolRuntime implements PointerInputSink, Disposable {
  readonly tools: ToolRegistry;

  private readonly coordinator: TransactionCoordinator;
  private readonly registry: ToolRegistryImpl;
  private readonly router: PointerRouter;
  private session: ToolSession | null = null;
  private disposed = false;

  constructor(private readonly sourceContext: ToolContext) {
    this.coordinator = new TransactionCoordinator(sourceContext);
    this.router = new PointerRouter((sample) => this.dispatchToActiveTool(sample));
    this.registry = new ToolRegistryImpl(this.coordinator.context(), (current) => {
      this.endActiveGesture(current);
    });
    this.tools = this.registry;
  }

  dispatch(sample: PointerSample): ToolInputResult {
    this.assertUsable();
    return this.router.dispatch(sample);
  }

  /**
   * Ends the current gesture through the same path used by tool transitions.
   * A normalized cancel sample is delivered before Tool.cancel when supplied.
   */
  cancel(sample?: PointerSample): ToolInputResult {
    this.assertUsable();
    if (sample !== undefined) {
      if (sample.phase !== "cancel") {
        throw new Error("ToolRuntime.cancel only accepts a normalized cancel sample");
      }
      return this.router.dispatch(sample);
    }

    const capturedPointerId = this.router.capturedPointerId();
    const active = this.registry.active();
    this.endActiveGesture(active);
    return capturedPointerId === null
      ? UNHANDLED
      : Object.freeze({ handled: false, releasePointer: true });
  }

  capturedPointerId(): number | null {
    return this.router.capturedPointerId();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    try {
      this.registry.dispose();
    } finally {
      this.session = null;
      this.router.resetCapture();
    }
  }

  private dispatchToActiveTool(sample: PointerSample): ToolInputResult {
    const tool = this.registry.active();
    if (tool === null) {
      return UNHANDLED;
    }

    return this.sessionFor(tool).dispatch(sample);
  }

  private sessionFor(tool: Tool): ToolSession {
    if (this.session?.tool === tool) {
      return this.session;
    }

    this.session?.cancel();
    this.session = new ToolSession(tool, this.sourceContext, this.coordinator);
    return this.session;
  }

  private endActiveGesture(current: Tool | null): void {
    try {
      if (current !== null) {
        this.sessionFor(current).cancel();
      } else {
        this.coordinator.rollbackGesture();
        if (this.coordinator.preview() !== null) {
          this.coordinator.clearPreview();
        }
      }
    } finally {
      this.session = null;
      this.router.resetCapture();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("Tool runtime is disposed");
    }
  }
}

export function createToolRuntime(context: ToolContext): ToolRuntime {
  return new ToolRuntime(context);
}

export { PointerCaptureState } from "./pointer-capture-state";
export { PointerRouter, type PointerRouterDelegate } from "./pointer-router";
export { ToolLifecycle, type BeforeToolTransition } from "./tool-lifecycle";
export { ToolRegistryImpl, createToolRegistry } from "./tool-registry";
export { ToolSession, type ToolSessionState } from "./tool-session";
export { TransactionCoordinator } from "./transaction-coordinator";
