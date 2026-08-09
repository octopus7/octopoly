import type { ImageAssetRef, RendererCapabilities } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { MatcapImageManager } from "../../../../src/extensions/matcap/image";
import {
  ScriptedImageAssetService,
  deferred,
  imageRef,
  trackedBitmap,
} from "./fakes";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: false,
  applicationTextureBudgetBytes: 64 * 1024 * 1024,
  applicationGpuBudgetBytes: 64 * 1024 * 1024,
});

describe("MatcapImageManager", () => {
  it("imports, resolves, closes and selects a valid custom image", async () => {
    const images = new ScriptedImageAssetService();
    const ref = imageRef("custom", 512);
    const bitmap = trackedBitmap(512, 512);
    images.queueImport(ref);
    images.resolveWith(ref.id, bitmap);
    const manager = new MatcapImageManager(images, CAPABILITIES);

    const result = await manager.importCustom(new Blob(["custom"], { type: "image/png" }));

    expect(result).toEqual({ status: "selected", ref, previous: null });
    expect(manager.current()).toEqual(ref);
    expect(images.importedBlobs).toHaveLength(1);
    expect(images.resolvedRefs).toEqual([ref]);
    expect(bitmap.closeCount).toBe(1);
    expect(images.removedIds).toEqual([]);
  });

  it("imports each built-in at most once while revalidating deterministic switches", async () => {
    const images = new ScriptedImageAssetService();
    const clay = imageRef("preset-clay");
    const neutral = imageRef("preset-neutral");
    const bitmaps = [
      trackedBitmap(256, 256),
      trackedBitmap(256, 256),
      trackedBitmap(256, 256),
    ];
    images.queueImport(clay);
    images.queueImport(neutral);
    let clayResolve = 0;
    images.resolveWith(clay.id, () => bitmaps[clayResolve++]!);
    images.resolveWith(neutral.id, () => bitmaps[2]!);
    const manager = new MatcapImageManager(images, CAPABILITIES);

    expect(await manager.selectPreset("clay")).toMatchObject({
      status: "selected",
      ref: clay,
      previous: null,
    });
    expect(await manager.selectPreset("clay")).toMatchObject({
      status: "selected",
      ref: clay,
      previous: clay,
    });
    expect(await manager.selectPreset("neutral-gray")).toMatchObject({
      status: "selected",
      ref: neutral,
      previous: clay,
    });

    expect(images.importedBlobs).toHaveLength(2);
    expect(images.importedBlobs.every((blob) => blob.type === "image/svg+xml")).toBe(true);
    expect(images.resolvedRefs).toEqual([clay, clay, neutral]);
    expect(bitmaps.map((bitmap) => bitmap.closeCount)).toEqual([1, 1, 1]);
    expect(manager.current()).toEqual(neutral);
  });

  it("retains the previous valid ref on import and decode failure", async () => {
    const images = new ScriptedImageAssetService();
    const previous = imageRef("previous", 64);
    const broken = imageRef("broken", 64);
    images.queueImport(previous);
    images.resolveWith(previous.id, trackedBitmap(64, 64));
    images.resolveWith(broken.id, new Error("corrupt payload"));
    const manager = new MatcapImageManager(images, CAPABILITIES);
    await manager.selectPreset("clay");

    const decodeFailure = await manager.selectCustom(broken);
    images.queueImport(new Error("unsupported codec"));
    const importFailure = await manager.importCustom(new Blob(["broken"]));

    expect(decodeFailure).toMatchObject({
      status: "failed",
      code: "decode-failed",
      issue: "decode-failed",
      attempted: broken,
      retained: previous,
    });
    expect(importFailure).toMatchObject({
      status: "failed",
      code: "decode-failed",
      issue: "decode-failed",
      retained: previous,
    });
    expect(manager.current()).toEqual(previous);
    expect(images.removedIds).toEqual([]);
  });

  it.each([
    {
      label: "invalid dimensions",
      ref: imageRef("zero", 0, 32),
      capabilities: CAPABILITIES,
      issue: "invalid-dimensions",
      code: "invalid-image",
    },
    {
      label: "invalid color space",
      ref: { ...imageRef("p3", 32), colorSpace: "display-p3" } as unknown as ImageAssetRef,
      capabilities: CAPABILITIES,
      issue: "invalid-color-space",
      code: "invalid-image",
    },
    {
      label: "texture size",
      ref: imageRef("large", 257, 32),
      capabilities: { ...CAPABILITIES, maxTextureSize: 256 },
      issue: "texture-size-exceeded",
      code: "resource-budget",
    },
    {
      label: "application texture budget",
      ref: imageRef("texture-budget", 64),
      capabilities: { ...CAPABILITIES, applicationTextureBudgetBytes: 64 * 64 * 4 - 1 },
      issue: "texture-budget-exceeded",
      code: "resource-budget",
    },
    {
      label: "application GPU budget",
      ref: imageRef("gpu-budget", 64),
      capabilities: { ...CAPABILITIES, applicationGpuBudgetBytes: 64 * 64 * 4 - 1 },
      issue: "gpu-budget-exceeded",
      code: "resource-budget",
    },
  ])("rejects $label before decode without replacing the previous ref", async ({
    ref,
    capabilities,
    issue,
    code,
  }) => {
    const images = new ScriptedImageAssetService();
    const previous = imageRef("previous", 8);
    images.resolveWith(previous.id, trackedBitmap(8, 8));
    const manager = new MatcapImageManager(images, capabilities);
    await manager.selectCustom(previous);

    const result = await manager.selectCustom(ref);

    expect(result).toMatchObject({ status: "failed", issue, code, retained: previous });
    expect(images.resolvedRefs).toEqual([previous]);
    expect(manager.current()).toEqual(previous);
    expect(images.removedIds).toEqual([]);
  });

  it("closes a decoded bitmap whose dimensions disagree and retains the prior image", async () => {
    const images = new ScriptedImageAssetService();
    const previous = imageRef("previous", 32);
    const mismatch = imageRef("mismatch", 64);
    const mismatchedBitmap = trackedBitmap(32, 64);
    images.resolveWith(previous.id, trackedBitmap(32, 32));
    images.resolveWith(mismatch.id, mismatchedBitmap);
    const manager = new MatcapImageManager(images, CAPABILITIES);
    await manager.selectCustom(previous);

    const result = await manager.selectCustom(mismatch);

    expect(result).toMatchObject({
      status: "failed",
      code: "invalid-image",
      issue: "invalid-dimensions",
      retained: previous,
    });
    expect(mismatchedBitmap.closeCount).toBe(1);
    expect(manager.current()).toEqual(previous);
  });

  it("serializes concurrent selections so invocation order determines the retained ref", async () => {
    const images = new ScriptedImageAssetService();
    const first = imageRef("first", 16);
    const second = imageRef("second", 16);
    const firstDecode = deferred<ImageBitmap>();
    const secondBitmap = trackedBitmap(16, 16);
    images.resolveWith(first.id, firstDecode.promise);
    images.resolveWith(second.id, secondBitmap);
    const manager = new MatcapImageManager(images, CAPABILITIES);

    const firstSelection = manager.selectCustom(first);
    const secondSelection = manager.selectCustom(second);
    await Promise.resolve();
    expect(images.resolvedRefs).toEqual([first]);

    const firstBitmap = trackedBitmap(16, 16);
    firstDecode.resolve(firstBitmap);
    expect(await firstSelection).toMatchObject({ status: "selected", ref: first });
    expect(await secondSelection).toMatchObject({ status: "selected", ref: second, previous: first });
    expect(manager.current()).toEqual(second);
    expect(firstBitmap.closeCount).toBe(1);
    expect(secondBitmap.closeCount).toBe(1);
  });

  it("closes a late decode after disposal and never deletes persistent refs", async () => {
    const images = new ScriptedImageAssetService();
    const persistent = imageRef("persistent", 16);
    const decode = deferred<ImageBitmap>();
    images.seed(persistent);
    images.resolveWith(persistent.id, decode.promise);
    const manager = new MatcapImageManager(images, CAPABILITIES);

    const selection = manager.selectCustom(persistent);
    await Promise.resolve();
    manager.dispose();
    manager.dispose();
    const bitmap = trackedBitmap(16, 16);
    decode.resolve(bitmap);

    await expect(selection).rejects.toThrow("MatCap image manager is disposed");
    expect(bitmap.closeCount).toBe(1);
    expect(images.removedIds).toEqual([]);
    expect(images.current(persistent.id)).toEqual(persistent);
  });
});
