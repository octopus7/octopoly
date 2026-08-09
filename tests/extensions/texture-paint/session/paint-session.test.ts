import type { ImageAssetEvent, ImageAssetRef, ImageTileUpdate } from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import { PaintSession } from "../../../../src/extensions/texture-paint/session";
import {
  TexturePaintImageController,
  type TextureImagePixelDecoder,
} from "../../../../src/extensions/texture-paint/image";
import { ContractTestImageAssetService } from "../../../../src/optional-sdk/testkit";
import { PaintHistoryFake } from "./history-fake";

const BASE: ImageAssetRef = Object.freeze({
  id: "paint",
  revision: 0,
  width: 2,
  height: 2,
  colorSpace: "srgb",
});
const TRANSPARENT_DECODER: TextureImagePixelDecoder = Object.freeze({
  decode: async (_bitmap: ImageBitmap, ref: ImageAssetRef) => (
    new Uint8ClampedArray(ref.width * ref.height * 4)
  ),
});

function tile(x: number, y: number): ImageTileUpdate {
  return Object.freeze({
    x,
    y,
    width: 1,
    height: 1,
    rgba8Premultiplied: new Uint8ClampedArray([32, 16, 8, 32]),
  });
}

describe("PaintSession", () => {
  it("groups all dirty tile writes into one synchronous undo/redo entry and notification", async () => {
    const images = new ContractTestImageAssetService();
    images.seed(BASE);
    const controller = new TexturePaintImageController(images, undefined, TRANSPARENT_DECODER);
    await controller.selectImage(BASE);
    const history = new PaintHistoryFake();
    const imageEvents: ImageAssetEvent[] = [];
    const historyEvents: boolean[] = [];
    images.subscribe((event) => { imageEvents.push(event); });
    history.subscribe((snapshot) => { historyEvents.push(snapshot.canUndo); });
    const edit = controller.takePreparedEdit();
    if (edit === null) throw new Error("expected prepared edit");
    const session = PaintSession.begin(edit, history);

    session.write(tile(0, 0));
    session.write(tile(1, 1));
    const result = session.commit();
    if (result === null) throw new Error("expected image mutation");
    controller.acceptCommitted(result.ref);

    expect(result?.ref.revision).toBe(2);
    expect(session.dirtyTiles()).toEqual([
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 1, y: 1, width: 1, height: 1 },
    ]);
    expect(history.snapshot()).toMatchObject({ canUndo: true, undoLabel: "Texture Paint Stroke" });
    expect(historyEvents).toEqual([true]);

    imageEvents.splice(0, imageEvents.length);
    history.undo();
    expect(images.current(BASE.id)?.revision).toBe(0);
    expect(controller.activeImage()?.revision).toBe(0);
    expect(imageEvents).toEqual([
      { kind: "updated", ref: BASE, dirty: [{ x: 0, y: 0, width: 2, height: 2 }] },
    ]);

    imageEvents.splice(0, imageEvents.length);
    history.redo();
    expect(images.current(BASE.id)?.revision).toBe(2);
    expect(controller.activeImage()?.revision).toBe(2);
    expect(imageEvents[0]).toMatchObject({ kind: "updated", ref: { revision: 2 } });
    controller.dispose();
    images.dispose();
  });

  it("restores the base revision and leaves no history entry on cancel or an empty commit", async () => {
    const images = new ContractTestImageAssetService();
    images.seed(BASE);
    const history = new PaintHistoryFake();
    const first = PaintSession.begin(await images.prepareEdit(BASE), history);
    first.write(tile(0, 0));

    first.cancel();
    first.dispose();
    expect(images.current(BASE.id)).toEqual(BASE);
    expect(history.snapshot().canUndo).toBe(false);

    const empty = PaintSession.begin(await images.prepareEdit(BASE), history);
    expect(empty.commit()).toBeNull();
    expect(images.current(BASE.id)).toEqual(BASE);
    expect(history.snapshot().canUndo).toBe(false);
    images.dispose();
  });

  it("cancels the image edit and rolls history back when edit.commit throws", () => {
    const cancel = vi.fn();
    const rollback = vi.fn();
    const edit = {
      base: BASE,
      current: () => BASE,
      write: () => BASE,
      commit: () => { throw new Error("commit failed"); },
      cancel,
      dispose: cancel,
    };
    const history = {
      begin: () => ({
        label: "Texture Paint Stroke",
        recordApplied: vi.fn(),
        commit: vi.fn(),
        rollback,
      }),
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn(),
      snapshot: () => ({ canUndo: false, canRedo: false }),
      subscribe: () => () => {},
    };
    const session = PaintSession.begin(edit, history);
    session.write(tile(0, 0));

    expect(() => session.commit()).toThrow("commit failed");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
  });
});
