import type {
  ExtensionHost,
  ExtensionStateRegistry,
  ImageAssetService,
  ModelingExtensionServices,
  PanelRegistry,
  RenderExtensionControl,
  RenderExtensionRegistry,
  ToolRegistry,
} from "@octopoly/contracts";

export interface CoreExtensionHostServices {
  readonly tools: ToolRegistry;
  readonly shading: RenderExtensionRegistry;
  readonly images: ImageAssetService;
  readonly panels: PanelRegistry;
  readonly renderer: RenderExtensionControl;
  readonly modeling: ModelingExtensionServices;
  readonly state: ExtensionStateRegistry;
}
/** Provider-zero production host. Optional modules are loaded only by a separate entrypoint. */
export class CoreExtensionHost implements ExtensionHost {
  readonly tools: ToolRegistry;
  readonly shading: RenderExtensionRegistry;
  readonly images: ImageAssetService;
  readonly panels: PanelRegistry;
  readonly renderer: RenderExtensionControl;
  readonly modeling: ModelingExtensionServices;
  readonly state: ExtensionStateRegistry;
  #disposed = false;

  constructor(services: CoreExtensionHostServices) {
    this.tools = services.tools;
    this.shading = services.shading;
    this.images = services.images;
    this.panels = services.panels;
    this.renderer = services.renderer;
    this.modeling = services.modeling;
    this.state = services.state;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    const errors: unknown[] = [];
    // Providers/panels are released before the shared asset and renderer registries.
    for (const disposable of [
      this.state,
      this.panels,
      this.images,
      this.shading,
      this.tools,
    ]) {
      try {
        disposable.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Core extension host disposal failed");
    }
  }
}
