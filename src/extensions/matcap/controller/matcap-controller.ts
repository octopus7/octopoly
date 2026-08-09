import type {
  ImageAssetRef,
  RenderExtensionControl,
  RenderExtensionRegistry,
  ShadingCandidateFailure,
  ShadingSelectionLease,
  ShadingSelectionSnapshot,
  Unsubscribe,
} from "@octopoly/contracts";

import type { MatcapImageSelectionResult } from "../image";
import type { MatcapPresetId } from "../presets";
import type {
  MatcapControllerListener,
  MatcapControllerSnapshot,
  MatcapDisabledReason,
  MatcapImageSelectionSource,
  MatcapImageTarget,
  MatcapSelection,
  MatcapSelectionChangeResult,
} from "./types";

export interface MatcapControllerOptions {
  readonly shading: RenderExtensionRegistry;
  readonly renderer: RenderExtensionControl;
  readonly provider: MatcapImageTarget;
  readonly images: MatcapImageSelectionSource;
  readonly initialPresetId: MatcapPresetId;
  readonly initialImage: ImageAssetRef;
}

function cloneImage(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({
    id: ref.id,
    revision: ref.revision,
    width: ref.width,
    height: ref.height,
    colorSpace: ref.colorSpace,
  });
}

function presetSelection(presetId: MatcapPresetId, image: ImageAssetRef): MatcapSelection {
  return Object.freeze({ kind: "preset", presetId, image: cloneImage(image) });
}

function customSelection(image: ImageAssetRef): MatcapSelection {
  return Object.freeze({ kind: "custom", image: cloneImage(image) });
}

function imageFailureReason(result: Extract<MatcapImageSelectionResult, { status: "failed" }>): MatcapDisabledReason {
  return Object.freeze({
    code: result.code,
    message: result.reason,
    source: "image",
  });
}

function rendererFailureReason(
  failure: ShadingCandidateFailure | undefined,
  unsupportedBackend: boolean,
): MatcapDisabledReason {
  if (failure === undefined) {
    return Object.freeze({
      code: unsupportedBackend ? "unsupported-backend" : "provider-unsupported",
      message: unsupportedBackend
        ? "MatCap requires a WebGL2 renderer"
        : "The MatCap provider is not currently usable",
      source: "renderer",
    });
  }

  const code = failure.code === "missing"
    ? "provider-missing"
    : failure.code === "unsupported"
      ? (unsupportedBackend ? "unsupported-backend" : "provider-unsupported")
      : failure.code;
  return Object.freeze({ code, message: failure.reason, source: "renderer" });
}

export class MatcapController {
  readonly #shading: RenderExtensionRegistry;
  readonly #renderer: RenderExtensionControl;
  readonly #provider: MatcapImageTarget;
  readonly #images: MatcapImageSelectionSource;
  readonly #initialPresetId: MatcapPresetId;
  readonly #listeners = new Set<MatcapControllerListener>();
  #selection: MatcapSelection;
  #previousValidPresetId: MatcapPresetId;
  #lease: ShadingSelectionLease | null = null;
  #unsubscribeLease: Unsubscribe | null = null;
  #shadingSnapshot: ShadingSelectionSnapshot | null = null;
  #disabledReason: MatcapDisabledReason | null = null;
  #fallbackReason: MatcapDisabledReason | null = null;
  #busy = false;
  #operation = 0;
  #disposed = false;

  constructor(options: MatcapControllerOptions) {
    this.#shading = options.shading;
    this.#renderer = options.renderer;
    this.#provider = options.provider;
    this.#images = options.images;
    this.#initialPresetId = options.initialPresetId;
    this.#selection = presetSelection(options.initialPresetId, options.initialImage);
    this.#previousValidPresetId = options.initialPresetId;

    if (options.provider.id.trim().length === 0) {
      throw new Error("MatCap provider id must not be empty");
    }
  }

  snapshot(): MatcapControllerSnapshot {
    this.#assertUsable();
    return this.#makeSnapshot();
  }

  subscribe(listener: MatcapControllerListener): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean): void {
    this.#assertUsable();
    if (enabled === (this.#lease !== null)) return;

    if (!enabled) {
      this.#releaseLease();
      this.#publish();
      this.#renderer.requestRender();
      return;
    }

    const lease = this.#shading.activateScoped([this.#provider.id]);
    let unsubscribe: Unsubscribe | null = null;
    try {
      const initial = lease.snapshot();
      unsubscribe = lease.subscribe((snapshot) => {
        if (this.#disposed || this.#lease !== lease) return;
        this.#applyShadingSnapshot(snapshot);
      });
      this.#lease = lease;
      this.#unsubscribeLease = unsubscribe;
      this.#applyShadingSnapshot(initial);
      this.#renderer.requestRender();
    } catch (error) {
      unsubscribe?.();
      lease.dispose();
      if (this.#lease === lease) {
        this.#lease = null;
        this.#unsubscribeLease = null;
        this.#shadingSnapshot = null;
        this.#disabledReason = null;
      }
      throw error;
    }
  }

  async selectPreset(presetId: MatcapPresetId): Promise<MatcapSelectionChangeResult> {
    this.#assertUsable();
    return this.#select(
      () => this.#images.selectPreset(presetId),
      (ref) => presetSelection(presetId, ref),
    );
  }

  async importCustom(source: Blob): Promise<MatcapSelectionChangeResult> {
    this.#assertUsable();
    return this.#select(
      () => this.#images.importCustom(source),
      (ref) => customSelection(ref),
    );
  }

  async selectCustom(ref: ImageAssetRef): Promise<MatcapSelectionChangeResult> {
    this.#assertUsable();
    return this.#select(
      () => this.#images.selectCustom(ref),
      (selected) => customSelection(selected),
    );
  }

  async reset(): Promise<void> {
    this.#assertUsable();
    this.setEnabled(false);
    await this.selectPreset(this.#initialPresetId);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#operation += 1;
    this.#unsubscribeLease?.();
    this.#unsubscribeLease = null;
    this.#lease?.dispose();
    this.#lease = null;
    this.#listeners.clear();
  }

  async #select(
    load: () => Promise<MatcapImageSelectionResult>,
    createSelection: (ref: ImageAssetRef) => MatcapSelection,
  ): Promise<MatcapSelectionChangeResult> {
    const operation = ++this.#operation;
    this.#busy = true;
    this.#publish();

    let result: MatcapImageSelectionResult;
    try {
      result = await load();
    } catch (error) {
      result = Object.freeze({
        status: "failed",
        code: "decode-failed",
        issue: "decode-failed",
        reason: error instanceof Error ? error.message : String(error),
        retained: null,
      });
    }

    if (this.#disposed || operation !== this.#operation) {
      return Object.freeze({ status: "retained", selection: this.#selection, reason: Object.freeze({
        code: "decode-failed",
        message: "MatCap image selection was superseded or cancelled",
        source: "image",
      }) });
    }

    this.#busy = false;
    if (result.status === "failed") {
      const reason = imageFailureReason(result);
      this.#fallbackReason = reason;
      this.#publish();
      return Object.freeze({ status: "retained", selection: this.#selection, reason });
    }

    this.#provider.setImage(result.ref);
    this.#selection = createSelection(result.ref);
    if (this.#selection.kind === "preset") {
      this.#previousValidPresetId = this.#selection.presetId;
    }
    this.#fallbackReason = null;
    this.#publish();
    this.#renderer.requestRender();
    return Object.freeze({ status: "selected", selection: this.#selection });
  }

  #applyShadingSnapshot(snapshot: ShadingSelectionSnapshot): void {
    this.#shadingSnapshot = snapshot;
    if (snapshot.effectiveProviderId === this.#provider.id) {
      this.#disabledReason = null;
    } else {
      const capabilities = this.#renderer.capabilities();
      const unsupportedBackend = capabilities !== null && capabilities.backend !== "webgl2";
      this.#disabledReason = rendererFailureReason(
        snapshot.failures.find((failure) => failure.providerId === this.#provider.id),
        unsupportedBackend,
      );
    }
    this.#publish();
  }

  #releaseLease(): void {
    this.#unsubscribeLease?.();
    this.#unsubscribeLease = null;
    this.#lease?.dispose();
    this.#lease = null;
    this.#shadingSnapshot = null;
    this.#disabledReason = null;
  }

  #makeSnapshot(): MatcapControllerSnapshot {
    return Object.freeze({
      enabled: this.#lease !== null,
      busy: this.#busy,
      selection: this.#selection,
      previousValidPresetId: this.#previousValidPresetId,
      shading: this.#shadingSnapshot,
      disabledReason: this.#disabledReason,
      fallbackReason: this.#fallbackReason,
    });
  }

  #publish(): void {
    const snapshot = this.#makeSnapshot();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("MatCap controller is disposed");
  }
}
