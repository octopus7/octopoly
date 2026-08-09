import type { Disposable, ProjectDocument } from "@octopoly/contracts";

export type ProjectSaveOperation = (document: ProjectDocument, signal: AbortSignal) => Promise<void>;

/** Debounced, serial autosave where a newer schedule always wins over an older pending write. */
export class ProjectAutosave implements Disposable {
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending: ProjectDocument | undefined;
  #running: Promise<void> | undefined;
  #controller: AbortController | undefined;
  #disposed = false;
  #lastError: unknown;

  constructor(
    private readonly save: ProjectSaveOperation,
    private readonly delayMilliseconds = 750,
    private readonly onError?: (error: unknown) => void,
  ) {
    if (!Number.isFinite(delayMilliseconds) || delayMilliseconds < 0) throw new RangeError("delayMilliseconds must be non-negative");
  }

  schedule(document: ProjectDocument): void {
    this.#assertUsable();
    this.#pending = document;
    this.#lastError = undefined;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#drain().catch((error: unknown) => {
        if (!this.#disposed && !(error instanceof DOMException && error.name === "AbortError")) {
          this.#lastError = error;
          this.onError?.(error);
        }
      });
    }, this.delayMilliseconds);
  }

  async flush(): Promise<void> {
    this.#assertUsable();
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    await this.#drain();
    if (this.#lastError !== undefined) throw this.#lastError;
  }

  cancel(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending = undefined;
    this.#controller?.abort();
    this.#controller = undefined;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.cancel();
  }

  async #drain(): Promise<void> {
    if (this.#running) await this.#running;
    if (this.#disposed || this.#pending === undefined) return;
    const run = async () => {
      while (!this.#disposed && this.#pending !== undefined) {
        const document = this.#pending;
        this.#pending = undefined;
        const controller = new AbortController();
        this.#controller = controller;
        try {
          await this.save(document, controller.signal);
          this.#lastError = undefined;
        } finally {
          if (this.#controller === controller) this.#controller = undefined;
        }
      }
    };
    this.#running = run();
    try {
      await this.#running;
    } finally {
      this.#running = undefined;
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Project autosave is disposed");
  }
}
