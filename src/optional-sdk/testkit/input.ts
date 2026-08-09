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

import { CONTRACT_TEST_VIEWPORT } from "./modeling";

export class ContractTestInputSurface implements NormalizedInputSurface {
  readonly element: HTMLElement;
  readonly options: NormalizedInputSurfaceOptions;
  readonly #viewportListeners = new Set<(viewport: ViewportSnapshot) => void>();
  #viewport: ViewportSnapshot;
  #sink: PointerInputSink | null = null;
  #captured: PointerSample | null = null;
  #disposed = false;

  constructor(
    element: HTMLElement,
    options: NormalizedInputSurfaceOptions = {},
    viewport: ViewportSnapshot = CONTRACT_TEST_VIEWPORT,
  ) {
    this.element = element;
    this.options = Object.freeze({ ...options });
    this.#viewport = Object.freeze({ ...viewport });
  }

  viewport(): ViewportSnapshot {
    this.#assertUsable();
    return this.#viewport;
  }

  subscribeViewport(listener: (viewport: ViewportSnapshot) => void): Unsubscribe {
    this.#assertUsable();
    this.#viewportListeners.add(listener);
    return () => { this.#viewportListeners.delete(listener); };
  }

  connect(sink: PointerInputSink): Disposable {
    this.#assertUsable();
    if (this.#sink !== null) {
      throw new Error("Contract test input surface already has a connected sink");
    }
    this.#sink = sink;
    let connected = true;
    return {
      dispose: () => {
        if (!connected) return;
        connected = false;
        if (this.#sink === sink) {
          this.#cancelCapture(sink);
          this.#sink = null;
        }
      },
    };
  }

  dispatch(sample: PointerSample): ToolInputResult {
    this.#assertUsable();
    const sink = this.#sink;
    if (sink === null) {
      throw new Error("Contract test input surface has no connected sink");
    }
    const immutable = Object.freeze({
      ...sample,
      modifiers: Object.freeze({ ...sample.modifiers }),
    });
    const result = sink.dispatch(immutable);
    if (result.capturePointer === true) {
      this.#captured = immutable;
    }
    if (result.releasePointer === true || sample.phase === "up" || sample.phase === "cancel") {
      this.#captured = null;
    }
    return result;
  }

  setViewport(viewport: ViewportSnapshot): void {
    this.#assertUsable();
    this.#viewport = Object.freeze({ ...viewport });
    for (const listener of [...this.#viewportListeners]) {
      listener(this.#viewport);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const sink = this.#sink;
    this.#sink = null;
    if (sink !== null) {
      this.#cancelCapture(sink);
    }
    this.#viewportListeners.clear();
  }

  #cancelCapture(sink: PointerInputSink): void {
    if (this.#captured === null) return;
    const captured = this.#captured;
    this.#captured = null;
    sink.dispatch(Object.freeze({
      ...captured,
      phase: "cancel",
      pressure: 0,
      buttons: 0,
      coalesced: false,
    }));
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Contract test input surface is disposed");
  }
}

export class ContractTestInputSurfaceFactory implements NormalizedInputSurfaceFactory, Disposable {
  readonly #surfaces: ContractTestInputSurface[] = [];
  readonly #defaultViewport: ViewportSnapshot;
  #disposed = false;

  constructor(defaultViewport: ViewportSnapshot = CONTRACT_TEST_VIEWPORT) {
    this.#defaultViewport = Object.freeze({ ...defaultViewport });
  }

  create(element: HTMLElement, options?: NormalizedInputSurfaceOptions): ContractTestInputSurface {
    if (this.#disposed) throw new Error("Contract test input surface factory is disposed");
    const surface = new ContractTestInputSurface(element, options, this.#defaultViewport);
    this.#surfaces.push(surface);
    return surface;
  }

  surfaces(): ReadonlyArray<ContractTestInputSurface> {
    return Object.freeze([...this.#surfaces]);
  }

  latest(): ContractTestInputSurface | null {
    return this.#surfaces.at(-1) ?? null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const surface of [...this.#surfaces].reverse()) {
      surface.dispose();
    }
    this.#surfaces.splice(0, this.#surfaces.length);
  }
}
