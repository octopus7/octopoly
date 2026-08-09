import type {
  ImageAssetResolver,
  MeshTriangulationService,
  ShadingProgramDescriptor,
  ShadingProvider,
  ShadingSelectionLease,
  UniformValue,
} from "@octopoly/contracts";

import {
  WebGL2RendererService,
  WebGL2RenderExtensionRegistry,
} from "../../../src/renderer";
import {
  createFakeCanvas,
  FakeRenderPass,
  FakeTriangulationService,
  type FakeWebGL2Context,
  ManualFrameScheduler,
} from "../../renderer/core/fakes";

const VERTEX_SHADER = `#version 300 es
void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 color;
void main() { color = vec4(1.0); }`;

/** A provider fake whose complete public surface is the frozen ShadingProvider contract. */
export class ContractGlslProvider implements ShadingProvider {
  supported = true;
  descriptor: ShadingProgramDescriptor = Object.freeze({
    language: "glsl-es-300",
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  uniformValues: Readonly<Record<string, UniformValue>> = Object.freeze({});
  supportsError: Error | null = null;
  programError: Error | null = null;
  uniformsError: Error | null = null;
  disposeCount = 0;

  constructor(
    readonly id: string,
    readonly label = id,
  ) {}

  supports(): boolean {
    if (this.supportsError !== null) {
      throw this.supportsError;
    }
    return this.supported;
  }

  program(): ShadingProgramDescriptor {
    if (this.programError !== null) {
      throw this.programError;
    }
    return this.descriptor;
  }

  uniforms(): Readonly<Record<string, UniformValue>> {
    if (this.uniformsError !== null) {
      throw this.uniformsError;
    }
    return this.uniformValues;
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}

export interface WebGl2ProviderHarness {
  readonly canvas: HTMLCanvasElement;
  readonly gl: FakeWebGL2Context;
  readonly registry: WebGL2RenderExtensionRegistry;
  readonly lease: ShadingSelectionLease;
  readonly renderer: WebGL2RendererService;
  readonly scheduler: ManualFrameScheduler;
  readonly fallbackPass: FakeRenderPass;
}

export async function createWebGl2ProviderHarness(options: {
  readonly providers?: ReadonlyArray<ShadingProvider>;
  readonly candidates?: ReadonlyArray<string>;
  readonly images?: ImageAssetResolver;
  readonly triangulation?: MeshTriangulationService;
} = {}): Promise<WebGl2ProviderHarness> {
  const { canvas, gl } = createFakeCanvas();
  const registry = new WebGL2RenderExtensionRegistry();
  for (const provider of options.providers ?? []) {
    registry.register(provider);
  }
  const lease = registry.activateScoped(options.candidates ?? ["quality", "realtime"]);
  const scheduler = new ManualFrameScheduler();
  const fallbackPass = new FakeRenderPass("fallback");
  const renderer = new WebGL2RendererService(
    [fallbackPass],
    registry,
    scheduler.schedule,
    scheduler.cancel,
    options.triangulation ?? new FakeTriangulationService(),
  );
  const result = await renderer.initialize(canvas, options.images);
  if (result.status !== "ready") {
    throw new Error(`WebGL2 provider harness failed to initialize: ${result.reason}`);
  }
  return {
    canvas,
    gl,
    registry,
    lease,
    renderer,
    scheduler,
    fallbackPass,
  };
}
