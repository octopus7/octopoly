import { describe, expect, it } from "vitest";

import type {
  ImageAssetRef,
  RendererCapabilities,
  RenderSceneSnapshot,
} from "@octopoly/contracts";

import {
  MATCAP_SHADING_PROVIDER_ID,
  WebGL2MatcapShadingProvider,
} from "../../../../src/extensions/matcap/webgl2";
import { createScene } from "../../../renderer/core/fakes";

const MEBIBYTE = 1024 * 1024;

function image(
  width = 256,
  height = width,
  revision = 0,
): ImageAssetRef {
  return Object.freeze({
    id: "matcap-clay",
    revision,
    width,
    height,
    colorSpace: "srgb",
  });
}

function capabilities(
  overrides: Partial<RendererCapabilities> = {},
): RendererCapabilities {
  return {
    backend: "webgl2",
    maxTextureSize: 4096,
    supportsFloatColorBuffer: false,
    applicationTextureBudgetBytes: 512 * MEBIBYTE,
    applicationGpuBudgetBytes: 256 * MEBIBYTE,
    ...overrides,
  };
}

describe("WebGL2MatcapShadingProvider", () => {
  it("uses a stable id and accepts the WebGL2 matrix at the exact image budget", () => {
    const provider = new WebGL2MatcapShadingProvider(image(1024));
    const rgba8Bytes = 1024 * 1024 * 4;

    expect(provider.id).toBe(MATCAP_SHADING_PROVIDER_ID);
    expect(provider.label).toBe("MatCap");
    expect(provider.supports(capabilities({
      maxTextureSize: 1024,
      applicationTextureBudgetBytes: rgba8Bytes,
      applicationGpuBudgetBytes: rgba8Bytes,
    }))).toBe(true);
  });

  it.each([
    ["WebGPU", { backend: "webgpu" as const }],
    ["texture width", { maxTextureSize: 1023 }],
    ["texture budget", { applicationTextureBudgetBytes: 1024 * 1024 * 4 - 1 }],
    ["GPU budget", { applicationGpuBudgetBytes: 1024 * 1024 * 4 - 1 }],
    ["malformed texture limit", { maxTextureSize: Number.NaN }],
    ["malformed texture budget", { applicationTextureBudgetBytes: -1 }],
    ["malformed GPU budget", { applicationGpuBudgetBytes: Number.POSITIVE_INFINITY }],
  ])("rejects unsupported %s capabilities", (_label, overrides) => {
    const provider = new WebGL2MatcapShadingProvider(image(1024));

    expect(provider.supports(capabilities(overrides))).toBe(false);
  });

  it("publishes one deeply immutable GLSL ES 3.00 view-normal descriptor", () => {
    const provider = new WebGL2MatcapShadingProvider(image());
    const first = provider.program();
    const second = provider.program();

    expect(first).toBe(second);
    expect(first.language).toBe("glsl-es-300");
    expect(first.vertexShader).toContain("mat3(uViewMatrix) * normal");
    expect(first.fragmentShader).toContain(
      "viewNormal.xy * vec2(0.5, -0.5) + vec2(0.5)",
    );
    expect(first.attributes).toEqual([
      { shaderName: "position", source: "position" },
      { shaderName: "normal", source: "normal" },
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.attributes)).toBe(true);
    expect(first.attributes?.every(Object.isFrozen)).toBe(true);
  });

  it("returns only finite public frame matrices and the active immutable image ref", () => {
    const initial = image();
    const active = image(512, 256, 7);
    const provider = new WebGL2MatcapShadingProvider(initial);
    provider.setImage(active);
    const scene = createScene();

    const uniforms = provider.uniforms({ scene });

    expect(uniforms).toEqual({
      uViewMatrix: scene.camera.view,
      uViewProjectionMatrix: scene.camera.viewProjection,
      uMatcapImage: active,
    });
    expect(provider.image()).toEqual(active);
    expect(provider.image()).not.toBe(active);
    expect(Object.isFrozen(provider.image())).toBe(true);
    expect(Object.isFrozen(uniforms)).toBe(true);
    expect(Object.values(uniforms)).toHaveLength(3);
  });

  it("rejects a non-finite public frame without changing the active image", () => {
    const active = image();
    const provider = new WebGL2MatcapShadingProvider(active);
    const scene = createScene();
    const invalidScene: RenderSceneSnapshot = {
      ...scene,
      camera: {
        ...scene.camera,
        view: {
          elements: scene.camera.view.elements.map((value, index) => (
            index === 9 ? Number.NaN : value
          )),
        },
      },
    };

    expect(() => provider.uniforms({ scene: invalidScene })).toThrow(/16 finite values/);
    expect(provider.image()).toEqual(active);
  });

  it("rejects invalid image refs before replacing the previous valid ref", () => {
    const active = image();
    const provider = new WebGL2MatcapShadingProvider(active);

    expect(() => provider.setImage({ ...active, width: 0 })).toThrow(/positive safe integer/);
    expect(provider.image()).toEqual(active);
  });

  it("disposes idempotently and refuses later provider use", () => {
    const provider = new WebGL2MatcapShadingProvider(image());

    provider.dispose();
    provider.dispose();

    expect(provider.supports(capabilities())).toBe(false);
    expect(() => provider.program()).toThrow(/disposed/);
    expect(() => provider.uniforms({ scene: createScene() })).toThrow(/disposed/);
    expect(() => provider.setImage(image(128))).toThrow(/disposed/);
    expect(() => provider.image()).toThrow(/disposed/);
  });
});
