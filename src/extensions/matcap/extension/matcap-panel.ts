import type {
  ExtensionPanel,
  ExtensionPanelContext,
  Unsubscribe,
} from "@octopoly/contracts";

import { MATCAP_PRESET_IDS, MatcapPresetCatalog, type MatcapPresetId } from "../presets";
import { MatcapController, type MatcapControllerSnapshot } from "../controller";

export const MATCAP_PANEL_ID = "octopoly.matcap.panel";

export class MatcapPanel implements ExtensionPanel {
  readonly id = MATCAP_PANEL_ID;
  readonly title = "MatCap";
  readonly #controller: MatcapController;
  #root: HTMLElement | null = null;
  #enabled: HTMLInputElement | null = null;
  #preset: HTMLSelectElement | null = null;
  #custom: HTMLInputElement | null = null;
  #status: HTMLOutputElement | null = null;
  #unsubscribe: Unsubscribe | null = null;
  #disposed = false;

  constructor(controller: MatcapController) {
    this.#controller = controller;
  }

  mount(container: HTMLElement, _context: ExtensionPanelContext): void {
    this.#assertUsable();
    if (this.#root !== null) throw new Error("MatCap panel is already mounted");

    const root = document.createElement("section");
    root.dataset.matcapPanel = "";

    const enabledLabel = document.createElement("label");
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.matcapEnabled = "";
    enabledLabel.append(enabled, document.createTextNode(" Enable MatCap"));

    const presetLabel = document.createElement("label");
    presetLabel.textContent = "Preset ";
    const preset = document.createElement("select");
    preset.dataset.matcapPreset = "";
    for (const presetId of MATCAP_PRESET_IDS) {
      const option = document.createElement("option");
      option.value = presetId;
      option.textContent = MatcapPresetCatalog[presetId].label;
      preset.append(option);
    }
    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "Custom image";
    customOption.disabled = true;
    preset.append(customOption);
    presetLabel.append(preset);

    const customLabel = document.createElement("label");
    customLabel.textContent = "Custom image ";
    const custom = document.createElement("input");
    custom.type = "file";
    custom.accept = "image/*";
    custom.dataset.matcapCustom = "";
    customLabel.append(custom);

    const status = document.createElement("output");
    status.dataset.matcapStatus = "";
    status.setAttribute("aria-live", "polite");

    root.append(enabledLabel, presetLabel, customLabel, status);
    container.append(root);

    enabled.addEventListener("change", this.#onEnabled);
    preset.addEventListener("change", this.#onPreset);
    custom.addEventListener("change", this.#onCustom);
    this.#root = root;
    this.#enabled = enabled;
    this.#preset = preset;
    this.#custom = custom;
    this.#status = status;
    this.#unsubscribe = this.#controller.subscribe((snapshot) => this.#render(snapshot));
    this.#render(this.#controller.snapshot());
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#enabled?.removeEventListener("change", this.#onEnabled);
    this.#preset?.removeEventListener("change", this.#onPreset);
    this.#custom?.removeEventListener("change", this.#onCustom);
    this.#root?.remove();
    this.#root = null;
    this.#enabled = null;
    this.#preset = null;
    this.#custom = null;
    this.#status = null;
  }

  readonly #onEnabled = (): void => {
    if (this.#enabled === null) return;
    this.#controller.setEnabled(this.#enabled.checked);
  };

  readonly #onPreset = (): void => {
    const value = this.#preset?.value;
    if (value === undefined || value === "__custom__") return;
    void this.#controller.selectPreset(value as MatcapPresetId);
  };

  readonly #onCustom = (): void => {
    const input = this.#custom;
    const file = input?.files?.[0];
    if (input === null || input === undefined || file === undefined) return;
    void this.#controller.importCustom(file).finally(() => {
      if (!this.#disposed && this.#custom === input) input.value = "";
    });
  };

  #render(snapshot: MatcapControllerSnapshot): void {
    if (this.#enabled === null || this.#preset === null || this.#custom === null || this.#status === null) {
      return;
    }
    this.#enabled.checked = snapshot.enabled;
    this.#enabled.disabled = snapshot.busy;
    this.#preset.disabled = snapshot.busy;
    this.#custom.disabled = snapshot.busy;
    this.#preset.value = snapshot.selection.kind === "preset"
      ? snapshot.selection.presetId
      : "__custom__";

    const reason = snapshot.fallbackReason ?? snapshot.disabledReason;
    this.#status.value = reason?.message ?? (snapshot.enabled ? "MatCap active" : "MatCap ready");
    this.#status.dataset.state = snapshot.fallbackReason !== null
      ? "fallback"
      : snapshot.disabledReason !== null
        ? "disabled"
        : "ready";
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("MatCap panel is disposed");
  }
}
