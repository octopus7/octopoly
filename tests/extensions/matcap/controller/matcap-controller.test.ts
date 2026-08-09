import type {
  ImageAssetRef,
  RendererCapabilities,
  ShadingProgramDescriptor,
  ShadingProvider,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  MatcapController,
  MatcapStateProvider,
  MATCAP_STATE_SCHEMA_VERSION,
  type MatcapImageSelectionSource,
} from "../../../../src/extensions/matcap/controller";
import type { MatcapImageSelectionResult } from "../../../../src/extensions/matcap/image";
import type { MatcapPresetId } from "../../../../src/extensions/matcap/presets";
import {
  MATCAP_SHADING_PROVIDER_ID,
  WebGL2MatcapShadingProvider,
} from "../../../../src/extensions/matcap/webgl2";
import { createContractTestExtensionHost } from "../../../../src/optional-sdk/testkit";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 32 * 1024 * 1024,
  applicationGpuBudgetBytes: 64 * 1024 * 1024,
});

function image(id: string, revision = 0): ImageAssetRef {
  return Object.freeze({ id, revision, width: 256, height: 256, colorSpace: "srgb" });
}

class ImageSource implements MatcapImageSelectionSource {
  #current: ImageAssetRef;
  nextFailure: Extract<MatcapImageSelectionResult, { status: "failed" }> | null = null;

  constructor(initial: ImageAssetRef) {
    this.#current = initial;
  }

  current(): ImageAssetRef {
    return this.#current;
  }

  selectPreset(id: MatcapPresetId): Promise<MatcapImageSelectionResult> {
    return this.#result(image(`preset:${id}`));
  }

  importCustom(_source: Blob): Promise<MatcapImageSelectionResult> {
    return this.#result(image("custom:imported", 3));
  }

  selectCustom(ref: ImageAssetRef): Promise<MatcapImageSelectionResult> {
    return this.#result(ref);
  }

  #result(next: ImageAssetRef): Promise<MatcapImageSelectionResult> {
    if (this.nextFailure !== null) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      return Promise.resolve(failure);
    }
    const previous = this.#current;
    this.#current = next;
    return Promise.resolve(Object.freeze({ status: "selected", ref: next, previous }));
  }
}

function pbrProvider(): ShadingProvider {
  const descriptor: ShadingProgramDescriptor = Object.freeze({
    language: "glsl-es-300",
    vertexShader: "#version 300 es\nvoid main(){gl_Position=vec4(0.0);}",
    fragmentShader: "#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1.0);}",
  });
  return {
    id: "optional.pbr",
    label: "PBR",
    supports: () => true,
    program: () => descriptor,
    uniforms: () => Object.freeze({}),
    dispose: vi.fn(),
  };
}

function setup() {
  const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
  const initial = image("preset:clay");
  const images = new ImageSource(initial);
  const provider = new WebGL2MatcapShadingProvider(initial);
  host.shading.register(provider);
  const controller = new MatcapController({
    shading: host.shading,
    renderer: host.renderer,
    provider,
    images,
    initialPresetId: "clay",
    initialImage: initial,
  });
  return { host, images, provider, controller };
}

describe("MatcapController", () => {
  it("switches presets/custom images and retains the previous valid selection on failure", async () => {
    const { host, images, provider, controller } = setup();

    await expect(controller.selectPreset("metallic")).resolves.toMatchObject({ status: "selected" });
    expect(provider.image().id).toBe("preset:metallic");
    expect(controller.snapshot().previousValidPresetId).toBe("metallic");

    images.nextFailure = Object.freeze({
      status: "failed",
      code: "decode-failed",
      issue: "decode-failed",
      reason: "decode rejected",
      retained: provider.image(),
    });
    await expect(controller.importCustom(new Blob(["bad"]))).resolves.toMatchObject({
      status: "retained",
      reason: { code: "decode-failed" },
    });
    expect(provider.image().id).toBe("preset:metallic");
    expect(controller.snapshot().fallbackReason?.message).toBe("decode rejected");

    await controller.importCustom(new Blob(["valid"]));
    expect(provider.image()).toMatchObject({ id: "custom:imported", revision: 3 });
    expect(controller.snapshot()).toMatchObject({
      selection: { kind: "custom" },
      previousValidPresetId: "metallic",
      fallbackReason: null,
    });

    controller.dispose();
    host.dispose();
  });

  it("uses a scoped lease and restores the previous provider selection", () => {
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const pbr = pbrProvider();
    host.shading.register(pbr);
    const pbrLease = host.shading.activateScoped([pbr.id]);
    const initial = image("preset:clay");
    const provider = new WebGL2MatcapShadingProvider(initial);
    host.shading.register(provider);
    const controller = new MatcapController({
      shading: host.shading,
      renderer: host.renderer,
      provider,
      images: new ImageSource(initial),
      initialPresetId: "clay",
      initialImage: initial,
    });

    expect(host.shading.active()).toBe("optional.pbr");
    controller.setEnabled(true);
    expect(host.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);
    controller.setEnabled(false);
    expect(host.shading.active()).toBe("optional.pbr");

    controller.dispose();
    pbrLease.dispose();
    host.dispose();
  });

  it("projects renderer candidate failures into disabled panel state", () => {
    const { host, controller } = setup();
    controller.setEnabled(true);
    host.shading.fail(MATCAP_SHADING_PROVIDER_ID, "compile-failed", "shader rejected");

    expect(controller.snapshot()).toMatchObject({
      enabled: true,
      disabledReason: {
        code: "compile-failed",
        message: "shader rejected",
        source: "renderer",
      },
      shading: { effectiveProviderId: null },
    });

    controller.dispose();
    host.dispose();
  });

  it("migrates legacy state and persists one exact custom image revision", async () => {
    const { host, controller } = setup();
    const state = new MatcapStateProvider(controller);
    const custom = image("saved-custom", 11);

    await state.load({
      schemaVersion: 1,
      data: Object.freeze({ enabled: true, customImage: Object.freeze({ ...custom }) }),
      imageAssets: Object.freeze([custom, custom]),
    });

    expect(controller.snapshot()).toMatchObject({
      enabled: true,
      selection: { kind: "custom", image: { id: "saved-custom", revision: 11 } },
    });
    expect(state.save()).toEqual({
      schemaVersion: MATCAP_STATE_SCHEMA_VERSION,
      data: {
        enabled: true,
        selection: { kind: "custom", image: custom },
      },
      imageAssets: [custom],
    });

    state.dispose();
    controller.dispose();
    host.dispose();
  });

  it("rejects invalid migrated preset ids without changing controller state", async () => {
    const { host, controller } = setup();
    const state = new MatcapStateProvider(controller);
    await expect(state.load({
      schemaVersion: 1,
      data: { enabled: true, presetId: "not-a-preset" },
    })).rejects.toThrow("Legacy MatCap preset id is invalid");
    expect(controller.snapshot()).toMatchObject({
      enabled: false,
      selection: { kind: "preset", presetId: "clay" },
    });
    state.dispose();
    controller.dispose();
    host.dispose();
  });
});
