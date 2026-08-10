import type {
  Disposable,
  NormalizedInputSurface,
  NormalizedInputSurfaceFactory,
  NormalizedInputSurfaceOptions,
  PointerInputSink,
  PointerSample,
  ToolInputResult,
  Unsubscribe,
  ViewportSnapshot,
} from "@octopoly/contracts";

import { normalizePointerEvent, pointerPhase } from "../pen";

function immutableViewport(element: HTMLElement): ViewportSnapshot {
  const bounds = element.getBoundingClientRect();
  const cssWidth = Number.isFinite(bounds.width) ? Math.max(0, bounds.width) : 0;
  const cssHeight = Number.isFinite(bounds.height) ? Math.max(0, bounds.height) : 0;
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return Object.freeze({
    cssWidth,
    cssHeight,
    devicePixelRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
  });
}

function sameViewport(first: ViewportSnapshot, second: ViewportSnapshot): boolean {
  return (
    first.cssWidth === second.cssWidth &&
    first.cssHeight === second.cssHeight &&
    first.devicePixelRatio === second.devicePixelRatio
  );
}

function eventKey(event: PointerEvent): string {
  return [
    event.pointerId,
    event.pointerType,
    event.isPrimary,
    event.timeStamp,
    event.clientX,
    event.clientY,
    event.pressure,
    event.tiltX,
    event.tiltY,
    event.buttons,
    event.altKey,
    event.ctrlKey,
    event.metaKey,
    event.shiftKey,
  ].join(":");
}

function cancelSample(sample: PointerSample, timestamp: number): PointerSample {
  return Object.freeze({
    ...sample,
    phase: "cancel" as const,
    buttons: 0,
    timestamp,
    coalesced: false,
  });
}

class ElementNormalizedInputSurface implements NormalizedInputSurface {
  private sink: PointerInputSink | null = null;
  private connection: Disposable | null = null;
  private disposed = false;
  private viewportValue: ViewportSnapshot;
  private readonly viewportListeners = new Set<(viewport: ViewportSnapshot) => void>();
  private readonly capturedPointers = new Set<number>();
  private readonly lastSamples = new Map<number, PointerSample>();
  private readonly previousTouchAction: string;
  private readonly resizeObserver: ResizeObserver | null;
  private lastTimestamp = 0;

  constructor(
    private readonly element: HTMLElement,
    options: NormalizedInputSurfaceOptions,
  ) {
    this.viewportValue = immutableViewport(element);
    this.previousTouchAction = element.style.touchAction;
    if (options.touchAction !== undefined) {
      element.style.touchAction = options.touchAction;
    }

    element.addEventListener("pointerdown", this.onPointer);
    element.addEventListener("pointermove", this.onPointer);
    element.addEventListener("pointerup", this.onPointer);
    element.addEventListener("pointercancel", this.onPointer);
    element.addEventListener("lostpointercapture", this.onLostPointerCapture);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("resize", this.onViewportChange);
    window.addEventListener("orientationchange", this.onViewportChange);

    if (typeof ResizeObserver === "undefined") {
      this.resizeObserver = null;
    } else {
      this.resizeObserver = new ResizeObserver(this.onViewportChange);
      this.resizeObserver.observe(element);
    }
  }

  viewport(): ViewportSnapshot {
    return this.viewportValue;
  }

  subscribeViewport(listener: (viewport: ViewportSnapshot) => void): Unsubscribe {
    this.assertActive();
    this.viewportListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.viewportListeners.delete(listener);
    };
  }

  connect(sink: PointerInputSink): Disposable {
    this.assertActive();
    if (this.sink !== null) {
      throw new Error("input surface already has a connected sink");
    }
    this.sink = sink;
    let connected = true;
    const connection = {
      dispose: (): void => {
        if (!connected) {
          return;
        }
        connected = false;
        if (this.connection !== connection) {
          return;
        }
        this.sink = null;
        this.connection = null;
        this.cancelCapturedPointers(sink);
      },
    };
    this.connection = connection;
    return connection;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    try {
      this.connection?.dispose();
    } finally {
      this.element.removeEventListener("pointerdown", this.onPointer);
      this.element.removeEventListener("pointermove", this.onPointer);
      this.element.removeEventListener("pointerup", this.onPointer);
      this.element.removeEventListener("pointercancel", this.onPointer);
      this.element.removeEventListener("lostpointercapture", this.onLostPointerCapture);
      window.removeEventListener("blur", this.onWindowBlur);
      window.removeEventListener("resize", this.onViewportChange);
      window.removeEventListener("orientationchange", this.onViewportChange);
      this.resizeObserver?.disconnect();
      this.viewportListeners.clear();
      this.element.style.touchAction = this.previousTouchAction;
    }
  }

  private readonly onPointer = (event: PointerEvent): void => {
    const sink = this.sink;
    if (this.disposed || sink === null) {
      return;
    }
    const phase = pointerPhase(event);
    const bounds = this.element.getBoundingClientRect();
    const rawTimestamp = Math.max(this.lastTimestamp, event.timeStamp);
    const events: PointerEvent[] = [];

    if (event.type === "pointermove" && typeof event.getCoalescedEvents === "function") {
      const originalKey = eventKey(event);
      const seen = new Set<string>();
      for (const coalescedEvent of event.getCoalescedEvents()) {
        const key = eventKey(coalescedEvent);
        if (key === originalKey || seen.has(key)) {
          continue;
        }
        seen.add(key);
        events.push(coalescedEvent);
      }
      events.sort((first, second) => first.timeStamp - second.timeStamp);
    }

    for (const coalescedEvent of events) {
      if (this.sink !== sink) {
        return;
      }
      const timestamp = Math.max(
        this.lastTimestamp,
        Math.min(coalescedEvent.timeStamp, rawTimestamp),
      );
      const sample = normalizePointerEvent(
        coalescedEvent,
        phase,
        bounds.left,
        bounds.top,
        true,
        timestamp,
      );
      this.dispatch(sample, sink, event);
    }

    if (this.sink !== sink) {
      return;
    }
    const sample = normalizePointerEvent(
      event,
      phase,
      bounds.left,
      bounds.top,
      false,
      Math.max(this.lastTimestamp, rawTimestamp),
    );
    try {
      this.dispatch(sample, sink, event);
    } finally {
      if (phase === "up" || phase === "cancel") {
        try {
          this.releasePointer(event.pointerId);
        } finally {
          this.lastSamples.delete(event.pointerId);
        }
      }
    }
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    const sink = this.sink;
    if (this.disposed || sink === null || !this.capturedPointers.delete(event.pointerId)) {
      return;
    }
    const last = this.lastSamples.get(event.pointerId);
    this.lastSamples.delete(event.pointerId);
    if (last === undefined) {
      return;
    }
    const timestamp = Math.max(this.lastTimestamp, event.timeStamp);
    this.lastTimestamp = timestamp;
    sink.dispatch(cancelSample(last, timestamp));
  };

  private readonly onWindowBlur = (): void => {
    const sink = this.sink;
    if (this.disposed || sink === null) {
      return;
    }
    this.cancelCapturedPointers(sink);
  };

  private readonly onViewportChange = (): void => {
    if (this.disposed) {
      return;
    }
    const next = immutableViewport(this.element);
    if (sameViewport(this.viewportValue, next)) {
      return;
    }
    this.viewportValue = next;
    for (const listener of [...this.viewportListeners]) {
      listener(next);
    }
  };

  private dispatch(sample: PointerSample, sink: PointerInputSink, source: PointerEvent): void {
    this.lastTimestamp = sample.timestamp;
    this.lastSamples.set(sample.pointerId, sample);
    let result: ToolInputResult;
    try {
      result = sink.dispatch(sample);
    } catch (error: unknown) {
      try {
        this.cancelCapturedPointers(sink);
      } catch {
        // Preserve the original callback failure after best-effort capture cleanup.
      } finally {
        this.lastSamples.delete(sample.pointerId);
      }
      throw error;
    }
    if (result.handled) {
      source.preventDefault();
    }
    try {
      this.applyCaptureResult(sample.pointerId, result);
    } catch (error: unknown) {
      try {
        sink.dispatch(cancelSample(sample, sample.timestamp));
      } catch {
        // Preserve the capture API failure after best-effort sink rollback.
      } finally {
        this.capturedPointers.delete(sample.pointerId);
        this.lastSamples.delete(sample.pointerId);
      }
      throw error;
    }
  }

  private applyCaptureResult(pointerId: number, result: ToolInputResult): void {
    if (result.capturePointer === true && !this.capturedPointers.has(pointerId)) {
      this.element.setPointerCapture(pointerId);
      this.capturedPointers.add(pointerId);
    }
    if (result.releasePointer === true) {
      this.releasePointer(pointerId);
    }
  }

  private releasePointer(pointerId: number): void {
    if (!this.capturedPointers.delete(pointerId)) {
      return;
    }
    if (
      typeof this.element.hasPointerCapture !== "function" ||
      this.element.hasPointerCapture(pointerId)
    ) {
      this.element.releasePointerCapture(pointerId);
    }
  }

  private cancelCapturedPointers(sink: PointerInputSink): void {
    let firstFailure: unknown;
    for (const pointerId of [...this.capturedPointers]) {
      const last = this.lastSamples.get(pointerId);
      const timestamp = Math.max(this.lastTimestamp, typeof performance === "undefined" ? 0 : performance.now());
      try {
        if (last !== undefined) {
          this.lastTimestamp = timestamp;
          sink.dispatch(cancelSample(last, timestamp));
        }
      } catch (error) {
        firstFailure ??= error;
      } finally {
        try {
          this.releasePointer(pointerId);
        } catch (error) {
          firstFailure ??= error;
        }
        this.lastSamples.delete(pointerId);
      }
    }
    if (firstFailure !== undefined) {
      throw firstFailure;
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("input surface is disposed");
    }
  }
}

export function createNormalizedInputSurfaceFactory(): NormalizedInputSurfaceFactory {
  return Object.freeze({
    create(
      element: HTMLElement,
      options: NormalizedInputSurfaceOptions = {},
    ): NormalizedInputSurface {
      return new ElementNormalizedInputSurface(element, options);
    },
  });
}
