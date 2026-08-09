import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  Unsubscribe,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  TexturePaintImageController,
  type TextureImagePixelDecoder,
} from "../../../../src/extensions/texture-paint/image";
import { ContractTestImageAssetService } from "../../../../src/optional-sdk/testkit";
import {
  TexturePaintBrushController,
  TexturePaintStateProvider,
} from "../../../../src/extensions/texture-paint/extension";
import {
  FakePremultipliedPixelDecoder,
  ReplacementImageAssetService,
  solidPixels,
} from "./replacement-image-fake";

const BASE: ImageAssetRef = Object.freeze({
  id: "base",
  revision: 0,
  width: 4,
  height: 4,
  colorSpace: "srgb",
});

const TRANSPARENT_DECODER: TextureImagePixelDecoder = Object.freeze({
  decode: async (_bitmap: ImageBitmap, ref: ImageAssetRef) => (
    new Uint8ClampedArray(ref.width * ref.height * 4)
  ),
});

class FailingImageService implements ImageAssetService {
  readonly delegate: ContractTestImageAssetService;
  failImport = false;
  failPrepare = false;
  failFlush = false;
  failRemove = false;

  constructor(delegate = new ContractTestImageAssetService()) {
    this.delegate = delegate;
  }

  import(source: Blob): Promise<ImageAssetRef> {
    return this.failImport
      ? Promise.reject(new Error("decode failed"))
      : this.delegate.import(source);
  }
  current(id: string): ImageAssetRef | null { return this.delegate.current(id); }
  prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    return this.failPrepare
      ? Promise.reject(new Error("prepare failed"))
      : this.delegate.prepareEdit(ref);
  }
  remove(id: string): Promise<void> {
    return this.failRemove
      ? Promise.reject(new Error("remove failed"))
      : this.delegate.remove(id);
  }
  flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void> {
    return this.failFlush
      ? Promise.reject(new Error("flush failed"))
      : this.delegate.flush(refs);
  }
  resolve(ref: ImageAssetRef): Promise<ImageBitmap> { return this.delegate.resolve(ref); }
  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    return this.delegate.subscribe(listener);
  }
  dispose(): void { this.delegate.dispose(); }
}

describe("TexturePaintImageController", () => {
  it("keeps the previous prepared image when import, prepare, or flush fails", async () => {
    const service = new FailingImageService();
    service.delegate.seed(BASE);
    const controller = new TexturePaintImageController(service, undefined, TRANSPARENT_DECODER);
    expect(await controller.selectImage(BASE)).toMatchObject({ status: "ready", ref: BASE });

    service.failImport = true;
    await expect(controller.importImage(new Blob(["broken"]))).resolves.toMatchObject({
      status: "failed",
      reason: "image-unavailable",
    });
    expect(controller.status()).toMatchObject({ active: BASE, ready: true, reason: null });

    service.failPrepare = true;
    await expect(controller.selectImage(BASE)).resolves.toMatchObject({
      status: "failed",
      reason: "image-unavailable",
    });
    expect(controller.status()).toMatchObject({
      active: BASE,
      ready: false,
      reason: "image-preparing",
    });

    service.failFlush = true;
    await expect(controller.flushActive()).rejects.toThrow("flush failed");
    expect(controller.activeImage()).toEqual(BASE);
    controller.dispose();
  });

  it("removes a newly imported image that exceeds the texture budget", async () => {
    const service = new ContractTestImageAssetService({ importWidth: 8, importHeight: 8 });
    service.seed(BASE);
    const controller = new TexturePaintImageController(service, {
      maxTextureSize: 16,
      maxBytes: 8 * 8 * 4 - 1,
    }, TRANSPARENT_DECODER);
    await controller.selectImage(BASE);

    await expect(controller.importImage(new Blob(["large"]))).resolves.toEqual({
      status: "failed",
      reason: "image-over-budget",
    });
    expect(service.current("contract-test-image-1")).toBeNull();
    expect(controller.status()).toMatchObject({ active: BASE, ready: true });
    controller.dispose();
  });

  it("cancels its prepared edit session and returns to missing-image on clear", async () => {
    const service = new ContractTestImageAssetService();
    service.seed(BASE);
    const controller = new TexturePaintImageController(service, undefined, TRANSPARENT_DECODER);
    const states: string[] = [];
    controller.subscribe((status) => { states.push(status.reason ?? "ready"); });
    await controller.selectImage(BASE);

    controller.clear();

    expect(controller.status()).toEqual({ active: null, ready: false, reason: "missing-image" });
    expect(states).toContain("ready");
    expect(states.at(-1)).toBe("missing-image");
    controller.dispose();
  });

  it("surfaces failed imported cleanup and retries it without hiding the orphan", async () => {
    const service = new FailingImageService(
      new ContractTestImageAssetService({ importWidth: 8, importHeight: 8 }),
    );
    service.failRemove = true;
    const controller = new TexturePaintImageController(service, {
      maxTextureSize: 4,
      maxBytes: 64,
    }, TRANSPARENT_DECODER);

    const result = await controller.importImage(new Blob(["too-large"]));
    expect(result).toMatchObject({ status: "failed", reason: "image-over-budget" });
    expect(result).toHaveProperty("error");
    expect(controller.pendingCleanup()).toHaveLength(1);
    expect(service.current("contract-test-image-1")).not.toBeNull();
    const state = new TexturePaintStateProvider(controller, new TexturePaintBrushController());
    expect(() => state.save()).toThrow("cleanup is pending");

    service.failRemove = false;
    await controller.flushActive();
    expect(controller.pendingCleanup()).toEqual([]);
    expect(service.current("contract-test-image-1")).toBeNull();
    expect(() => state.save()).not.toThrow();
    state.dispose();
    controller.dispose();
  });

  it("closes a resolved bitmap even when CPU decoding fails", async () => {
    const close = vi.fn();
    const service = new ContractTestImageAssetService({
      bitmapFactory: (ref) => ({ width: ref.width, height: ref.height, close }) as ImageBitmap,
    });
    service.seed(BASE);
    const controller = new TexturePaintImageController(service, undefined, {
      decode: async () => { throw new Error("pixel decode failed"); },
    });

    await expect(controller.selectImage(BASE)).resolves.toMatchObject({
      status: "failed",
      reason: "image-unavailable",
    });
    expect(close).toHaveBeenCalledTimes(1);
    controller.dispose();
    service.dispose();
  });

  it("supersedes delayed decode before opening a stale prepared edit session", async () => {
    const service = new ReplacementImageAssetService();
    service.seed(BASE, solidPixels(BASE.width, BASE.height, [0, 0, 0, 0]));
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let calls = 0;
    const immediate = new FakePremultipliedPixelDecoder();
    const decoder: TextureImagePixelDecoder = {
      decode: async (bitmap, ref) => {
        if (calls++ === 0) await firstGate;
        return immediate.decode(bitmap);
      },
    };
    const controller = new TexturePaintImageController(service, undefined, decoder);
    const delayed = controller.selectImage(BASE);
    const latest = controller.selectImage(BASE);

    await expect(latest).resolves.toMatchObject({ status: "ready" });
    expect(service.openSessions()).toBe(1);
    releaseFirst();
    await expect(delayed).resolves.toEqual({ status: "cancelled" });
    expect(service.current(BASE.id)).toEqual(BASE);
    expect(service.openSessions()).toBe(1);
    controller.dispose();
    service.dispose();
  });

  it("documents why prepareEdit must revalidate current after its async load gate", async () => {
    const service = new ReplacementImageAssetService();
    const before = BASE;
    const after = Object.freeze({ ...BASE, revision: 1 });
    service.seed(before, solidPixels(BASE.width, BASE.height, [0, 0, 0, 0]));
    service.seed(after, solidPixels(BASE.width, BASE.height, [1, 1, 1, 1]));
    let release!: () => void;
    service.prepareGate = new Promise<void>((resolve) => { release = resolve; });

    const pending = service.prepareEdit(after);
    expect(service.prepareStarted).toBe(1);
    service.transition(after, before);
    release();
    const stale = await pending;

    expect(service.current(BASE.id)).toEqual(before);
    expect(service.openSessions()).toBe(1);
    expect(() => stale.cancel()).toThrow("stale base");
    expect(() => stale.commit("no writes")).toThrow("no writes");
    // No public ImageEditSession operation can now release the lock without
    // risking restoration of the stale `after` revision. The contract must
    // require post-await revalidation before acquiring this session.
  });
});
