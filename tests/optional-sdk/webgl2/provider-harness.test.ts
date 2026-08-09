import { describe, expect, it } from "vitest";

import type { ImageAssetRef, ShadingFailureCode } from "@octopoly/contracts";

import {
  createScene,
  FakeImageResolver,
  fakeBitmap,
} from "../../renderer/core/fakes";
import {
  ContractGlslProvider,
  createWebGl2ProviderHarness,
} from "./harness";

function render(harness: Awaited<ReturnType<typeof createWebGl2ProviderHarness>>): void {
  harness.renderer.render(createScene());
  harness.scheduler.flush();
}

describe("contract-only GLSL ES 300 provider harness", () => {
  it.each([
    ["missing", "missing"],
    ["unsupported", "unsupported"],
    ["compile", "compile-failed"],
    ["uniforms", "uniforms-failed"],
    ["image", "image-unavailable"],
  ] as const)(
    "falls back from quality to realtime for a %s failure",
    async (failure, expectedCode: ShadingFailureCode) => {
      const quality = new ContractGlslProvider("quality");
      const realtime = new ContractGlslProvider("realtime");
      if (failure === "unsupported") {
        quality.supported = false;
      } else if (failure === "compile") {
        quality.descriptor = Object.freeze({
          ...quality.descriptor,
          vertexShader: "#version 300 es\nFAIL_COMPILE",
        });
      } else if (failure === "uniforms") {
        quality.uniformsError = new Error("uniform collection failed");
      } else if (failure === "image") {
        quality.uniformValues = Object.freeze({
          source: Object.freeze({
            id: "missing-image",
            revision: 0,
            width: 8,
            height: 8,
            colorSpace: "srgb",
          }),
        });
      }

      const providers = failure === "missing" ? [realtime] : [quality, realtime];
      const harness = await createWebGl2ProviderHarness({ providers });
      render(harness);

      expect(harness.lease.snapshot()).toMatchObject({
        candidates: ["quality", "realtime"],
        effectiveProviderId: "realtime",
        failures: [{ providerId: "quality", code: expectedCode }],
      });
      expect(harness.fallbackPass.renderCount).toBe(0);
      harness.renderer.dispose();
    },
  );

  it("isolates a quality link failure and compiles the realtime candidate", async () => {
    const quality = new ContractGlslProvider("quality");
    const realtime = new ContractGlslProvider("realtime");
    const harness = await createWebGl2ProviderHarness({ providers: [quality, realtime] });
    const original = harness.gl.getProgramParameter.bind(harness.gl);
    Object.defineProperty(harness.gl, "getProgramParameter", {
      configurable: true,
      value: (program: WebGLProgram, parameter: number): unknown => (
        harness.gl.createdPrograms[0] === program && parameter === harness.gl.LINK_STATUS
          ? false
          : original(program, parameter)
      ),
    });

    render(harness);

    expect(harness.lease.snapshot()).toMatchObject({
      effectiveProviderId: "realtime",
      failures: [{ providerId: "quality", code: "compile-failed" }],
    });
    expect(harness.gl.createdPrograms).toHaveLength(2);
    expect(harness.gl.deletedPrograms).toHaveLength(1);
    harness.renderer.dispose();
  });

  it("uses Core fallback when every candidate fails", async () => {
    const quality = new ContractGlslProvider("quality");
    const realtime = new ContractGlslProvider("realtime");
    quality.supported = false;
    realtime.uniformsError = new Error("realtime uniforms failed");
    const harness = await createWebGl2ProviderHarness({ providers: [quality, realtime] });

    render(harness);

    expect(harness.lease.snapshot().effectiveProviderId).toBeNull();
    expect(harness.lease.snapshot().failures.map((failure) => failure.code)).toEqual([
      "unsupported",
      "uniforms-failed",
    ]);
    expect(harness.fallbackPass.renderCount).toBe(1);
    harness.renderer.dispose();
  });

  it("invalidates image revisions and reacquires the current image after context restore", async () => {
    const image0: ImageAssetRef = Object.freeze({
      id: "paint",
      revision: 0,
      width: 4,
      height: 4,
      colorSpace: "srgb",
    });
    const image1: ImageAssetRef = Object.freeze({ ...image0, revision: 1 });
    const resolver = new FakeImageResolver();
    const quality = new ContractGlslProvider("quality");
    quality.uniformValues = Object.freeze({ source: image0 });
    const harness = await createWebGl2ProviderHarness({
      providers: [quality],
      candidates: ["quality"],
      images: resolver,
    });

    render(harness);
    expect(harness.lease.snapshot().failures[0]?.code).toBe("image-unavailable");
    expect(resolver.requested).toEqual([image0]);
    resolver.pending[0]?.resolve(fakeBitmap());
    await Promise.resolve();
    render(harness);
    expect(harness.lease.snapshot().effectiveProviderId).toBe("quality");
    expect(harness.gl.createdTextures).toHaveLength(1);

    quality.uniformValues = Object.freeze({ source: image1 });
    render(harness);
    expect(resolver.requested).toEqual([image0, image1]);
    expect(harness.gl.deletedTextures).toHaveLength(1);
    resolver.pending[1]?.resolve(fakeBitmap());
    await Promise.resolve();
    render(harness);
    expect(harness.lease.snapshot().effectiveProviderId).toBe("quality");

    resolver.emit({ kind: "updated", ref: image1, dirty: [] });
    render(harness);
    expect(resolver.requested).toEqual([image0, image1, image1]);
    resolver.pending[2]?.resolve(fakeBitmap());
    await Promise.resolve();
    render(harness);

    harness.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(harness.renderer.state()).toBe("context-lost");
    harness.canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(harness.renderer.state()).toBe("ready");
    harness.scheduler.flush();
    expect(resolver.requested).toEqual([image0, image1, image1, image1]);
    resolver.pending[3]?.resolve(fakeBitmap());
    await Promise.resolve();
    render(harness);
    expect(harness.lease.snapshot().effectiveProviderId).toBe("quality");
    expect(harness.gl.createdPrograms).toHaveLength(2);
    expect(harness.gl.createdTextures).toHaveLength(4);
    harness.renderer.dispose();
  });
});
