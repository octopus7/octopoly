import { describe, expect, it } from "vitest";

import type { ImageAssetRef, RendererCapabilities, UniformValue } from "@octopoly/contracts";
import { LookdevMaterialStore } from "../../../../../src/extensions/lookdev/material";
import {
  LOOKDEV_QUALITY_MIN_GPU_BUDGET_BYTES,
  LOOKDEV_QUALITY_MIN_MAX_TEXTURE_SIZE,
  LOOKDEV_QUALITY_MIN_TEXTURE_BUDGET_BYTES,
  LOOKDEV_QUALITY_PROGRAM,
  LOOKDEV_QUALITY_PROVIDER_ID,
  WebGL2QualityShadingProvider,
  isLookdevQualityProgramWithinBudget,
  lookdevQualitySupportFailure,
} from "../../../../../src/extensions/lookdev/webgl2/quality";
import { createScene } from "../../../../renderer/core/fakes";
import { createWebGl2ProviderHarness } from "../../../../optional-sdk/webgl2/harness";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: LOOKDEV_QUALITY_MIN_MAX_TEXTURE_SIZE,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: LOOKDEV_QUALITY_MIN_TEXTURE_BUDGET_BYTES,
  applicationGpuBudgetBytes: LOOKDEV_QUALITY_MIN_GPU_BUDGET_BYTES,
});

describe("WebGL2QualityShadingProvider", () => {
  it("gates backend, capability, and application budgets deterministically", () => {
    const provider = new WebGL2QualityShadingProvider(new LookdevMaterialStore());
    expect(provider.supports(CAPABILITIES)).toBe(true);

    const cases: ReadonlyArray<readonly [Partial<RendererCapabilities>, string]> = [
      [{ backend: "webgpu" }, "unsupported-backend"],
      [{ supportsFloatColorBuffer: false }, "unsupported-capability"],
      [{ maxTextureSize: LOOKDEV_QUALITY_MIN_MAX_TEXTURE_SIZE - 1 }, "unsupported-capability"],
      [{ applicationTextureBudgetBytes: LOOKDEV_QUALITY_MIN_TEXTURE_BUDGET_BYTES - 1 }, "resource-budget"],
      [{ applicationGpuBudgetBytes: LOOKDEV_QUALITY_MIN_GPU_BUDGET_BYTES - 1 }, "resource-budget"],
      [{ applicationGpuBudgetBytes: Number.NaN }, "resource-budget"],
    ];
    for (const [override, expectedCode] of cases) {
      const capabilities = Object.freeze({ ...CAPABILITIES, ...override });
      expect(provider.supports(capabilities)).toBe(false);
      expect(lookdevQualitySupportFailure(capabilities)?.code).toBe(expectedCode);
    }
  });

  it("publishes one immutable GLSL ES 3.00 pass within the mobile shader budget", () => {
    const provider = new WebGL2QualityShadingProvider(new LookdevMaterialStore());
    const descriptor = provider.program();

    expect(descriptor).toBe(LOOKDEV_QUALITY_PROGRAM);
    expect(descriptor.language).toBe("glsl-es-300");
    expect(descriptor.vertexShader).toMatch(/^#version 300 es/u);
    expect(descriptor.fragmentShader).toMatch(/^#version 300 es/u);
    expect(descriptor.defines).toEqual({ LOOKDEV_QUALITY_SINGLE_PASS: true });
    expect(descriptor.attributes).toEqual([
      { shaderName: "position", source: "position" },
      { shaderName: "normal", source: "normal" },
    ]);
    expect(isLookdevQualityProgramWithinBudget(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(`${descriptor.vertexShader}\n${descriptor.fragmentShader}`).not.toMatch(
      /framebuffer|renderTarget|accumulation/iu,
    );
  });

  it("emits finite scalar fallbacks and preserves exact image revisions", () => {
    const ref: ImageAssetRef = Object.freeze({
      id: "painted-base",
      revision: 7,
      width: 256,
      height: 128,
      colorSpace: "srgb",
    });
    const materials = new LookdevMaterialStore();
    materials.set({
      id: "painted",
      baseColor: { x: 0.2, y: 0.3, z: 0.4 },
      metallic: 0.7,
      roughness: 0.18,
      textures: { baseColor: ref },
    });
    const provider = new WebGL2QualityShadingProvider(materials);
    const uniforms = provider.uniforms({ scene: createScene(), material: "painted" });

    expect(uniforms.uBaseColorMap).toEqual(ref);
    expect(uniforms.uHasBaseColorMap).toBe(1);
    expect(uniforms.uHasNormalMap).toBe(0);
    expect(uniforms).not.toHaveProperty("uNormalMap");
    expect(Object.isFrozen(uniforms)).toBe(true);
    expect(allNumbers(uniforms).every(Number.isFinite)).toBe(true);
  });

  it("compiles, links, and renders through the canonical provider harness", async () => {
    const provider = new WebGL2QualityShadingProvider(new LookdevMaterialStore());
    const harness = await createWebGl2ProviderHarness({
      providers: [provider],
      candidates: [LOOKDEV_QUALITY_PROVIDER_ID],
    });

    harness.renderer.render(createScene());
    harness.scheduler.flush();

    expect(harness.lease.snapshot()).toMatchObject({
      effectiveProviderId: LOOKDEV_QUALITY_PROVIDER_ID,
      failures: [],
    });
    expect(harness.gl.createdPrograms).toHaveLength(1);
    expect(harness.gl.drawCalls).toHaveLength(1);
    harness.renderer.dispose();
  });
});

function allNumbers(uniforms: Readonly<Record<string, UniformValue>>): number[] {
  const numbers: number[] = [];
  for (const value of Object.values(uniforms)) {
    if (typeof value === "number") {
      numbers.push(value);
    } else if (isNumberArray(value)) {
      numbers.push(...value);
    } else if ("elements" in value) {
      numbers.push(...value.elements);
    } else if (!("id" in value)) {
      numbers.push(value.x, value.y);
      if ("z" in value) numbers.push(value.z);
      if ("w" in value) numbers.push(value.w);
    }
  }
  return numbers;
}

function isNumberArray(value: UniformValue): value is ReadonlyArray<number> {
  return Array.isArray(value);
}
