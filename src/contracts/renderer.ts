import type { ImageAssetRef, ImageAssetResolver } from "./assets";
import type { CameraSnapshot, ViewportSnapshot } from "./camera";
import type { Disposable, MaterialId, Unsubscribe } from "./fundamental";
import type { Mat4, Vec2, Vec3, Vec4 } from "./math";
import type { AttributeKey, AttributeValue, MeshSnapshot, TriangleMeshSnapshot } from "./mesh";
import type { SelectionSnapshot } from "./selection";
import type { ToolPreview } from "./tools";

export interface RendererCapabilities {
  readonly backend: "webgl2" | "webgpu";
  readonly maxTextureSize: number;
  readonly supportsFloatColorBuffer: boolean;
  readonly applicationTextureBudgetBytes: number;
  readonly applicationGpuBudgetBytes: number;
}

export type RendererState =
  | "uninitialized"
  | "ready"
  | "context-lost"
  | "unsupported"
  | "failed"
  | "disposed";

export type RendererInitResult =
  | { readonly status: "ready"; readonly capabilities: RendererCapabilities }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

export interface RenderSceneSnapshot {
  readonly camera: CameraSnapshot;
  readonly viewport: ViewportSnapshot;
  readonly reference?: TriangleMeshSnapshot;
  readonly retopo: MeshSnapshot;
  readonly selection: SelectionSnapshot;
  readonly preview?: ToolPreview;
}

export interface RendererService extends Disposable {
  initialize(canvas: HTMLCanvasElement, images?: ImageAssetResolver): Promise<RendererInitResult>;
  state(): RendererState;
  capabilities(): RendererCapabilities | null;
  resize(viewport: ViewportSnapshot): void;
  render(scene: RenderSceneSnapshot): void;
  handleContextLoss(): void;
  restore(): Promise<RendererInitResult>;
}

export type UniformValue = number | Vec2 | Vec3 | Vec4 | Mat4 | ReadonlyArray<number> | ImageAssetRef;

export interface ShadingProgramDescriptor {
  readonly language: "glsl-es-300" | "wgsl";
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
  readonly attributes?: ReadonlyArray<{
    readonly shaderName: string;
    readonly source: "position" | "normal" | "meshAttribute";
    readonly key?: AttributeKey<AttributeValue>;
  }>;
}

export interface ShadingFrameInput {
  readonly scene: RenderSceneSnapshot;
  readonly material?: MaterialId;
}

export interface ShadingProvider extends Disposable {
  readonly id: string;
  readonly label: string;
  supports(capabilities: RendererCapabilities): boolean;
  program(): ShadingProgramDescriptor;
  uniforms(input: ShadingFrameInput): Readonly<Record<string, UniformValue>>;
}

export type ShadingFailureCode =
  | "missing"
  | "unsupported"
  | "compile-failed"
  | "uniforms-failed"
  | "image-unavailable";

export interface ShadingCandidateFailure {
  readonly providerId: string;
  readonly code: ShadingFailureCode;
  readonly reason: string;
}

export interface ShadingSelectionSnapshot {
  readonly candidates: ReadonlyArray<string>;
  readonly effectiveProviderId: string | null;
  readonly failures: ReadonlyArray<ShadingCandidateFailure>;
}

export interface ShadingSelectionLease extends Disposable {
  setCandidates(providerIds: ReadonlyArray<string>): void;
  snapshot(): ShadingSelectionSnapshot;
  subscribe(listener: (snapshot: ShadingSelectionSnapshot) => void): Unsubscribe;
}

export interface RenderExtensionRegistry extends Disposable {
  register(provider: ShadingProvider): void;
  unregister(id: string): void;
  get(id: string): ShadingProvider | null;
  list(): ReadonlyArray<ShadingProvider>;
  activateScoped(providerIds: ReadonlyArray<string>): ShadingSelectionLease;
  active(): string | null;
}
