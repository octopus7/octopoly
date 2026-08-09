import { describe, expect, it, vi } from "vitest";
import type { ImageAssetEvent, Mat4, TriangleMeshSnapshot } from "@octopoly/contracts";
import { IndexedDbImageAssetService } from "../../src/project/image-assets";
import { IndexedDbReferenceAssetService } from "../../src/project/reference-assets";
import { FakeImageCodec, MemoryProjectStorage } from "./fakes";

const identity: Mat4 = {
  elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1],
};

const geometry: TriangleMeshSnapshot = {
  version: 2,
  positions: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
  indices: [0, 1, 2],
};

describe("asset services", () => {
  it("supports synchronous image edit commit, undo, redo, cancel, notifications, and durable reload", async () => {
    const storage = new MemoryProjectStorage();
    const codec = new FakeImageCodec({
      width: 2,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]),
    });
    const service = new IndexedDbImageAssetService(storage, { codec, createId: () => "image" });
    const events: ImageAssetEvent[] = [];
    const unsubscribe = service.subscribe((event) => events.push(event));
    const base = await service.import(new Blob(["fixture"]));
    expect(base.revision).toBe(0);
    const session = await service.prepareEdit(base);
    const transient = session.write({
      x: 1,
      y: 0,
      width: 1,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray([9, 10, 11, 12]),
    });
    expect(transient.revision).toBe(1);
    const { change, ref } = session.commit("paint");
    expect(service.current("image")).toEqual(ref);
    change.revert();
    expect(service.current("image")).toEqual(base);
    change.apply();
    expect(service.current("image")).toEqual(ref);

    await service.flush([base, ref]);
    const restored = new IndexedDbImageAssetService(storage, { codec, initialRefs: [ref] });
    const bitmap = await restored.resolve(ref);
    expect([bitmap.width, bitmap.height]).toEqual([2, 1]);

    const cancelled = await service.prepareEdit(ref);
    cancelled.write({ x: 0, y: 0, width: 1, height: 1, rgba8Premultiplied: new Uint8ClampedArray(4) });
    cancelled.cancel();
    expect(service.current("image")).toEqual(ref);
    expect(events.filter((event) => event.kind === "updated")).toHaveLength(5);
    change.dispose?.();
    change.dispose?.();
    unsubscribe();
    restored.dispose();
    service.dispose();
    service.dispose();
  });

  it("keeps durable image revisions intact when flush fails and rejects invalid writes before mutation", async () => {
    const storage = new MemoryProjectStorage();
    const codec = new FakeImageCodec({ width: 1, height: 1, rgba8Premultiplied: new Uint8ClampedArray([1, 2, 3, 4]) });
    const service = new IndexedDbImageAssetService(storage, { codec, createId: () => "image" });
    const base = await service.import(new Blob());
    await service.flush([base]);
    const session = await service.prepareEdit(base);
    expect(() => session.write({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray(3),
    })).toThrow(/byte length/u);
    expect(session.current()).toEqual(base);
    const after = session.write({ x: 0, y: 0, width: 1, height: 1, rgba8Premultiplied: new Uint8ClampedArray([9, 9, 9, 9]) });
    session.commit("paint");
    storage.failNextTransaction = new Error("quota");
    await expect(service.flush([after])).rejects.toThrow("quota");
    const durable = new IndexedDbImageAssetService(storage, { codec, initialRefs: [base] });
    await expect(durable.resolve(base)).resolves.toMatchObject({ width: 1, height: 1 });
  });

  it("rejects an in-flight prepareEdit when history changes the full current ref without side effects", async () => {
    const storage = new MemoryProjectStorage();
    const codec = new FakeImageCodec({ width: 1, height: 1, rgba8Premultiplied: new Uint8ClampedArray([1, 2, 3, 4]) });
    const service = new IndexedDbImageAssetService(storage, { codec, createId: () => "image" });
    const published = vi.fn();
    service.subscribe(published);
    const base = await service.import(new Blob());
    const edit = await service.prepareEdit(base);
    const after = edit.write({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray([9, 9, 9, 9]),
    });
    const { change } = edit.commit("paint");

    const eventsBeforeMetadataMismatch = published.mock.calls.length;
    await expect(service.prepareEdit({ ...after, width: after.width + 1 })).rejects.toThrow(/stale or missing/u);
    expect(service.current(base.id)).toEqual(after);
    expect(published).toHaveBeenCalledTimes(eventsBeforeMetadataMismatch);

    const pending = service.prepareEdit(after);
    change.revert();
    const eventCountAfterHistoryTransition = published.mock.calls.length;

    await expect(pending).rejects.toThrow(/stale or missing/u);
    expect(service.current(base.id)).toEqual(base);
    expect(published).toHaveBeenCalledTimes(eventCountAfterHistoryTransition);

    const retry = await service.prepareEdit(base);
    const transient = retry.write({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray([5, 6, 7, 8]),
    });
    expect(transient.revision).toBe(2);
    retry.cancel();
    expect(service.current(base.id)).toEqual(base);
    change.apply();
    expect(service.current(base.id)).toEqual(after);
    change.dispose?.();
  });

  it("removes durable images atomically and enforces decoded-memory budgets", async () => {
    const storage = new MemoryProjectStorage();
    const codec = new FakeImageCodec({ width: 1, height: 1, rgba8Premultiplied: new Uint8ClampedArray(4) });
    const service = new IndexedDbImageAssetService(storage, { codec, createId: () => "image" });
    const removed = vi.fn();
    service.subscribe(removed);
    const ref = await service.import(new Blob());
    await service.flush([ref]);
    await service.remove(ref.id);
    expect(service.current(ref.id)).toBeNull();
    expect(removed).toHaveBeenLastCalledWith({ kind: "removed", id: ref.id });
    const restored = new IndexedDbImageAssetService(storage, { codec, initialRefs: [ref] });
    await expect(restored.resolve(ref)).rejects.toThrow(/unavailable/u);

    const overBudget = new IndexedDbImageAssetService(new MemoryProjectStorage(), {
      codec,
      maximumRetainedBytes: 3,
      createId: () => "too-large",
    });
    await expect(overBudget.import(new Blob())).rejects.toThrow(/budget/u);
  });

  it("does not publish stale async resolves after disposal", async () => {
    const storage = new MemoryProjectStorage();
    let release: (() => void) | undefined;
    const codec = new FakeImageCodec({ width: 1, height: 1, rgba8Premultiplied: new Uint8ClampedArray(4) });
    const original = codec.createBitmap.bind(codec);
    codec.createBitmap = async (image) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original(image);
    };
    const service = new IndexedDbImageAssetService(storage, { codec, createId: () => "image" });
    const ref = await service.import(new Blob());
    const resolving = service.resolve(ref);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    service.dispose();
    release?.();
    await expect(resolving).rejects.toThrow(/disposed/u);
    expect(codec.closed).toEqual([true]);
  });

  it("persists project-local reference geometry while the canonical ref preserves its transform", async () => {
    const storage = new MemoryProjectStorage();
    const service = new IndexedDbReferenceAssetService(storage, { createId: () => "reference" });
    const ref = await service.create(geometry, identity);
    expect(ref.worldTransform).toEqual(identity);
    service.dispose();

    const restored = new IndexedDbReferenceAssetService(storage);
    await expect(restored.resolve(ref)).resolves.toEqual(geometry);
    await restored.remove(ref.id);
    const empty = new IndexedDbReferenceAssetService(storage);
    await expect(empty.resolve(ref)).rejects.toThrow(/missing/u);
    restored.dispose();
    restored.dispose();

    const overBudget = new IndexedDbReferenceAssetService(new MemoryProjectStorage(), {
      maximumRetainedBytes: 1,
      createId: () => "too-large",
    });
    await expect(overBudget.create(geometry, identity)).rejects.toThrow(/budget/u);
  });
});
