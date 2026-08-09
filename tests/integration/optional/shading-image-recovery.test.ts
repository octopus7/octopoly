import type {
  ImageAssetRef,
  ShadingCandidateFailure,
  ShadingProvider,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { WebGL2RenderExtensionRegistry } from "../../../src/renderer/core/extension-registry";
import { WebGlImageTextureCache } from "../../../src/renderer/core/image-texture-cache";
import {
  createFakeCanvas,
  fakeBitmap,
  FakeImageResolver,
  FakeShadingProvider,
} from "../../renderer/core/fakes";

describe("Full Optional shading and image recovery", () => {
  it("publishes candidate failures and restores only the previous live shading lease", () => {
    const registry = new WebGL2RenderExtensionRegistry();
    const paint = new FakeShadingProvider("texture-paint.preview");
    const quality = new FakeShadingProvider("lookdev.quality");
    const realtime = new FakeShadingProvider("lookdev.realtime");
    const matcap = new FakeShadingProvider("matcap");
    for (const provider of [paint, quality, realtime, matcap]) registry.register(provider);

    const paintLease = registry.activateScoped([paint.id]);
    registry.evaluateActive(() => null);
    expect(registry.active()).toBe(paint.id);

    const lookdevLease = registry.activateScoped([quality.id, realtime.id]);
    const lookdevSnapshot = registry.evaluateActive((provider) => (
      provider.id === quality.id
        ? failure(provider, "compile-failed", "quality shader compile fixture")
        : null
    ));
    expect(lookdevSnapshot).toMatchObject({
      effectiveProviderId: realtime.id,
      failures: [{ providerId: quality.id, code: "compile-failed" }],
    });

    const matcapLease = registry.activateScoped([matcap.id]);
    const failedMatcap = registry.evaluateActive((provider) => (
      provider.id === matcap.id
        ? failure(provider, "image-unavailable", "fixture image revision is unavailable")
        : null
    ));
    expect(failedMatcap).toMatchObject({
      candidates: [matcap.id],
      effectiveProviderId: null,
      failures: [{ providerId: matcap.id, code: "image-unavailable" }],
    });
    expect(registry.active()).toBeNull();

    // Releasing an older mode must not overwrite the newer explicit selection.
    lookdevLease.dispose();
    expect(registry.active()).toBeNull();
    registry.evaluateActive(() => null);
    expect(registry.active()).toBe(matcap.id);

    matcapLease.dispose();
    expect(registry.active()).toBe(paint.id);
    matcapLease.dispose();
    expect(registry.active()).toBe(paint.id);

    paintLease.dispose();
    expect(registry.active()).toBeNull();
    registry.dispose();
  });

  it("invalidates stale ImageAssetRef revisions and re-resolves CPU assets after GPU context restore", async () => {
    const firstContext = createFakeCanvas().gl;
    const restoredContext = createFakeCanvas().gl;
    const resolver = new FakeImageResolver();
    let invalidations = 0;
    const cache = new WebGlImageTextureCache(
      firstContext.asContext(),
      resolver,
      8192,
      512 * 1024 * 1024,
      () => { invalidations += 1; },
    );
    const revision1 = image("painted", 1);
    const revision2 = image("painted", 2);

    expect(cache.use(revision1)).toEqual({ status: "pending" });
    resolver.pending[0]?.resolve(fakeBitmap());
    await settlePromises();
    expect(cache.use(revision1).status).toBe("ready");
    expect(firstContext.textureUploadCount).toBe(1);

    expect(cache.use(revision2)).toEqual({ status: "pending" });
    expect(firstContext.deletedTextures).toHaveLength(1);
    resolver.pending[1]?.resolve(fakeBitmap());
    await settlePromises();
    expect(cache.use(revision2).status).toBe("ready");
    expect(firstContext.textureUploadCount).toBe(2);

    resolver.emit({
      kind: "updated",
      ref: revision2,
      dirty: [{ x: 0, y: 0, width: revision2.width, height: revision2.height }],
    });
    expect(cache.use(revision2).status).toBe("pending");
    resolver.pending[2]?.resolve(fakeBitmap());
    await settlePromises();
    expect(firstContext.textureUploadCount).toBe(3);

    const deletedBeforeLoss = firstContext.deletedTextures.length;
    cache.invalidateContext();
    expect(firstContext.deletedTextures).toHaveLength(deletedBeforeLoss);
    cache.restoreContext(restoredContext.asContext());
    expect(cache.use(revision2).status).toBe("pending");
    expect(resolver.requested.at(-1)).toEqual(revision2);
    resolver.pending[3]?.resolve(fakeBitmap());
    await settlePromises();
    expect(cache.use(revision2).status).toBe("ready");
    expect(restoredContext.textureUploadCount).toBe(1);
    expect(invalidations).toBeGreaterThanOrEqual(4);

    cache.dispose();
    cache.dispose();
    expect(restoredContext.deletedTextures).toHaveLength(1);
    expect(resolver.listeners.size).toBe(0);
  });
});

function image(id: string, revision: number): ImageAssetRef {
  return Object.freeze({ id, revision, width: 8, height: 8, colorSpace: "srgb" });
}

function failure(
  provider: ShadingProvider,
  code: ShadingCandidateFailure["code"],
  reason: string,
): ShadingCandidateFailure {
  return Object.freeze({ providerId: provider.id, code, reason });
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
