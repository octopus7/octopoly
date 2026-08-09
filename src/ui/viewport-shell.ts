import type { ViewportSnapshot } from "@octopoly/contracts";

export class ViewportShell {
  readonly element: HTMLElement;
  readonly viewportElement: HTMLElement;

  readonly #container: HTMLElement;
  readonly #window: Window;
  readonly #onViewport: (viewport: ViewportSnapshot) => void;
  readonly #resizeObserver: ResizeObserver | null;
  #disposed = false;

  constructor(container: HTMLElement, onViewport: (viewport: ViewportSnapshot) => void = () => {}) {
    const ownerWindow = container.ownerDocument.defaultView;
    if (ownerWindow === null) throw new Error("viewport container is not attached to a window");

    this.#container = container;
    this.#window = ownerWindow;
    this.#onViewport = onViewport;

    const shell = container.ownerDocument.createElement("section");
    shell.className = "octopoly-viewport-shell";
    shell.setAttribute("aria-label", "OctoPoly viewport");
    shell.style.boxSizing = "border-box";
    shell.style.width = "100%";
    shell.style.height = "100%";
    shell.style.overflow = "hidden";
    shell.style.setProperty("--octopoly-safe-area-top", "env(safe-area-inset-top, 0px)");
    shell.style.setProperty("--octopoly-safe-area-right", "env(safe-area-inset-right, 0px)");
    shell.style.setProperty("--octopoly-safe-area-bottom", "env(safe-area-inset-bottom, 0px)");
    shell.style.setProperty("--octopoly-safe-area-left", "env(safe-area-inset-left, 0px)");
    shell.style.paddingTop = "var(--octopoly-safe-area-top)";
    shell.style.paddingRight = "var(--octopoly-safe-area-right)";
    shell.style.paddingBottom = "var(--octopoly-safe-area-bottom)";
    shell.style.paddingLeft = "var(--octopoly-safe-area-left)";

    const viewport = container.ownerDocument.createElement("div");
    viewport.className = "octopoly-viewport";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", "Modeling viewport");
    viewport.style.width = "100%";
    viewport.style.height = "100%";
    viewport.style.touchAction = "none";
    shell.append(viewport);
    container.append(shell);

    this.element = shell;
    this.viewportElement = viewport;

    this.#window.addEventListener("resize", this.#handleResize);
    this.#window.addEventListener("orientationchange", this.#handleResize);
    const ResizeObserverConstructor = globalThis.ResizeObserver;
    this.#resizeObserver = typeof ResizeObserverConstructor === "function"
      ? new ResizeObserverConstructor(this.#handleResize)
      : null;
    this.#resizeObserver?.observe(this.viewportElement);
    this.refresh();
  }

  viewport(): ViewportSnapshot {
    this.#assertActive();
    return this.#snapshot();
  }

  refresh(): ViewportSnapshot {
    this.#assertActive();
    const viewport = this.#snapshot();
    this.element.dataset.orientation =
      viewport.cssWidth >= viewport.cssHeight ? "landscape" : "portrait";
    this.#onViewport(viewport);
    return viewport;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#resizeObserver?.disconnect();
    this.#window.removeEventListener("resize", this.#handleResize);
    this.#window.removeEventListener("orientationchange", this.#handleResize);
    this.element.remove();
  }

  readonly #handleResize = (): void => {
    if (!this.#disposed) this.refresh();
  };

  #snapshot(): ViewportSnapshot {
    const rect = this.viewportElement.getBoundingClientRect();
    const ratio = this.#window.devicePixelRatio;
    return Object.freeze({
      cssWidth: Math.max(0, rect.width),
      cssHeight: Math.max(0, rect.height),
      devicePixelRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
    });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("viewport shell is disposed");
  }
}
