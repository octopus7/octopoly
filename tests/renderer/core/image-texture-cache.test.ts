import { describe, expect, it } from "vitest";
import type { ImageAssetRef } from "@octopoly/contracts";

import { WebGlImageTextureCache } from "../../../src/renderer/core/image-texture-cache";
import {
  createFakeCanvas,
  fakeBitmap,
  FakeImageResolver,
} from "./fakes";

describe("WebGlImageTextureCache", () => {
  it("prevents an out-of-order stale revision from uploading over the active revision", async () => {
    const { gl } = createFakeCanvas();
    const resolver = new FakeImageResolver();
    let invalidations = 0;
    const cache = new WebGlImageTextureCache(
      gl.asContext(),
      resolver,
      8192,
      512 * 1024 * 1024,
      () => { invalidations += 1; },
    );
    const revision1 = imageRef("paint", 1);
    const revision2 = imageRef("paint", 2);

    expect(cache.use(revision1).status).toBe("pending");
    expect(cache.use(revision2).status).toBe("pending");
    expect(resolver.requested).toEqual([revision1, revision2]);

    const latest = fakeBitmap();
    resolver.pending[1]?.resolve(latest);
    await settlePromises();
    expect(cache.use(revision2).status).toBe("ready");
    expect(gl.textureUploadCount).toBe(1);
    expect(latest.closeCount).toBe(1);

    const stale = fakeBitmap();
    resolver.pending[0]?.resolve(stale);
    await settlePromises();
    expect(stale.closeCount).toBe(1);
    expect(gl.textureUploadCount).toBe(1);
    expect(cache.use(revision2).status).toBe("ready");
    expect(invalidations).toBe(1);
  });

  it("invalidates only the exact dirty revision and all revisions for a removed id", async () => {
    const { gl } = createFakeCanvas();
    const resolver = new FakeImageResolver();
    const cache = new WebGlImageTextureCache(
      gl.asContext(),
      resolver,
      8192,
      512 * 1024 * 1024,
      () => {},
    );
    const first = imageRef("first", 4);
    const second = imageRef("second", 7);
    cache.use(first);
    cache.use(second);
    resolver.pending[0]?.resolve(fakeBitmap());
    resolver.pending[1]?.resolve(fakeBitmap());
    await settlePromises();
    expect(gl.textureUploadCount).toBe(2);

    resolver.emit({
      kind: "updated",
      ref: first,
      dirty: [{ x: 0, y: 0, width: 1, height: 1 }],
    });
    expect(gl.deletedTextures).toHaveLength(1);
    expect(cache.use(second).status).toBe("ready");
    expect(resolver.requested).toHaveLength(2);
    expect(cache.use(first).status).toBe("pending");
    expect(resolver.requested).toHaveLength(3);
    resolver.pending[2]?.resolve(fakeBitmap());
    await settlePromises();

    resolver.emit({ kind: "removed", id: "second" });
    expect(gl.deletedTextures).toHaveLength(2);
    expect(cache.use(first).status).toBe("ready");
    expect(cache.use(second).status).toBe("pending");
    expect(resolver.requested).toHaveLength(4);
  });

  it("abandons lost-context handles, re-resolves on restore, and disposes once", async () => {
    const { gl } = createFakeCanvas();
    const resolver = new FakeImageResolver();
    const cache = new WebGlImageTextureCache(
      gl.asContext(),
      resolver,
      8192,
      512 * 1024 * 1024,
      () => {},
    );
    const ref = imageRef("restore", 3);
    cache.use(ref);
    resolver.pending[0]?.resolve(fakeBitmap());
    await settlePromises();
    expect(gl.textureUploadCount).toBe(1);

    const pendingRef = imageRef("pending-during-loss", 1);
    cache.use(pendingRef);
    const staleBitmap = fakeBitmap();

    cache.invalidateContext();
    expect(gl.deletedTextures).toHaveLength(0);
    resolver.pending[1]?.resolve(staleBitmap);
    await settlePromises();
    expect(staleBitmap.closeCount).toBe(1);
    expect(gl.textureUploadCount).toBe(1);
    cache.restoreContext(gl.asContext());
    expect(cache.use(ref).status).toBe("pending");
    resolver.pending[2]?.resolve(fakeBitmap());
    await settlePromises();
    expect(gl.textureUploadCount).toBe(2);

    cache.dispose();
    cache.dispose();
    expect(gl.deletedTextures).toHaveLength(1);
    expect(resolver.listeners.size).toBe(0);
  });

  it("returns image-unavailable reasons without a resolver or outside limits", () => {
    const { gl } = createFakeCanvas();
    const noResolver = new WebGlImageTextureCache(
      gl.asContext(),
      undefined,
      1024,
      1024,
      () => {},
    );
    expect(noResolver.use(imageRef("asset", 0)).status).toBe("unavailable");

    const resolver = new FakeImageResolver();
    const limited = new WebGlImageTextureCache(
      gl.asContext(),
      resolver,
      16,
      16 * 16 * 4,
      () => {},
    );
    const oversized = { ...imageRef("large", 0), width: 32 };
    expect(limited.use(oversized)).toEqual({
      status: "unavailable",
      reason: "Image exceeds WebGL2 max texture size 16",
    });
    expect(resolver.requested).toEqual([]);
  });
});

function imageRef(id: string, revision: number): ImageAssetRef {
  return Object.freeze({
    id,
    revision,
    width: 8,
    height: 8,
    colorSpace: "srgb",
  });
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
