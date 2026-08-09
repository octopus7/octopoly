import type { ExtensionPanel, PanelRegistry } from "@octopoly/contracts";

export class DefaultPanelRegistry implements PanelRegistry {
  readonly #panels = new Map<string, ExtensionPanel>();
  readonly #disposedPanels = new WeakSet<ExtensionPanel>();
  #disposed = false;

  register(panel: ExtensionPanel): void {
    this.#assertActive();
    if (panel.id.trim().length === 0) {
      throw new TypeError("panel id must not be empty");
    }
    if (this.#panels.has(panel.id)) {
      throw new Error(`panel already registered: ${panel.id}`);
    }
    if (this.#disposedPanels.has(panel)) {
      throw new Error(`disposed panel cannot be registered: ${panel.id}`);
    }
    this.#panels.set(panel.id, panel);
  }

  unregister(id: string): void {
    this.#assertActive();
    const panel = this.#panels.get(id);
    if (panel === undefined) return;
    this.#panels.delete(id);
    this.#disposePanel(panel);
  }

  get(id: string): ExtensionPanel | null {
    this.#assertActive();
    return this.#panels.get(id) ?? null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const panel of this.#panels.values()) {
      try {
        this.#disposePanel(panel);
      } catch (error) {
        errors.push(error);
      }
    }
    this.#panels.clear();
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "multiple panels failed to dispose");
  }

  #disposePanel(panel: ExtensionPanel): void {
    if (this.#disposedPanels.has(panel)) return;
    this.#disposedPanels.add(panel);
    panel.dispose();
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("panel registry is disposed");
    }
  }
}
