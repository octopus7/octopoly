import type {
  ImageAssetResolver,
  MeshTriangulationService,
  RenderSceneSnapshot,
  RendererCapabilities,
  RendererInitResult,
  RendererService,
  RendererState,
  ViewportSnapshot,
} from "@octopoly/contracts";

import { WebGL2RenderExtensionRegistry } from "./extension-registry";
import { WebGlImageTextureCache } from "./image-texture-cache";
import type { RenderPass } from "./pass";
import { WebGlShadingRuntime } from "./shading-runtime";

export const APPLICATION_TEXTURE_BUDGET_BYTES = 512 * 1024 * 1024;
export const APPLICATION_GPU_BUDGET_BYTES = 256 * 1024 * 1024;
export const MAX_DEVICE_PIXEL_RATIO = 4;

type ScheduleFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (handle: number) => void;

export class WebGL2RendererService implements RendererService {
  readonly #passes: ReadonlyArray<RenderPass>;
  readonly #registry: WebGL2RenderExtensionRegistry;
  readonly #scheduleFrame: ScheduleFrame;
  readonly #cancelFrame: CancelFrame;
  readonly #triangulation: MeshTriangulationService | undefined;
  #state: RendererState = "uninitialized";
  #capabilities: RendererCapabilities | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #gl: WebGL2RenderingContext | null = null;
  #imagesResolver: ImageAssetResolver | undefined;
  #images: WebGlImageTextureCache | null = null;
  #shading: WebGlShadingRuntime | null = null;
  #lastViewport: ViewportSnapshot | null = null;
  #effectiveDevicePixelRatio = 1;
  #lastScene: RenderSceneSnapshot | null = null;
  #scheduledFrame: number | null = null;
  #listenersAttached = false;
  #passesDisposed = false;

  readonly #onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.#state === "ready") {
      this.handleContextLoss();
    }
  };

  readonly #onContextRestored = (): void => {
    if (this.#state === "context-lost") {
      void this.restore();
    }
  };

  constructor(
    passes: ReadonlyArray<RenderPass> = [],
    registry: WebGL2RenderExtensionRegistry = new WebGL2RenderExtensionRegistry(),
    scheduleFrame: ScheduleFrame = defaultScheduleFrame,
    cancelFrame: CancelFrame = defaultCancelFrame,
    triangulation?: MeshTriangulationService,
  ) {
    this.#passes = Object.freeze([...passes]);
    this.#registry = registry;
    this.#scheduleFrame = scheduleFrame;
    this.#cancelFrame = cancelFrame;
    this.#triangulation = triangulation;
  }

  async initialize(
    canvas: HTMLCanvasElement,
    images?: ImageAssetResolver,
  ): Promise<RendererInitResult> {
    this.#assertState("uninitialized", "initialize");
    this.#canvas = canvas;
    this.#imagesResolver = images;

    const acquired = acquireWebGL2(canvas);
    if (acquired.status !== "ready") {
      this.#state = acquired.status;
      this.#capabilities = null;
      return acquired;
    }

    const installed = this.#installContext(acquired.gl);
    if (installed.status !== "ready") {
      this.#state = "failed";
      this.#capabilities = null;
      return installed;
    }

    this.#state = "ready";
    this.#attachContextListeners();
    return { status: "ready", capabilities: installed.capabilities };
  }

  state(): RendererState {
    return this.#state;
  }

  capabilities(): RendererCapabilities | null {
    return this.#capabilities;
  }

  resize(viewport: ViewportSnapshot): void {
    this.#assertState("ready", "resize");
    this.#applyResize(viewport);
  }

  render(scene: RenderSceneSnapshot): void {
    this.#assertState("ready", "render");
    this.#lastScene = scene;
    if (!sameViewport(this.#lastViewport, scene.viewport)) {
      this.#applyResize(scene.viewport);
    }
    this.#requestFrame();
  }

  handleContextLoss(): void {
    this.#assertState("ready", "handleContextLoss");
    this.#cancelScheduledFrame();
    this.#state = "context-lost";
    this.#capabilities = null;

    this.#images?.invalidateContext();
    this.#images?.dispose();
    this.#images = null;
    this.#shading?.invalidateContext();
    this.#shading?.dispose();
    this.#shading = null;
    for (const pass of this.#passes) {
      try {
        pass.invalidate();
      } catch {
        // A broken pass must not prevent the remaining GPU handles from being invalidated.
      }
    }
    this.#gl = null;
  }

  async restore(): Promise<RendererInitResult> {
    this.#assertState("context-lost", "restore");
    const canvas = this.#canvas;
    if (canvas === null) {
      throw new Error("Renderer has no canvas to restore");
    }

    const acquired = acquireWebGL2(canvas);
    if (acquired.status !== "ready") {
      this.#state = acquired.status;
      this.#capabilities = null;
      return acquired;
    }

    const installed = this.#installContext(acquired.gl);
    if (installed.status !== "ready") {
      this.#state = "failed";
      this.#capabilities = null;
      return installed;
    }

    this.#state = "ready";
    if (this.#lastViewport !== null) {
      this.#applyResize(this.#lastViewport);
    }
    if (this.#lastScene !== null) {
      this.#requestFrame();
    }
    return { status: "ready", capabilities: installed.capabilities };
  }

  dispose(): void {
    if (this.#state === "disposed") {
      return;
    }
    this.#cancelScheduledFrame();
    this.#detachContextListeners();
    this.#images?.dispose();
    this.#images = null;
    this.#shading?.dispose();
    this.#shading = null;
    this.#disposePasses();
    this.#registry.dispose();
    this.#gl = null;
    this.#canvas = null;
    this.#imagesResolver = undefined;
    this.#capabilities = null;
    this.#lastScene = null;
    this.#lastViewport = null;
    this.#state = "disposed";
  }

  #installContext(gl: WebGL2RenderingContext): RendererInitResult {
    const capabilitiesResult = readCapabilities(gl);
    if (capabilitiesResult.status !== "ready") {
      return capabilitiesResult;
    }

    let images: WebGlImageTextureCache | null = null;
    let shading: WebGlShadingRuntime | null = null;
    try {
      images = new WebGlImageTextureCache(
        gl,
        this.#imagesResolver,
        capabilitiesResult.capabilities.maxTextureSize,
        capabilitiesResult.capabilities.applicationTextureBudgetBytes,
        () => this.#requestFrame(),
      );
      shading = new WebGlShadingRuntime(gl, this.#registry, images, this.#triangulation);
      for (const pass of this.#passes) {
        pass.initialize(gl);
      }
    } catch (error) {
      shading?.dispose();
      images?.dispose();
      this.#disposePasses();
      this.#gl = null;
      return { status: "failed", reason: reasonFrom(error) };
    }

    this.#gl = gl;
    this.#images = images;
    this.#shading = shading;
    this.#capabilities = capabilitiesResult.capabilities;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    return capabilitiesResult;
  }

  #applyResize(viewport: ViewportSnapshot): void {
    validateViewport(viewport);
    const canvas = this.#canvas;
    const gl = this.#gl;
    if (canvas === null || gl === null || this.#capabilities === null) {
      throw new Error("Renderer has no ready WebGL2 context");
    }

    const requestedDpr = Math.min(Math.max(viewport.devicePixelRatio, 1), MAX_DEVICE_PIXEL_RATIO);
    const widthLimit = viewport.cssWidth === 0
      ? requestedDpr
      : this.#capabilities.maxTextureSize / viewport.cssWidth;
    const heightLimit = viewport.cssHeight === 0
      ? requestedDpr
      : this.#capabilities.maxTextureSize / viewport.cssHeight;
    const effectiveDpr = Math.min(requestedDpr, widthLimit, heightLimit);
    const width = Math.max(1, Math.round(viewport.cssWidth * effectiveDpr));
    const height = Math.max(1, Math.round(viewport.cssHeight * effectiveDpr));

    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    this.#effectiveDevicePixelRatio = effectiveDpr;
    this.#lastViewport = Object.freeze({ ...viewport });
  }

  #requestFrame(): void {
    if (this.#state !== "ready" || this.#lastScene === null || this.#scheduledFrame !== null) {
      return;
    }
    this.#scheduledFrame = this.#scheduleFrame(() => {
      this.#scheduledFrame = null;
      if (this.#state !== "ready" || this.#lastScene === null) {
        return;
      }
      this.#draw(this.#lastScene);
    });
  }

  #draw(scene: RenderSceneSnapshot): void {
    const gl = this.#gl;
    const capabilities = this.#capabilities;
    if (gl === null || capabilities === null) {
      return;
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.055, 0.065, 0.08, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.#renderPassPhase("base", gl, scene);

    // Provider validation/binding is isolated; required solid remains the fallback.
    let providerRendered = false;
    try {
      providerRendered = this.#shading?.renderFrame(scene, capabilities) ?? false;
    } catch {
      // The Core solid/wireframe passes still render when an extension misbehaves.
    }
    if (!providerRendered) {
      this.#renderPassPhase("fallback", gl, scene);
    }
    this.#renderPassPhase("overlay", gl, scene);
  }

  #renderPassPhase(
    phase: "base" | "fallback" | "overlay",
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
  ): void {
    for (const pass of this.#passes) {
      if ((pass.phase ?? "base") !== phase) {
        continue;
      }
      try {
        pass.render(gl, scene, this.#effectiveDevicePixelRatio);
      } catch {
        // Passes own disjoint resources; one failure must not suppress the rest.
      }
    }
  }

  #attachContextListeners(): void {
    const canvas = this.#canvas;
    if (canvas === null || this.#listenersAttached) {
      return;
    }
    canvas.addEventListener("webglcontextlost", this.#onContextLost);
    canvas.addEventListener("webglcontextrestored", this.#onContextRestored);
    this.#listenersAttached = true;
  }

  #detachContextListeners(): void {
    const canvas = this.#canvas;
    if (canvas === null || !this.#listenersAttached) {
      return;
    }
    canvas.removeEventListener("webglcontextlost", this.#onContextLost);
    canvas.removeEventListener("webglcontextrestored", this.#onContextRestored);
    this.#listenersAttached = false;
  }

  #cancelScheduledFrame(): void {
    if (this.#scheduledFrame === null) {
      return;
    }
    this.#cancelFrame(this.#scheduledFrame);
    this.#scheduledFrame = null;
  }

  #disposePasses(): void {
    if (this.#passesDisposed) {
      return;
    }
    this.#passesDisposed = true;
    for (const pass of this.#passes) {
      try {
        pass.dispose();
      } catch {
        // Continue releasing independently owned resources.
      }
    }
  }

  #assertState(expected: RendererState, operation: string): void {
    if (this.#state !== expected) {
      throw new Error(`${operation} requires renderer state '${expected}', current state is '${this.#state}'`);
    }
  }
}

type ContextAcquisition =
  | { readonly status: "ready"; readonly gl: WebGL2RenderingContext }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

function acquireWebGL2(canvas: HTMLCanvasElement): ContextAcquisition {
  try {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (gl === null) {
      return { status: "unsupported", reason: "WebGL2 is unavailable" };
    }
    return { status: "ready", gl };
  } catch (error) {
    return { status: "failed", reason: reasonFrom(error) };
  }
}

function readCapabilities(gl: WebGL2RenderingContext): RendererInitResult {
  try {
    const maxTextureSize: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (
      typeof maxTextureSize !== "number" ||
      !Number.isFinite(maxTextureSize) ||
      maxTextureSize <= 0
    ) {
      return { status: "failed", reason: "WebGL2 reported an invalid maximum texture size" };
    }
    const capabilities: RendererCapabilities = Object.freeze({
      backend: "webgl2",
      maxTextureSize,
      supportsFloatColorBuffer: gl.getExtension("EXT_color_buffer_float") !== null,
      applicationTextureBudgetBytes: APPLICATION_TEXTURE_BUDGET_BYTES,
      applicationGpuBudgetBytes: APPLICATION_GPU_BUDGET_BYTES,
    });
    return { status: "ready", capabilities };
  } catch (error) {
    return { status: "failed", reason: reasonFrom(error) };
  }
}

function validateViewport(viewport: ViewportSnapshot): void {
  if (!Number.isFinite(viewport.cssWidth) || viewport.cssWidth < 0) {
    throw new Error("Viewport cssWidth must be a finite non-negative number");
  }
  if (!Number.isFinite(viewport.cssHeight) || viewport.cssHeight < 0) {
    throw new Error("Viewport cssHeight must be a finite non-negative number");
  }
  if (!Number.isFinite(viewport.devicePixelRatio) || viewport.devicePixelRatio <= 0) {
    throw new Error("Viewport devicePixelRatio must be a finite positive number");
  }
}

function sameViewport(a: ViewportSnapshot | null, b: ViewportSnapshot): boolean {
  return (
    a !== null &&
    a.cssWidth === b.cssWidth &&
    a.cssHeight === b.cssHeight &&
    a.devicePixelRatio === b.devicePixelRatio
  );
}

function defaultScheduleFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(performance.now()), 0);
}

function defaultCancelFrame(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  window.clearTimeout(handle);
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
