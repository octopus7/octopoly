import type { ExtensionPanel, ExtensionPanelContext } from "@octopoly/contracts";

import type { TexturePaintImageController } from "../image";
import type { TexturePaintBrushController } from "./brush-controller";
import type { TexturePaintTool } from "./texture-paint-tool";

export const TEXTURE_PAINT_PANEL_ID = "texture-paint.panel";

export class TexturePaintPanel implements ExtensionPanel {
  readonly id = TEXTURE_PAINT_PANEL_ID;
  readonly title = "Texture Paint";
  readonly #images: TexturePaintImageController;
  readonly #brushes: TexturePaintBrushController;
  readonly #tool: TexturePaintTool;
  #container: HTMLElement | null = null;
  #statusElement: HTMLElement | null = null;
  #imageElement: HTMLElement | null = null;
  #brushElement: HTMLElement | null = null;
  #disposed = false;

  constructor(
    images: TexturePaintImageController,
    brushes: TexturePaintBrushController,
    tool: TexturePaintTool,
  ) {
    this.#images = images;
    this.#brushes = brushes;
    this.#tool = tool;
  }

  mount(container: HTMLElement, _context: ExtensionPanelContext): void {
    this.#assertUsable();
    if (this.#container !== null && this.#container !== container) {
      this.#container.replaceChildren();
    }

    const root = document.createElement("section");
    root.dataset.texturePaintPanel = "true";
    const status = document.createElement("p");
    status.dataset.texturePaintStatus = "true";
    const image = document.createElement("output");
    image.dataset.texturePaintImage = "true";
    const brush = document.createElement("output");
    brush.dataset.texturePaintBrush = "true";
    root.append(status, image, brush);
    container.replaceChildren(root);

    this.#container = container;
    this.#statusElement = status;
    this.#imageElement = image;
    this.#brushElement = brush;
    this.refresh();
  }

  refresh(): void {
    if (this.#disposed || this.#statusElement === null) {
      return;
    }
    const imageStatus = this.#images.status();
    const disabled = this.#tool.disabledReason();
    this.#statusElement.textContent = disabled === null ? "Paint ready" : `Paint disabled: ${disabled}`;
    if (this.#imageElement !== null) {
      this.#imageElement.textContent = imageStatus.active === null
        ? "No image selected"
        : `${imageStatus.active.id} @ revision ${imageStatus.active.revision}`;
    }
    if (this.#brushElement !== null) {
      const settings = this.#brushes.settings();
      this.#brushElement.textContent = `Radius ${settings.radiusPx}px · Opacity ${settings.opacity}`;
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#container?.replaceChildren();
    this.#container = null;
    this.#statusElement = null;
    this.#imageElement = null;
    this.#brushElement = null;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Texture paint panel is disposed");
    }
  }
}
