import type {
  ExtensionStateContribution,
  ImageAssetRef,
  ImageAssetService,
} from "./assets";
import type { MeshTriangulationService, PickingService, ViewportSnapshot, CameraSnapshot } from "./camera";
import type { Disposable, Unsubscribe } from "./fundamental";
import type { HistoryService } from "./history";
import type { NormalizedInputSurfaceFactory } from "./input";
import type { MeshMutationService, MeshQuery } from "./mesh";
import type {
  RenderExtensionRegistry,
  RendererCapabilities,
} from "./renderer";
import type { SelectionService } from "./selection";
import type { ToolRegistry } from "./tools";

export interface ExtensionPanelContext {
  readonly inputSurfaces: NormalizedInputSurfaceFactory;
}

export interface ExtensionPanel extends Disposable {
  readonly id: string;
  readonly title: string;
  mount(container: HTMLElement, context: ExtensionPanelContext): void;
}

export interface PanelRegistry extends Disposable {
  register(panel: ExtensionPanel): void;
  unregister(id: string): void;
  get(id: string): ExtensionPanel | null;
}

export interface RenderExtensionControl {
  capabilities(): RendererCapabilities | null;
  requestRender(): void;
}

export interface ModelingExtensionServices {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly picking: PickingService;
  readonly triangulation: MeshTriangulationService;
  getCamera(): CameraSnapshot;
  getViewport(): ViewportSnapshot;
  subscribe(listener: (change: ModelingExtensionChange) => void): Unsubscribe;
}

export type ModelingExtensionChangeKind = "document" | "mesh" | "selection" | "camera" | "viewport";

export interface ModelingExtensionChange {
  readonly kind: ModelingExtensionChangeKind;
  readonly meshVersion?: number;
}

export interface ExtensionStateProvider extends Disposable {
  readonly id: string;
  load(value: ExtensionStateContribution | undefined): void | Promise<void>;
  save(): ExtensionStateContribution | undefined;
}

export interface ExtensionStateBundle {
  readonly values: Readonly<Record<string, ExtensionStateContribution>>;
  readonly imageAssets: ReadonlyArray<ImageAssetRef>;
}

export interface ExtensionStateRegistry extends Disposable {
  register(provider: ExtensionStateProvider): void;
  unregister(id: string): void;
  load(values: Readonly<Record<string, ExtensionStateContribution>>): Promise<void>;
  save(): ExtensionStateBundle;
}

export interface ExtensionHost extends Disposable {
  readonly tools: ToolRegistry;
  readonly shading: RenderExtensionRegistry;
  readonly images: ImageAssetService;
  readonly panels: PanelRegistry;
  readonly renderer: RenderExtensionControl;
  readonly modeling: ModelingExtensionServices;
  readonly state: ExtensionStateRegistry;
}

export type ExtensionActivationResult =
  | { readonly status: "activated" }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

export interface OptionalExtension extends Disposable {
  readonly id: string;
  activate(host: ExtensionHost): ExtensionActivationResult | Promise<ExtensionActivationResult>;
}

export interface ExtensionRuntime extends Disposable {
  activate(extension: OptionalExtension): Promise<ExtensionActivationResult>;
  deactivate(id: string): void;
  active(): ReadonlyArray<string>;
}
