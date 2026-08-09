import type {
  ExtensionActivationResult,
  ExtensionHost,
  OptionalExtension,
  RendererCapabilities,
} from "@octopoly/contracts";

import { MatcapController, MatcapStateProvider, MATCAP_STATE_PROVIDER_ID } from "../controller";
import { MatcapImageManager } from "../image";
import { MATCAP_DEFAULT_PRESET_ID } from "../presets";
import { WebGL2MatcapShadingProvider } from "../webgl2";
import { MatcapPanel } from "./matcap-panel";

export const MATCAP_EXTENSION_ID = MATCAP_STATE_PROVIDER_ID;

function unsupportedReason(capabilities: RendererCapabilities | null): string | null {
  if (capabilities === null) return "MatCap requires a ready renderer";
  if (capabilities.backend !== "webgl2") return "MatCap requires the WebGL2 backend";
  return null;
}

export class MatcapExtension implements OptionalExtension {
  readonly id = MATCAP_EXTENSION_ID;
  #host: ExtensionHost | null = null;
  #images: MatcapImageManager | null = null;
  #provider: WebGL2MatcapShadingProvider | null = null;
  #controller: MatcapController | null = null;
  #panel: MatcapPanel | null = null;
  #stateProvider: MatcapStateProvider | null = null;
  #providerRegistered = false;
  #panelRegistered = false;
  #stateRegistered = false;
  #activationStarted = false;
  #disposed = false;

  async activate(host: ExtensionHost): Promise<ExtensionActivationResult> {
    if (this.#disposed) return { status: "failed", reason: "MatCap extension is disposed" };
    if (this.#activationStarted) {
      return { status: "failed", reason: "MatCap extension activation has already been attempted" };
    }
    this.#activationStarted = true;

    const capabilities = host.renderer.capabilities();
    const unsupported = unsupportedReason(capabilities);
    if (unsupported !== null || capabilities === null) {
      return { status: "unsupported", reason: unsupported ?? "MatCap renderer is unavailable" };
    }

    this.#host = host;
    const images = new MatcapImageManager(host.images, capabilities);
    this.#images = images;

    try {
      const initial = await images.selectPreset(MATCAP_DEFAULT_PRESET_ID);
      if (this.#disposed) {
        return { status: "failed", reason: "MatCap extension activation was cancelled" };
      }
      if (initial.status === "failed") {
        this.#cleanup();
        return {
          status: initial.code === "resource-budget" ? "unsupported" : "failed",
          reason: initial.reason,
        };
      }

      const provider = new WebGL2MatcapShadingProvider(initial.ref);
      this.#provider = provider;
      if (!provider.supports(capabilities)) {
        this.#cleanup();
        return { status: "unsupported", reason: "MatCap exceeds renderer texture or GPU limits" };
      }

      const controller = new MatcapController({
        shading: host.shading,
        renderer: host.renderer,
        provider,
        images,
        initialPresetId: MATCAP_DEFAULT_PRESET_ID,
        initialImage: initial.ref,
      });
      const panel = new MatcapPanel(controller);
      const stateProvider = new MatcapStateProvider(controller);
      this.#controller = controller;
      this.#panel = panel;
      this.#stateProvider = stateProvider;

      host.shading.register(provider);
      this.#providerRegistered = true;
      host.panels.register(panel);
      this.#panelRegistered = true;
      host.state.register(stateProvider);
      this.#stateRegistered = true;
      return { status: "activated" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#cleanup();
      return { status: "failed", reason };
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cleanup();
  }

  #cleanup(): void {
    const host = this.#host;
    let firstError: unknown;
    const attempt = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (error) {
        firstError ??= error;
      }
    };

    if (host !== null && this.#stateRegistered) {
      this.#stateRegistered = false;
      attempt(() => host.state.unregister(MATCAP_STATE_PROVIDER_ID));
    } else {
      attempt(() => this.#stateProvider?.dispose());
    }
    this.#stateProvider = null;

    if (host !== null && this.#panelRegistered) {
      this.#panelRegistered = false;
      attempt(() => host.panels.unregister(this.#panel?.id ?? ""));
    } else {
      attempt(() => this.#panel?.dispose());
    }
    this.#panel = null;

    attempt(() => this.#controller?.dispose());
    this.#controller = null;

    if (host !== null && this.#providerRegistered) {
      this.#providerRegistered = false;
      attempt(() => host.shading.unregister(this.#provider?.id ?? ""));
    } else {
      attempt(() => this.#provider?.dispose());
    }
    this.#provider = null;

    attempt(() => this.#images?.dispose());
    this.#images = null;
    this.#host = null;

    if (firstError !== undefined) throw firstError;
  }
}
