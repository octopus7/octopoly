import type { ImageAssetEvent, ImageAssetRef } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import {
  BarycentricUvProjector,
  BrushEngine,
  PaintEligibilityService,
  PaintTargetAdapter,
  TEXTURE_PREVIEW_PROVIDER_ID,
  TexturePaintExtension,
  type TextureImagePixelDecoder,
  UV0_ATTRIBUTE_KEY,
} from "../../../../src/extensions/texture-paint";
import { createContractTestExtensionHost } from "../../../../src/optional-sdk/testkit";
import {
  PAINT_IMAGE,
  PaintMeshQuery,
  PaintPicking,
  PaintTriangulation,
  pointer,
  toolContext,
} from "../extension/fixture";
import { PaintHistoryFake } from "../session/history-fake";

const CAPABILITIES = Object.freeze({
  backend: "webgl2" as const,
  maxTextureSize: 4096,
  supportsFloatColorBuffer: false,
  applicationTextureBudgetBytes: 16 * 1024 * 1024,
  applicationGpuBudgetBytes: 32 * 1024 * 1024,
});

const TEST_PIXEL_DECODER: TextureImagePixelDecoder = Object.freeze({
  async decode(_bitmap: ImageBitmap, ref: ImageAssetRef): Promise<Uint8ClampedArray> {
    return new Uint8ClampedArray(ref.width * ref.height * 4);
  },
});

describe("texture paint public optional entrypoint", () => {
  it("round-trips imported UV paint, image history, state, and flush through contract fakes", async () => {
    expect(BrushEngine).toBeTypeOf("function");
    expect(BarycentricUvProjector).toBeTypeOf("function");
    expect(PaintTargetAdapter).toBeTypeOf("function");
    expect(PaintEligibilityService).toBeTypeOf("function");
    expect(UV0_ATTRIBUTE_KEY).toEqual({ domain: "corner", name: "uv0" });

    const mesh = new PaintMeshQuery();
    const history = new PaintHistoryFake();
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      modeling: {
        mesh,
        history,
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    await host.state.load({
      unknown: Object.freeze({
        schemaVersion: 3,
        data: Object.freeze({ keep: "opaque" }),
        imageAssets: Object.freeze([PAINT_IMAGE]),
      }),
    });

    const imageEvents: ImageAssetEvent[] = [];
    const unsubscribe = host.images.subscribe((event) => { imageEvents.push(event); });
    const extension = new TexturePaintExtension({
      brush: { radiusPx: 2, spacingPx: 2, opacity: 0.75 },
      pixelDecoder: TEST_PIXEL_DECODER,
    });

    expect(extension.activate(host)).toEqual({ status: "activated" });
    await expect(extension.selectImage(PAINT_IMAGE)).resolves.toMatchObject({ status: "ready" });
    host.shading.fail(
      TEXTURE_PREVIEW_PROVIDER_ID,
      "compile-failed",
      "fixture shader compile failure",
    );
    expect(host.shading.active()).toBeNull();
    expect(extension.activeImage()).toEqual(PAINT_IMAGE);
    host.shading.clearFailure(TEXTURE_PREVIEW_PROVIDER_ID);
    expect(host.shading.active()).toBe(TEXTURE_PREVIEW_PROVIDER_ID);

    const context = toolContext(mesh, history);
    expect(extension.tool().pointer(pointer("down", 1), context)).toMatchObject({
      handled: true,
      capturePointer: true,
    });
    expect(extension.tool().pointer(pointer("move", 2), context)).toEqual({ handled: true });
    expect(extension.tool().pointer(pointer("up", 3), context)).toMatchObject({
      handled: true,
      releasePointer: true,
    });

    const committed = host.images.current(PAINT_IMAGE.id);
    expect(committed?.revision).toBeGreaterThan(1);
    expect(extension.activeImage()).toEqual(committed);
    expect(history.snapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: "Texture Paint Stroke",
    });

    imageEvents.splice(0, imageEvents.length);
    history.undo();
    expect(extension.activeImage()).toEqual(PAINT_IMAGE);
    expect(imageEvents).toEqual([
      expect.objectContaining({ kind: "updated", ref: PAINT_IMAGE }),
    ]);

    imageEvents.splice(0, imageEvents.length);
    history.redo();
    expect(extension.activeImage()).toEqual(committed);
    expect(imageEvents).toEqual([
      expect.objectContaining({ kind: "updated", ref: committed }),
    ]);

    await extension.flush();
    expect(host.images.lastFlush()).toEqual([committed]);
    const saved = host.state.save();
    expect(saved.values.unknown).toEqual({
      schemaVersion: 3,
      data: { keep: "opaque" },
      imageAssets: [PAINT_IMAGE],
    });
    expect(saved.values[extension.id]?.imageAssets).toEqual([committed]);
    expect(saved.imageAssets).toEqual([PAINT_IMAGE, committed]);

    unsubscribe();
    extension.dispose();
    history.clear();
    host.dispose();
  });

  it("activates without UV data while pointer input leaves image and history unchanged", async () => {
    const mesh = new PaintMeshQuery(false);
    const history = new PaintHistoryFake();
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      modeling: {
        mesh,
        history,
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    const extension = new TexturePaintExtension({ pixelDecoder: TEST_PIXEL_DECODER });

    expect(extension.activate(host)).toEqual({ status: "activated" });
    await expect(extension.selectImage(PAINT_IMAGE)).resolves.toMatchObject({ status: "ready" });
    const context = toolContext(mesh, history);
    expect(extension.tool().disabledReason(context)).toBe("missing-uv");
    expect(extension.tool().pointer(pointer("down", 1), context)).toEqual({ handled: false });
    expect(host.images.current(PAINT_IMAGE.id)).toEqual(PAINT_IMAGE);
    expect(extension.activeImage()).toEqual(PAINT_IMAGE);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });

    extension.dispose();
    host.dispose();
  });
});
