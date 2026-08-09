import type {
  Disposable,
  ExtensionActivationResult,
  ExtensionHost,
  ImageAssetRef,
  OptionalExtension,
  ShadingSelectionLease,
} from "@octopoly/contracts";

import type {
  BrushBlendMode,
  BrushSettings,
  PremultipliedRgba8,
} from "../brush";
import {
  TexturePaintImageController,
  type TextureImagePixelDecoder,
  type TextureImageOperationResult,
} from "../image";
import { BarycentricUvProjector } from "../projection";
import { PaintEligibilityService, PaintTargetAdapter } from "../target";
import { TexturePaintBrushController } from "./brush-controller";
import { TexturePaintPanel } from "./texture-paint-panel";
import { TexturePaintStateProvider } from "./texture-paint-state-provider";
import {
  TEXTURE_PAINT_TOOL_ID,
  TexturePaintTool,
} from "./texture-paint-tool";
import {
  TEXTURE_PREVIEW_PROVIDER_ID,
  TexturePreviewShadingProvider,
} from "./texture-preview-shading-provider";

export const TEXTURE_PAINT_EXTENSION_ID = "texture-paint";

export interface TexturePaintExtensionOptions {
  readonly brush?: Partial<BrushSettings>;
  readonly color?: PremultipliedRgba8;
  readonly blendMode?: BrushBlendMode;
  readonly previewEnabled?: boolean;
  readonly pixelDecoder?: TextureImagePixelDecoder;
}

export class TexturePaintExtension implements OptionalExtension {
  readonly id = TEXTURE_PAINT_EXTENSION_ID;
  readonly #brushes: TexturePaintBrushController;
  readonly #color: PremultipliedRgba8 | undefined;
  readonly #blendMode: BrushBlendMode | undefined;
  readonly #pixelDecoder: TextureImagePixelDecoder | undefined;
  #previewEnabled: boolean;
  #host: ExtensionHost | null = null;
  #images: TexturePaintImageController | null = null;
  #tool: TexturePaintTool | null = null;
  #panel: TexturePaintPanel | null = null;
  #provider: TexturePreviewShadingProvider | null = null;
  #stateProvider: TexturePaintStateProvider | null = null;
  #shadingLease: ShadingSelectionLease | null = null;
  #unsubscribeImage: (() => void) | null = null;
  #unsubscribeModeling: (() => void) | null = null;
  #registeredTool = false;
  #registeredPanel = false;
  #registeredProvider = false;
  #registeredState = false;
  #disposed = false;

  constructor(options: TexturePaintExtensionOptions = {}) {
    this.#brushes = new TexturePaintBrushController(options.brush);
    this.#color = options.color;
    this.#blendMode = options.blendMode;
    this.#pixelDecoder = options.pixelDecoder;
    this.#previewEnabled = options.previewEnabled ?? true;
  }

  activate(host: ExtensionHost): ExtensionActivationResult {
    if (this.#disposed) {
      throw new Error("Texture paint extension is disposed");
    }
    if (this.#host !== null) {
      return Object.freeze({ status: "failed", reason: "Texture paint extension is already active" });
    }

    this.#host = host;
    const capabilities = host.renderer.capabilities();
    const images = capabilities === null
      ? new TexturePaintImageController(
          host.images,
          undefined,
          this.#pixelDecoder,
        )
      : new TexturePaintImageController(host.images, {
          maxTextureSize: capabilities.maxTextureSize,
          maxBytes: capabilities.applicationTextureBudgetBytes,
        }, this.#pixelDecoder);
    const targets = new PaintTargetAdapter(host.modeling.triangulation);
    const eligibility = new PaintEligibilityService(targets);
    const projector = new BarycentricUvProjector();
    const tool = new TexturePaintTool({
      images: host.images,
      imageController: images,
      picking: host.modeling.picking,
      triangulation: host.modeling.triangulation,
      targets,
      eligibility,
      projector,
      brushes: this.#brushes,
      ...(this.#color === undefined ? {} : { color: this.#color }),
      ...(this.#blendMode === undefined ? {} : { blendMode: this.#blendMode }),
    });
    const panel = new TexturePaintPanel(images, this.#brushes, tool);
    const provider = new TexturePreviewShadingProvider(() => images.activeImage());
    const stateProvider = new TexturePaintStateProvider(images, this.#brushes);
    this.#images = images;
    this.#tool = tool;
    this.#panel = panel;
    this.#provider = provider;
    this.#stateProvider = stateProvider;

    try {
      host.tools.register(tool);
      this.#registeredTool = true;
      host.shading.register(provider);
      this.#registeredProvider = true;
      host.panels.register(panel);
      this.#registeredPanel = true;
      host.state.register(stateProvider);
      this.#registeredState = true;

      this.#syncPreviewLease();
      this.#unsubscribeImage = images.subscribe(() => {
        if (this.#disposed || this.#host !== host) {
          return;
        }
        tool.evaluateDisabled(host.modeling.mesh.snapshot());
        panel.refresh();
        this.#shadingLease?.setCandidates(Object.freeze([TEXTURE_PREVIEW_PROVIDER_ID]));
        host.renderer.requestRender();
      });
      this.#unsubscribeModeling = host.modeling.subscribe((change) => {
        if (this.#disposed || this.#host !== host) {
          return;
        }
        if (change.kind === "document" || change.kind === "mesh") {
          tool.cancelActive();
        }
        if (change.kind === "document") {
          images.clear();
        }
        if (change.kind === "document" || change.kind === "mesh") {
          tool.evaluateDisabled(host.modeling.mesh.snapshot());
          panel.refresh();
          host.renderer.requestRender();
        }
      });
      tool.evaluateDisabled(host.modeling.mesh.snapshot());
      return Object.freeze({ status: "activated" });
    } catch (error) {
      this.#cleanup();
      return Object.freeze({
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  activeImage(): ImageAssetRef | null {
    return this.#requireImages().activeImage();
  }

  selectImage(ref: ImageAssetRef): Promise<TextureImageOperationResult> {
    return this.#requireImages().selectImage(ref);
  }

  importImage(source: Blob): Promise<TextureImageOperationResult> {
    return this.#requireImages().importImage(source);
  }

  flush(): Promise<void> {
    return this.#requireImages().flushActive();
  }

  pendingImageCleanup(): ReadonlyArray<ImageAssetRef> {
    return this.#requireImages().pendingCleanup();
  }

  retryPendingImageCleanup(): Promise<void> {
    return this.#requireImages().retryPendingCleanup();
  }

  brushSettings(): Readonly<BrushSettings> {
    return this.#brushes.settings();
  }

  setBrushSettings(settings: Partial<BrushSettings>): Readonly<BrushSettings> {
    const resolved = this.#brushes.setSettings(settings);
    this.#panel?.refresh();
    return resolved;
  }

  setPreviewEnabled(enabled: boolean): void {
    this.#assertUsable();
    this.#previewEnabled = enabled;
    this.#syncPreviewLease();
    this.#host?.renderer.requestRender();
  }

  activateToolScoped(): Disposable {
    this.#assertUsable();
    const host = this.#host;
    if (host === null || !this.#registeredTool) {
      throw new Error("Texture paint extension is not active");
    }
    return host.tools.activateScoped(TEXTURE_PAINT_TOOL_ID);
  }

  tool(): TexturePaintTool {
    this.#assertUsable();
    if (this.#tool === null) {
      throw new Error("Texture paint extension is not active");
    }
    return this.#tool;
  }

  panel(): TexturePaintPanel {
    this.#assertUsable();
    if (this.#panel === null) {
      throw new Error("Texture paint extension is not active");
    }
    return this.#panel;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#cleanup();
    this.#disposed = true;
  }

  #syncPreviewLease(): void {
    const host = this.#host;
    if (host === null) {
      return;
    }
    if (!this.#previewEnabled) {
      this.#shadingLease?.dispose();
      this.#shadingLease = null;
      return;
    }
    if (this.#shadingLease === null) {
      this.#shadingLease = host.shading.activateScoped(
        Object.freeze([TEXTURE_PREVIEW_PROVIDER_ID]),
      );
    } else {
      this.#shadingLease.setCandidates(Object.freeze([TEXTURE_PREVIEW_PROVIDER_ID]));
    }
  }

  #cleanup(): void {
    const host = this.#host;
    this.#unsubscribeModeling?.();
    this.#unsubscribeModeling = null;
    this.#unsubscribeImage?.();
    this.#unsubscribeImage = null;
    this.#tool?.cancelActive();
    this.#shadingLease?.dispose();
    this.#shadingLease = null;

    let firstError: unknown;
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        firstError ??= error;
      }
    };

    if (host !== null && this.#registeredState) {
      attempt(() => host.state.unregister(this.#stateProvider?.id ?? TEXTURE_PAINT_EXTENSION_ID));
      this.#registeredState = false;
    } else {
      attempt(() => this.#stateProvider?.dispose());
    }
    if (host !== null && this.#registeredPanel) {
      attempt(() => host.panels.unregister(this.#panel?.id ?? "texture-paint.panel"));
      this.#registeredPanel = false;
    } else {
      attempt(() => this.#panel?.dispose());
    }
    if (host !== null && this.#registeredProvider) {
      attempt(() => host.shading.unregister(this.#provider?.id ?? TEXTURE_PREVIEW_PROVIDER_ID));
      this.#registeredProvider = false;
    } else {
      attempt(() => this.#provider?.dispose());
    }
    attempt(() => this.#tool?.dispose());
    if (host !== null && this.#registeredTool) {
      attempt(() => host.tools.unregister(this.#tool?.id ?? TEXTURE_PAINT_TOOL_ID));
      this.#registeredTool = false;
    }
    attempt(() => this.#images?.dispose());

    this.#host = null;
    this.#images = null;
    this.#tool = null;
    this.#panel = null;
    this.#provider = null;
    this.#stateProvider = null;
    if (firstError !== undefined) {
      throw firstError;
    }
  }

  #requireImages(): TexturePaintImageController {
    this.#assertUsable();
    if (this.#images === null) {
      throw new Error("Texture paint extension is not active");
    }
    return this.#images;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Texture paint extension is disposed");
    }
  }
}
