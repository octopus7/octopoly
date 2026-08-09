import type { Tool, ToolRegistry } from "@octopoly/contracts";

export class ToolPalette {
  readonly element: HTMLElement;
  readonly #registry: ToolRegistry;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  #disposed = false;

  constructor(container: HTMLElement, registry: ToolRegistry) {
    this.#registry = registry;
    const element = container.ownerDocument.createElement("nav");
    element.className = "octopoly-tool-palette";
    element.setAttribute("aria-label", "Modeling tools");
    container.append(element);
    this.element = element;
  }

  setTools(tools: ReadonlyArray<Tool>): void {
    this.#assertActive();
    const ids = new Set<string>();
    for (const tool of tools) {
      if (ids.has(tool.id)) throw new Error(`duplicate palette tool id: ${tool.id}`);
      ids.add(tool.id);
    }

    this.#buttons.clear();
    this.element.replaceChildren();
    for (const tool of tools) {
      const button = this.element.ownerDocument.createElement("button");
      button.type = "button";
      button.dataset.toolId = tool.id;
      button.textContent = tool.id;
      button.addEventListener("click", () => {
        if (this.#disposed) return;
        this.#registry.activate(tool.id);
        this.refresh();
      });
      this.#buttons.set(tool.id, button);
      this.element.append(button);
    }
    this.refresh();
  }

  refresh(): void {
    this.#assertActive();
    const activeId = this.#registry.active()?.id ?? null;
    for (const [id, button] of this.#buttons) {
      const active = id === activeId;
      button.setAttribute("aria-pressed", String(active));
      button.dataset.active = String(active);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#buttons.clear();
    this.element.remove();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("tool palette is disposed");
  }
}
