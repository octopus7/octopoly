import { describe, expect, it } from "vitest";

import type {
  ImageAssetRef,
  RendererCapabilities,
  ShadingFrameInput,
  UniformValue,
} from "@octopoly/contracts";

import {
  LookdevMaterialStore,
} from "../../../../../src/extensions/lookdev/material";
import {
  isLookdevRealtimeProgramWithinBudget,
  LOOKDEV_REALTIME_MIN_GPU_BUDGET_BYTES,
  LOOKDEV_REALTIME_MIN_MAX_TEXTURE_SIZE,
  LOOKDEV_REALTIME_MIN_TEXTURE_BUDGET_BYTES,
  LOOKDEV_REALTIME_PROGRAM,
  LOOKDEV_REALTIME_PROVIDER_ID,
  LOOKDEV_REALTIME_SHADER_BUDGET,
  WebGL2PbrShadingProvider,
} from "../../../../../src/extensions/lookdev/webgl2/realtime";
import { createScene } from "../../../../renderer/core/fakes";

const SUPPORTED: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: LOOKDEV_REALTIME_MIN_MAX_TEXTURE_SIZE,
  supportsFloatColorBuffer: false,
  applicationTextureBudgetBytes: LOOKDEV_REALTIME_MIN_TEXTURE_BUDGET_BYTES,
  applicationGpuBudgetBytes: LOOKDEV_REALTIME_MIN_GPU_BUDGET_BYTES,
});

describe("WebGL2PbrShadingProvider", () => {
  it("uses a deterministic WebGL2 mobile capability gate", () => {
    const provider = new WebGL2PbrShadingProvider(new LookdevMaterialStore());
    expect(provider.id).toBe(LOOKDEV_REALTIME_PROVIDER_ID);
    expect(provider.supports(SUPPORTED)).toBe(true);
    expect(provider.supports({ ...SUPPORTED, supportsFloatColorBuffer: true })).toBe(true);

    expect(provider.supports({ ...SUPPORTED, backend: "webgpu" })).toBe(false);
    expect(provider.supports({
      ...SUPPORTED,
      maxTextureSize: LOOKDEV_REALTIME_MIN_MAX_TEXTURE_SIZE - 1,
    })).toBe(false);
    expect(provider.supports({
      ...SUPPORTED,
      applicationTextureBudgetBytes: LOOKDEV_REALTIME_MIN_TEXTURE_BUDGET_BYTES - 1,
    })).toBe(false);
    expect(provider.supports({
      ...SUPPORTED,
      applicationGpuBudgetBytes: LOOKDEV_REALTIME_MIN_GPU_BUDGET_BYTES - 1,
    })).toBe(false);
    expect(provider.supports({ ...SUPPORTED, maxTextureSize: Number.NaN })).toBe(false);
    expect(provider.supports({ ...SUPPORTED, applicationGpuBudgetBytes: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("publishes one immutable GLSL ES 3.00 program inside the shader budget", () => {
    const provider = new WebGL2PbrShadingProvider(new LookdevMaterialStore());
    const first = provider.program();
    const second = provider.program();

    expect(first).toBe(second);
    expect(first).toBe(LOOKDEV_REALTIME_PROGRAM);
    expect(first.language).toBe("glsl-es-300");
    expect(first.vertexShader.startsWith("#version 300 es")).toBe(true);
    expect(first.fragmentShader.startsWith("#version 300 es")).toBe(true);
    expect(first.attributes).toEqual([
      { shaderName: "position", source: "position" },
      { shaderName: "normal", source: "normal" },
    ]);
    expect(first.fragmentShader).toContain("distributionGgx");
    expect(first.fragmentShader).toContain("uEnvironmentUpper");
    expect(first.fragmentShader).toContain("acesToneMap");
    expect(isLookdevRealtimeProgramWithinBudget(first)).toBe(true);
    expect(first.vertexShader.length).toBeLessThanOrEqual(LOOKDEV_REALTIME_SHADER_BUDGET.maxVertexSourceBytes);
    expect(first.fragmentShader.length).toBeLessThanOrEqual(LOOKDEV_REALTIME_SHADER_BUDGET.maxFragmentSourceBytes);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.attributes)).toBe(true);
  });

  it("uses finite scalar defaults when maps and material selection are missing", () => {
    const provider = new WebGL2PbrShadingProvider(new LookdevMaterialStore());
    const uniforms = provider.uniforms(frame());

    expect(uniforms.uHasBaseColorMap).toBe(0);
    expect(uniforms.uHasMetallicMap).toBe(0);
    expect(uniforms.uHasRoughnessMap).toBe(0);
    expect(uniforms.uHasNormalMap).toBe(0);
    expect(uniforms.uHasEmissiveMap).toBe(0);
    expect(uniforms.uHasOpacityMap).toBe(0);
    expect(uniforms).not.toHaveProperty("uBaseColorMap");
    expect(Object.values(uniforms).every(finiteUniform)).toBe(true);
    expect(Object.isFrozen(uniforms)).toBe(true);
  });

  it("publishes validated ImageAssetRef revisions and clamps hostile material numbers", () => {
    const baseColor: ImageAssetRef = Object.freeze({
      id: "base-color",
      revision: 7,
      width: 512,
      height: 256,
      colorSpace: "srgb",
    });
    const materials = new LookdevMaterialStore();
    materials.set({
      id: "painted",
      baseColor: { x: Number.NaN, y: -5, z: 4 },
      metallic: Number.POSITIVE_INFINITY,
      roughness: -1,
      normalScale: Number.NaN,
      emissive: { x: Number.NaN, y: 2, z: -3 },
      opacity: 5,
      textures: { baseColor },
    });
    const provider = new WebGL2PbrShadingProvider(materials);
    const uniforms = provider.uniforms(frame("painted"));

    expect(uniforms.uHasBaseColorMap).toBe(1);
    expect(uniforms.uBaseColorMap).toEqual(baseColor);
    expect(Object.values(uniforms).every(finiteUniform)).toBe(true);
  });

  it("replaces non-finite camera uniforms before they cross the Renderer boundary", () => {
    const provider = new WebGL2PbrShadingProvider(new LookdevMaterialStore());
    const input = frame();
    const hostile: ShadingFrameInput = {
      ...input,
      scene: {
        ...input.scene,
        camera: {
          ...input.scene.camera,
          position: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
          viewProjection: { elements: [1, 0, Number.NaN] },
        },
      },
    };
    const uniforms = provider.uniforms(hostile);

    expect(uniforms.uCameraPosition).toEqual({ x: 0, y: 0, z: 5 });
    expect(uniforms.uViewProjection).toEqual({ elements: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ] });
    expect(Object.values(uniforms).every(finiteUniform)).toBe(true);
  });
});

function frame(material?: string): ShadingFrameInput {
  const scene = createScene();
  return material === undefined ? { scene } : { scene, material };
}

function finiteUniform(value: UniformValue): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(Number.isFinite);
  }
  if ("elements" in value) {
    return value.elements.length === 16 && value.elements.every(Number.isFinite);
  }
  if ("id" in value) {
    return (
      Number.isFinite(value.revision) &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height)
    );
  }
  return Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
