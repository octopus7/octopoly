import { describe, expect, it } from "vitest";

import type { ImageAssetRef } from "@octopoly/contracts";

import { WebGL2MatcapShadingProvider } from "../../../../src/extensions/matcap/webgl2";
import {
  FakeImageResolver,
  createScene,
  fakeBitmap,
} from "../../../renderer/core/fakes";
import { createWebGl2ProviderHarness } from "../../../optional-sdk/webgl2/harness";

function render(harness: Awaited<ReturnType<typeof createWebGl2ProviderHarness>>): void {
  harness.renderer.render(createScene());
  harness.scheduler.flush();
}

function image(): ImageAssetRef {
  return Object.freeze({
    id: "matcap-smoke",
    revision: 3,
    width: 64,
    height: 64,
    colorSpace: "srgb",
  });
}

describe("MatCap WebGL2 provider harness", () => {
  it("compiles and links the GLSL ES 3.00 program before resolving the image", async () => {
    const activeImage = image();
    const resolver = new FakeImageResolver();
    const provider = new WebGL2MatcapShadingProvider(activeImage);
    const harness = await createWebGl2ProviderHarness({
      providers: [provider],
      candidates: [provider.id],
      images: resolver,
    });

    render(harness);

    expect(harness.gl.createdPrograms).toHaveLength(1);
    expect(harness.gl.deletedShaders).toHaveLength(2);
    expect(harness.gl.deletedShaders.map((shader) => shader.source)).toEqual([
      provider.program().vertexShader,
      provider.program().fragmentShader,
    ]);
    expect(harness.lease.snapshot()).toMatchObject({
      candidates: [provider.id],
      effectiveProviderId: null,
      failures: [{ providerId: provider.id, code: "image-unavailable" }],
    });
    expect(resolver.requested).toEqual([activeImage]);

    resolver.pending[0]?.resolve(fakeBitmap());
    await Promise.resolve();
    render(harness);

    expect(harness.lease.snapshot()).toEqual({
      candidates: [provider.id],
      effectiveProviderId: provider.id,
      failures: [],
    });
    expect(harness.fallbackPass.renderCount).toBe(1);
    expect(harness.gl.uniformCalls).toContain("m4");
    expect(harness.gl.uniformCalls).toContain("1i");
    expect(harness.gl.drawCalls).toEqual([[harness.gl.TRIANGLES, 0, 0]]);

    harness.renderer.dispose();
    harness.registry.dispose();
  });

  it("leaves Core fallback active when MatCap linking fails", async () => {
    const provider = new WebGL2MatcapShadingProvider(image());
    const harness = await createWebGl2ProviderHarness({
      providers: [provider],
      candidates: [provider.id],
    });
    harness.gl.linkSucceeds = false;

    render(harness);

    expect(harness.lease.snapshot()).toMatchObject({
      effectiveProviderId: null,
      failures: [{ providerId: provider.id, code: "compile-failed" }],
    });
    expect(harness.fallbackPass.renderCount).toBe(1);
    expect(harness.gl.deletedPrograms).toHaveLength(1);

    harness.renderer.dispose();
    harness.registry.dispose();
  });
});
