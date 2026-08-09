import type {
  ExtensionHost,
  ExtensionStateBundle,
  ExtensionStateContribution,
  ExtensionStateProvider,
  ExtensionStateRegistry,
  RendererCapabilities,
  ShadingProgramDescriptor,
  ShadingProvider,
} from "@octopoly/contracts";

import {
  ContractTestRenderExtensionRegistry,
  createContractTestExtensionHost,
} from "../../../../src/optional-sdk/testkit";

export const QUALITY_CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 8_192,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 512 * 1024 * 1024,
  applicationGpuBudgetBytes: 256 * 1024 * 1024,
});

const PROGRAM: ShadingProgramDescriptor = Object.freeze({
  language: "glsl-es-300",
  vertexShader: "#version 300 es\nvoid main(){gl_Position=vec4(0.0);}",
  fragmentShader: "#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1.0);}",
});

export class TrackingProvider implements ShadingProvider {
  readonly label: string;
  disposeCount = 0;
  supported = true;

  constructor(
    readonly id: string,
    readonly events: string[] = [],
  ) {
    this.label = id;
  }

  supports(): boolean {
    return this.supported;
  }

  program(): ShadingProgramDescriptor {
    return PROGRAM;
  }

  uniforms(): Readonly<Record<string, never>> {
    return Object.freeze({});
  }

  dispose(): void {
    if (this.disposeCount > 0) return;
    this.disposeCount += 1;
    this.events.push(`dispose:${this.id}`);
  }
}

export class TrackingRenderRegistry extends ContractTestRenderExtensionRegistry {
  readonly events: string[];
  readonly failRegistrationId: string | null;

  constructor(
    events: string[],
    options: { readonly failRegistrationId?: string } = {},
  ) {
    super(QUALITY_CAPABILITIES);
    this.events = events;
    this.failRegistrationId = options.failRegistrationId ?? null;
  }

  override register(provider: ShadingProvider): void {
    this.events.push(`register:${provider.id}`);
    if (provider.id === this.failRegistrationId) {
      throw new Error(`registration rejected for ${provider.id}`);
    }
    super.register(provider);
  }

  override unregister(id: string): void {
    this.events.push(`unregister:${id}`);
    super.unregister(id);
  }
}

export class RejectingStateRegistry implements ExtensionStateRegistry {
  readonly #delegate: ExtensionStateRegistry;
  readonly #rejectedId: string;

  constructor(delegate: ExtensionStateRegistry, rejectedId: string) {
    this.#delegate = delegate;
    this.#rejectedId = rejectedId;
  }

  register(provider: ExtensionStateProvider): void {
    if (provider.id === this.#rejectedId) throw new Error(`state rejected for ${provider.id}`);
    this.#delegate.register(provider);
  }

  unregister(id: string): void {
    this.#delegate.unregister(id);
  }

  load(values: Readonly<Record<string, ExtensionStateContribution>>): Promise<void> {
    return this.#delegate.load(values);
  }

  save(): ExtensionStateBundle {
    return this.#delegate.save();
  }

  dispose(): void {
    this.#delegate.dispose();
  }
}

export function createHost(options: {
  readonly shading?: ContractTestRenderExtensionRegistry;
  readonly state?: ExtensionStateRegistry;
  readonly capabilities?: RendererCapabilities;
} = {}): ExtensionHost & { readonly base: ReturnType<typeof createContractTestExtensionHost> } {
  const base = createContractTestExtensionHost({
    capabilities: options.capabilities ?? QUALITY_CAPABILITIES,
    ...(options.state === undefined ? {} : { state: options.state }),
  });
  return {
    tools: base.tools,
    shading: options.shading ?? base.shading,
    images: base.images,
    panels: base.panels,
    renderer: base.renderer,
    modeling: base.modeling,
    state: options.state ?? base.state,
    dispose: () => base.dispose(),
    base,
  };
}
