import type { ExtensionPanel, ExtensionPanelContext, Unsubscribe } from "@octopoly/contracts";

import type { LookdevMaterialStore } from "../material";
import type { LookdevControllerSnapshot } from "./controller";
import { LookdevController } from "./controller";

export const LOOKDEV_PANEL_ID = "octopoly.lookdev.panel";

export class LookdevPanel implements ExtensionPanel {
  readonly id = LOOKDEV_PANEL_ID;
  readonly title = "Lookdev";
  readonly #controller: LookdevController;
  readonly #materials: LookdevMaterialStore;
  #root: HTMLElement | null = null;
  #presetSelect: HTMLSelectElement | null = null;
  #materialStatus: HTMLElement | null = null;
  #providerStatus: HTMLElement | null = null;
  #fallbackStatus: HTMLElement | null = null;
  #unsubscribe: Unsubscribe | null = null;
  #disposed = false;

  constructor(controller: LookdevController, materials: LookdevMaterialStore) {
    this.#controller = controller;
    this.#materials = materials;
  }

  mount(container: HTMLElement, _context: ExtensionPanelContext): void {
    this.#assertUsable();
    if (this.#root !== null) throw new Error("Lookdev panel is already mounted");

    const root = document.createElement("section");
    root.dataset.extensionPanel = this.id;
    root.setAttribute("aria-label", this.title);

    const heading = document.createElement("h2");
    heading.textContent = this.title;
    root.append(heading);

    const presetLabel = document.createElement("label");
    presetLabel.textContent = "Render preset";
    const presetSelect = document.createElement("select");
    presetSelect.setAttribute("aria-label", "Render preset");
    presetSelect.append(
      option("realtime", "Realtime PBR"),
      option("quality", "Quality PBR"),
    );
    presetSelect.addEventListener("change", this.#onPresetChange);
    presetLabel.append(presetSelect);
    root.append(presetLabel);

    const materialStatus = document.createElement("p");
    materialStatus.dataset.lookdevStatus = "material";
    const providerStatus = document.createElement("p");
    providerStatus.dataset.lookdevStatus = "provider";
    providerStatus.setAttribute("role", "status");
    const fallbackStatus = document.createElement("p");
    fallbackStatus.dataset.lookdevStatus = "fallback";
    fallbackStatus.setAttribute("role", "status");
    root.append(materialStatus, providerStatus, fallbackStatus);
    container.append(root);

    this.#root = root;
    this.#presetSelect = presetSelect;
    this.#materialStatus = materialStatus;
    this.#providerStatus = providerStatus;
    this.#fallbackStatus = fallbackStatus;
    this.#unsubscribe = this.#controller.subscribe((snapshot) => this.#render(snapshot));
    this.refresh();
  }

  refresh(): void {
    this.#assertUsable();
    if (this.#root === null) return;
    this.#render(this.#controller.snapshot());
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#presetSelect?.removeEventListener("change", this.#onPresetChange);
    this.#root?.remove();
    this.#root = null;
    this.#presetSelect = null;
    this.#materialStatus = null;
    this.#providerStatus = null;
    this.#fallbackStatus = null;
  }

  readonly #onPresetChange = (): void => {
    const value = this.#presetSelect?.value;
    if (value === "quality" || value === "realtime") {
      this.#controller.setPreset(value);
    }
  };

  #render(snapshot: LookdevControllerSnapshot): void {
    if (
      this.#presetSelect === null ||
      this.#materialStatus === null ||
      this.#providerStatus === null ||
      this.#fallbackStatus === null
    ) {
      return;
    }
    this.#presetSelect.value = snapshot.preset;
    const materials = this.#materials.list();
    this.#materialStatus.textContent =
      `Material: ${this.#materials.snapshot().id} (${materials.length || 1} available)`;
    this.#providerStatus.textContent = snapshot.effectiveProviderId === null
      ? "Provider: Core solid/wireframe"
      : `Provider: ${snapshot.effectiveProviderId}`;
    this.#fallbackStatus.textContent = snapshot.fallback === null
      ? "Fallback: none"
      : `Fallback: ${snapshot.fallback.kind} — ${snapshot.fallback.reason}`;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Lookdev panel is disposed");
  }
}

function option(value: string, label: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}
