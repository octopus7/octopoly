import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetResolver,
  ShadingCandidateFailure,
  ShadingProgramDescriptor,
  ShadingProvider,
  Unsubscribe,
} from "@octopoly/contracts";

import {
  LookdevMaterialStore,
  WebGL2PbrShadingProvider,
  WebGL2QualityShadingProvider,
} from "../../../src/extensions/lookdev";
import { WebGL2MatcapShadingProvider } from "../../../src/extensions/matcap";
import { TexturePreviewShadingProvider } from "../../../src/extensions/texture-paint";
import { WebGL2RenderExtensionRegistry } from "../../../src/renderer/core/extension-registry";
import { WebGlImageTextureCache } from "../../../src/renderer/core/image-texture-cache";

interface BrowserSmokeResult {
  readonly status: "PASS" | "FAIL" | "UNSUPPORTED";
  readonly browser: string;
  readonly maxTextureSize?: number;
  readonly providers?: ReadonlyArray<string>;
  readonly checks?: ReadonlyArray<{
    readonly id: string;
    readonly status: "PASS";
    readonly evidence: ReadonlyArray<string>;
  }>;
  readonly reason?: string;
}

const canvas = document.querySelector<HTMLCanvasElement>("#optional-smoke-canvas");
const output = document.querySelector<HTMLElement>("#optional-smoke-result");
if (canvas === null || output === null) throw new Error("Full Optional smoke DOM is incomplete");

const publish = (result: BrowserSmokeResult): void => {
  output.dataset.status = result.status.toLowerCase();
  output.textContent = JSON.stringify(result, null, 2);
};

const gl = canvas.getContext("webgl2");
if (gl === null) {
  publish({ status: "UNSUPPORTED", browser: navigator.userAgent, reason: "WebGL2 is unavailable" });
} else {
  void Promise.resolve().then(() => run(gl)).then(publish, (error: unknown) => {
    publish({
      status: "FAIL",
      browser: navigator.userAgent,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      reason: error instanceof Error ? error.message : String(error),
    });
  });
}

async function run(gl: WebGL2RenderingContext): Promise<BrowserSmokeResult> {
  const revision1 = imageRef("browser-optional-image", 1);
  const revision2 = imageRef("browser-optional-image", 2);
  const materials = new LookdevMaterialStore();
  const providers: ShadingProvider[] = [
    new TexturePreviewShadingProvider(() => revision2),
    new WebGL2PbrShadingProvider(materials),
    new WebGL2QualityShadingProvider(materials),
    new WebGL2MatcapShadingProvider(revision2),
  ];
  const compiled: string[] = [];
  try {
    for (const provider of providers) {
      compileAndLink(gl, provider.program());
      compiled.push(provider.id);
    }

    const registry = new WebGL2RenderExtensionRegistry();
    for (const provider of providers) registry.register(provider);
    const paint = registry.activateScoped([providers[0]!.id]);
    registry.evaluateActive(() => null);
    const lookdev = registry.activateScoped([providers[2]!.id, providers[1]!.id]);
    const fallback = registry.evaluateActive((provider) => (
      provider.id === providers[2]!.id
        ? failure(provider, "compile-failed", "browser fallback fixture")
        : null
    ));
    assert(fallback.effectiveProviderId === providers[1]!.id, "Quality did not fall back to Realtime");
    const matcap = registry.activateScoped([providers[3]!.id]);
    const unavailable = registry.evaluateActive((provider) => (
      provider.id === providers[3]!.id
        ? failure(provider, "image-unavailable", "browser image failure fixture")
        : provider.id === providers[2]!.id
          ? failure(provider, "compile-failed", "browser fallback fixture")
        : null
    ));
    assert(unavailable.effectiveProviderId === null, "Failed MatCap did not fall back to Core");
    matcap.dispose();
    assert(registry.active() === providers[1]!.id, "MatCap release did not restore Lookdev");
    lookdev.dispose();
    assert(registry.active() === providers[0]!.id, "Lookdev release did not restore Texture Preview");
    paint.dispose();
    registry.dispose();

    const resolver = new BrowserImageResolver();
    const cache = new WebGlImageTextureCache(
      gl,
      resolver,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      16 * 1024 * 1024,
      () => {},
    );
    const texture1 = await readyTexture(cache, revision1);
    const texture2 = await readyTexture(cache, revision2);
    assert(texture1 !== texture2, "Image revision reused a stale WebGL texture");
    resolver.emit({
      kind: "updated",
      ref: revision2,
      dirty: [{ x: 0, y: 0, width: revision2.width, height: revision2.height }],
    });
    const dirtyTexture = await readyTexture(cache, revision2);
    assert(dirtyTexture !== texture2, "Dirty image update did not invalidate the GPU cache");
    cache.invalidateContext();
    cache.restoreContext(gl);
    const restoredTexture = await readyTexture(cache, revision2);
    assert(restoredTexture !== dirtyTexture, "Context restore reused a lost GPU texture");
    cache.dispose();

    return {
      status: "PASS",
      browser: navigator.userAgent,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      providers: compiled,
      checks: [
        { id: "webgl2-context", status: "PASS", evidence: ["canvas.getContext(webgl2)"] },
        { id: "provider-compile-link", status: "PASS", evidence: compiled },
        { id: "image-upload-revision", status: "PASS", evidence: ["revision 1 -> 2 -> dirty re-upload"] },
        { id: "candidate-fallback-restore", status: "PASS", evidence: ["Quality -> Realtime -> MatCap failure -> restore"] },
        { id: "context-loss-restore", status: "PASS", evidence: ["GPU cache invalidateContext/restoreContext/re-resolve"] },
      ],
    };
  } catch (error) {
    for (const provider of providers) {
      try { provider.dispose(); } catch { /* continue smoke cleanup */ }
    }
    throw error;
  }
}

class BrowserImageResolver implements ImageAssetResolver {
  readonly #listeners = new Set<(event: ImageAssetEvent) => void>();

  async resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    const source = document.createElement("canvas");
    source.width = ref.width;
    source.height = ref.height;
    const context = source.getContext("2d");
    if (context === null) throw new Error("2D source context is unavailable");
    context.fillStyle = ref.revision % 2 === 0 ? "#ff00aa" : "#00aaff";
    context.fillRect(0, 0, source.width, source.height);
    return createImageBitmap(source);
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  emit(event: ImageAssetEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}

async function readyTexture(
  cache: WebGlImageTextureCache,
  ref: ImageAssetRef,
): Promise<WebGLTexture> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const lookup = cache.use(ref);
    if (lookup.status === "ready") return lookup.texture;
    if (lookup.status === "unavailable") throw new Error(lookup.reason);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(`Timed out uploading ${ref.id}@${ref.revision}`);
}

function compileAndLink(gl: WebGL2RenderingContext, descriptor: ShadingProgramDescriptor): void {
  assert(descriptor.language === "glsl-es-300", "Browser smoke requires GLSL ES 3.00");
  const vertex = compile(gl, gl.VERTEX_SHADER, descriptor.vertexShader);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, descriptor.fragmentShader);
  const program = gl.createProgram();
  if (program === null) throw new Error("WebGL2 program allocation failed");
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(gl.getProgramInfoLog(program) ?? "WebGL2 link failed");
    }
  } finally {
    gl.deleteProgram(program);
    gl.deleteShader(fragment);
    gl.deleteShader(vertex);
  }
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error("WebGL2 shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const reason = gl.getShaderInfoLog(shader) ?? "WebGL2 compile failed";
    gl.deleteShader(shader);
    throw new Error(reason);
  }
  return shader;
}

function imageRef(id: string, revision: number): ImageAssetRef {
  return Object.freeze({ id, revision, width: 8, height: 8, colorSpace: "srgb" });
}

function failure(
  provider: ShadingProvider,
  code: ShadingCandidateFailure["code"],
  reason: string,
): ShadingCandidateFailure {
  return Object.freeze({ providerId: provider.id, code, reason });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
