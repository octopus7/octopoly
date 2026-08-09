import type {
  ExtensionActivationResult,
  ExtensionHost,
  OptionalExtension,
  ShadingProvider,
} from "@octopoly/contracts";

import { LookdevMaterialStore } from "../material";
import {
  LOOKDEV_REALTIME_PROVIDER_ID,
  WebGL2PbrShadingProvider,
} from "../webgl2/realtime";
import {
  LOOKDEV_QUALITY_PROVIDER_ID,
  WebGL2QualityShadingProvider,
} from "../webgl2/quality";
import { LookdevController, type LookdevPreset } from "./controller";
import { LOOKDEV_PANEL_ID, LookdevPanel } from "./panel";
import { LOOKDEV_STATE_ID, LookdevStateProvider } from "./state";

export const LOOKDEV_EXTENSION_ID = "octopoly.lookdev";

export interface LookdevExtensionOptions {
  readonly materials?: LookdevMaterialStore;
  readonly realtimeProvider?: ShadingProvider;
  readonly qualityProvider?: ShadingProvider;
  readonly initialPreset?: LookdevPreset;
}

export class LookdevExtension implements OptionalExtension {
  readonly id = LOOKDEV_EXTENSION_ID;
  readonly materials: LookdevMaterialStore;
  readonly realtimeProvider: ShadingProvider;
  readonly qualityProvider: ShadingProvider;
  readonly #initialPreset: LookdevPreset;
  readonly #registeredProviderIds: string[] = [];
  readonly #releasedProviderIds = new Set<string>();
  #host: ExtensionHost | null = null;
  #controller: LookdevController | null = null;
  #panel: LookdevPanel | null = null;
  #stateProvider: LookdevStateProvider | null = null;
  #panelRegistered = false;
  #stateRegistered = false;
  #activationAttempted = false;
  #disposed = false;

  constructor(options: LookdevExtensionOptions = {}) {
    this.materials = options.materials ?? new LookdevMaterialStore();
    this.realtimeProvider = options.realtimeProvider ?? new WebGL2PbrShadingProvider(this.materials);
    this.qualityProvider = options.qualityProvider ?? new WebGL2QualityShadingProvider(this.materials);
    this.#initialPreset = options.initialPreset ?? "realtime";
    if (this.realtimeProvider.id !== LOOKDEV_REALTIME_PROVIDER_ID) {
      throw new Error(`Realtime provider id must be "${LOOKDEV_REALTIME_PROVIDER_ID}"`);
    }
    if (this.qualityProvider.id !== LOOKDEV_QUALITY_PROVIDER_ID) {
      throw new Error(`Quality provider id must be "${LOOKDEV_QUALITY_PROVIDER_ID}"`);
    }
  }

  activate(host: ExtensionHost): ExtensionActivationResult {
    if (this.#disposed) {
      return Object.freeze({ status: "failed", reason: "Lookdev extension is disposed" });
    }
    if (this.#activationAttempted) {
      return Object.freeze({ status: "failed", reason: "Lookdev extension activation was already attempted" });
    }
    this.#activationAttempted = true;

    const capabilities = host.renderer.capabilities();
    if (capabilities === null) {
      this.#disposeUnregisteredProviders();
      return Object.freeze({ status: "unsupported", reason: "Renderer is not ready" });
    }
    if (capabilities.backend !== "webgl2") {
      this.#disposeUnregisteredProviders();
      return Object.freeze({
        status: "unsupported",
        reason: `Lookdev requires WebGL2; received ${capabilities.backend}`,
      });
    }

    this.#host = host;
    try {
      this.#registerProvider(host, this.realtimeProvider);
      this.#registerProvider(host, this.qualityProvider);

      const controller = new LookdevController(host.shading, host.renderer, this.#initialPreset);
      this.#controller = controller;
      const panel = new LookdevPanel(controller, this.materials);
      this.#panel = panel;
      try {
        host.panels.register(panel);
        this.#panelRegistered = true;
      } catch (error) {
        panel.dispose();
        throw error;
      }

      const stateProvider = new LookdevStateProvider(
        this.materials,
        controller,
        () => panel.refresh(),
      );
      this.#stateProvider = stateProvider;
      try {
        host.state.register(stateProvider);
        this.#stateRegistered = true;
      } catch (error) {
        stateProvider.dispose();
        throw error;
      }
      return Object.freeze({ status: "activated" });
    } catch (error) {
      const reason = reasonFrom(error);
      this.#cleanup();
      return Object.freeze({ status: "failed", reason });
    }
  }

  controller(): LookdevController | null {
    return this.#controller;
  }

  stateProvider(): LookdevStateProvider | null {
    return this.#stateProvider;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cleanup();
  }

  #registerProvider(host: ExtensionHost, provider: ShadingProvider): void {
    try {
      host.shading.register(provider);
      this.#registeredProviderIds.push(provider.id);
    } catch (error) {
      provider.dispose();
      this.#releasedProviderIds.add(provider.id);
      throw error;
    }
  }

  #cleanup(): void {
    const host = this.#host;
    if (host !== null && this.#stateRegistered) {
      try {
        host.state.unregister(LOOKDEV_STATE_ID);
      } catch {
        this.#stateProvider?.dispose();
      }
    } else {
      this.#stateProvider?.dispose();
    }
    this.#stateRegistered = false;
    this.#stateProvider = null;

    if (host !== null && this.#panelRegistered) {
      try {
        host.panels.unregister(LOOKDEV_PANEL_ID);
      } catch {
        this.#panel?.dispose();
      }
    } else {
      this.#panel?.dispose();
    }
    this.#panelRegistered = false;
    this.#panel = null;

    this.#controller?.dispose();
    this.#controller = null;

    if (host !== null) {
      for (const id of [...this.#registeredProviderIds].reverse()) {
        try {
          host.shading.unregister(id);
        } catch {
          this.#providerById(id)?.dispose();
        } finally {
          this.#releasedProviderIds.add(id);
        }
      }
    }
    this.#registeredProviderIds.length = 0;
    this.#disposeUnregisteredProviders();
    this.#host = null;
  }

  #disposeUnregisteredProviders(): void {
    if (
      !this.#registeredProviderIds.includes(this.qualityProvider.id) &&
      !this.#releasedProviderIds.has(this.qualityProvider.id)
    ) {
      this.qualityProvider.dispose();
      this.#releasedProviderIds.add(this.qualityProvider.id);
    }
    if (
      !this.#registeredProviderIds.includes(this.realtimeProvider.id) &&
      !this.#releasedProviderIds.has(this.realtimeProvider.id)
    ) {
      this.realtimeProvider.dispose();
      this.#releasedProviderIds.add(this.realtimeProvider.id);
    }
  }

  #providerById(id: string): ShadingProvider | null {
    if (id === this.qualityProvider.id) return this.qualityProvider;
    if (id === this.realtimeProvider.id) return this.realtimeProvider;
    return null;
  }
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
