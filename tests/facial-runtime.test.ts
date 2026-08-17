import { describe, expect, it, vi } from "vitest";

import {
  startFacialRuntime,
  type FacialViewportPort,
} from "../src/facial/runtime";
import type { FacialViewportScene } from "../src/facial/scene";
import { FACIAL_WORKSPACE_STORAGE_KEY } from "../src/facial/storage";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.values.set(key, value);
  }
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  return event as PointerEvent;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function seedUvWorkspace(storage: MemoryStorage): void {
  storage.values.set(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
    version: 1,
    activeMeshId: "base",
    meshes: [{
      id: "base",
      name: "Base Mask",
      kind: "base",
      geometry: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        uvs: [0, 0, 1, 0, 0, 1],
      },
    }],
  }));
}

describe("facial runtime composition", () => {
  it("decodes a PNG for the active UV model, uploads it by mesh ID, and closes the bitmap without persistence", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const close = vi.fn();
    const bitmap = { close } as unknown as ImageBitmap;
    const decodeTextureImage = vi.fn(async () => bitmap);
    const setTexture = vi.fn();
    let initialScene: FacialViewportScene | undefined;
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(),
      decodeTextureImage,
      startViewport: (_canvas, scene) => {
        initialScene = scene;
        return {
          setScene: vi.fn(),
          setTexture,
          deleteTexture: vi.fn(),
          projectVertex: vi.fn(() => null),
          pickVertex: vi.fn(() => null),
          dispose: vi.fn(),
        };
      },
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    const file = new File([new Uint8Array([1, 2, 3])], "surface.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(setTexture).toHaveBeenCalledOnce());

    expect(initialScene).toEqual(expect.objectContaining({ meshId: "base", textureKey: "base" }));
    expect(decodeTextureImage).toHaveBeenCalledWith(file);
    expect(setTexture).toHaveBeenCalledWith("base", bitmap);
    expect(close).toHaveBeenCalledOnce();
    expect([...storage.values.values()].some((value) => value.includes("textureKey") || value.includes("surface.png"))).toBe(false);
    runtime.dispose();
  });

  it("rejects unsupported texture MIME types before decode without replacing the surface", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const decodeTextureImage = vi.fn();
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(),
      decodeTextureImage,
      onError,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    const file = new File(["bad"], "surface.webp", { type: "image/webp" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();

    expect(decodeTextureImage).not.toHaveBeenCalled();
    expect(setTexture).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/PNG.*JPEG/) }));
    runtime.dispose();
  });

  it("rejects texture selection on a geometry-only model before decode", async () => {
    const root = document.createElement("div");
    const decodeTextureImage = vi.fn(async () => ({ close: vi.fn() } as unknown as ImageBitmap));
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(),
      decodeTextureImage,
      onError,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    const file = new File(["png"], "surface.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(decodeTextureImage).not.toHaveBeenCalled();
    expect(setTexture).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/UV/) }));
    runtime.dispose();
  });

  it("routes a synchronous texture decoder failure through the status error callback", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const failure = new Error("sync decode failed");
    const onError = vi.fn();
    const setTexture = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: () => { throw failure; },
      onError,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(setTexture).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("closes a decoded bitmap without upload when the active model changes during decode", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const close = vi.fn();
    const bitmap = { close } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: () => pending.promise,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.click();
    pending.resolve(bitmap);
    await pending.promise;
    await Promise.resolve();

    expect(setTexture).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("drops a pending decoded texture after switching away from and back to the same model", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: () => pending.promise,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-mesh-id="base"]')!.click();

    pending.resolve(bitmap);
    await pending.promise;
    await Promise.resolve();

    expect(setTexture).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("drops a pending decoded texture when OBJ import replaces the same model topology", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({
        positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], indices: [0, 1, 2],
      })),
      loadPresetText: vi.fn(async () => "replacement"),
      decodeTextureImage: () => pending.promise,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    pending.resolve(bitmap);
    await pending.promise;
    await Promise.resolve();

    expect(setTexture).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("suppresses an older decode rejection after the same model topology is replaced", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({
        positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], indices: [0, 1, 2],
      })),
      loadPresetText: vi.fn(async () => "replacement"),
      decodeTextureImage: () => pending.promise,
      onError,
      startViewport: () => ({
        setScene: vi.fn(), setTexture: vi.fn(), deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    pending.reject(new Error("stale decode failed"));
    await pending.promise.catch(() => undefined);
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("keeps the latest texture request when an older decode finishes last", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const first = deferred<ImageBitmap>();
    const second = deferred<ImageBitmap>();
    const firstBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const secondBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const decodeTextureImage = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const setTexture = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), decodeTextureImage,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["first"], "first.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["second"], "second.jpg", { type: "image/jpeg" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    second.resolve(secondBitmap);
    await second.promise;
    await Promise.resolve();
    first.resolve(firstBitmap);
    await first.promise;
    await Promise.resolve();

    expect(setTexture).toHaveBeenCalledOnce();
    expect(setTexture).toHaveBeenCalledWith("base", secondBitmap);
    expect(firstBitmap.close).toHaveBeenCalledOnce();
    expect(secondBitmap.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("suppresses an older decode rejection after a newer texture succeeds", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const first = deferred<ImageBitmap>();
    const secondBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const decodeTextureImage = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(secondBitmap);
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), decodeTextureImage, onError,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["first"], "first.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["second"], "second.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(setTexture).toHaveBeenCalledOnce());

    first.reject(new Error("stale decode failed"));
    await first.promise.catch(() => undefined);
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("closes a late decoded bitmap without upload or error after runtime disposal", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: () => pending.promise,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    runtime.dispose();
    pending.resolve(bitmap);
    await pending.promise;
    await Promise.resolve();

    expect(setTexture).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("deletes the model texture when OBJ import replaces its topology", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const deleteTexture = vi.fn();
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({
        positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
        indices: [0, 1, 2],
      })),
      loadPresetText: vi.fn(async () => "replacement obj"),
      decodeTextureImage: vi.fn(async () => bitmap),
      startViewport: () => ({
        setScene, setTexture, deleteTexture,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const textureInput = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(textureInput, "files", {
      configurable: true,
      value: [new File(["png"], "surface.png", { type: "image/png" })],
    });
    textureInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(setTexture).toHaveBeenCalledOnce());

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await vi.waitFor(() => expect(setScene).toHaveBeenCalled());

    expect(deleteTexture).toHaveBeenCalledOnce();
    expect(deleteTexture).toHaveBeenCalledWith("base");
    runtime.dispose();
  });

  it("rolls back an initialized viewport when later UI mounting fails", () => {
    const panelContainer = document.createElement("div");
    panelContainer.append = vi.fn(() => {
      throw new Error("panel mount failed");
    });
    const viewport: FacialViewportPort = {
      setScene: vi.fn(),
      projectVertex: vi.fn(() => null),
      pickVertex: vi.fn(() => null),
      dispose: vi.fn(),
    };

    expect(() => startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer,
      overlayContainer: document.createElement("div"),
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => viewport,
    })).toThrow("panel mount failed");

    expect(viewport.dispose).toHaveBeenCalledOnce();
  });

  it("starts with the base scene and updates to a duplicated copy from the panel", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    let initialScene: FacialViewportScene | undefined;
    const setScene = vi.fn();
    const viewport: FacialViewportPort = {
      setScene,
      projectVertex: vi.fn(() => null),
      pickVertex: vi.fn(() => null),
      dispose: vi.fn(),
    };
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: (_canvas, scene) => {
        initialScene = scene;
        return viewport;
      },
    });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-mesh-drawer"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();

    expect(initialScene?.meshId).toBe("base");
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ meshId: "copy-1" }));
    expect(root.querySelector('[data-mesh-id="copy-1"]')).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".facial-mesh-row__actions")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".movement-controls__popover")?.hidden).toBe(true);
    expect(root.querySelector(".movement-controls")?.parentElement?.classList.contains("facial-tool-strip")).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    expect(root.querySelector<HTMLElement>(".facial-mesh-row__actions")?.hidden).toBe(false);
  });

  it("keeps File and movement tool popovers from remaining open together", () => {
    const root = document.createElement("div");
    startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });
    const fileToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!;
    const fileMenu = root.querySelector<HTMLElement>(".facial-file-menu")!;
    const movementToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-movement-controls"]')!;
    const movementPopover = root.querySelector<HTMLElement>(".movement-controls__popover")!;

    fileToggle.click();
    expect(fileMenu.hidden).toBe(false);
    movementToggle.click();
    expect(movementPopover.hidden).toBe(false);
    expect(fileMenu.hidden).toBe(true);
    expect(fileToggle.getAttribute("aria-expanded")).toBe("false");

    fileToggle.click();
    expect(fileMenu.hidden).toBe(false);
    expect(movementPopover.hidden).toBe(true);
    expect(movementToggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("loads the Luna preset through the injected text loader and publishes the saved parsed scene", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const geometry = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const loadPresetText = vi.fn(async () => "luna obj source");
    const parseObjText = vi.fn(() => geometry);
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText,
      loadPresetText,
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await vi.waitFor(() => expect(setScene).toHaveBeenCalled());

    expect(loadPresetText).toHaveBeenCalledOnce();
    expect(loadPresetText).toHaveBeenCalledWith("luna");
    expect(parseObjText).toHaveBeenCalledWith("luna obj source");
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ geometry }));
    expect([...storage.values.values()].some((value) => value.includes("luna") || value.includes("positions"))).toBe(true);
    runtime.dispose();
  });

  it("suppresses a pending Luna preset after a later authoritative workspace command", async () => {
    const root = document.createElement("div");
    const pendingText = deferred<string>();
    const parseObjText = vi.fn(() => ({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    }));
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText,
      loadPresetText: () => pendingText.promise,
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.click();
    pendingText.resolve("late luna obj");
    await pendingText.promise;
    await Promise.resolve();

    expect(parseObjText).not.toHaveBeenCalled();
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ meshId: "copy-1" }));
    runtime.dispose();
  });

  it("suppresses a pending Luna preset after runtime disposal", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const pendingText = deferred<string>();
    const parseObjText = vi.fn();
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText,
      loadPresetText: () => pendingText.promise,
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    runtime.dispose();
    pendingText.resolve("late luna obj");
    await pendingText.promise;
    await Promise.resolve();

    expect(parseObjText).not.toHaveBeenCalled();
    expect(setScene).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(0);
  });

  it.each([
    ["loader", () => vi.fn(async () => { throw new Error("preset load failed"); }), () => vi.fn()],
    ["parser", () => vi.fn(async () => "invalid obj"), () => vi.fn(() => { throw new Error("parse failed"); })],
  ])("reports a Luna %s failure without saving or publishing", async (_stage, makeLoader, makeParser) => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const onError = vi.fn();
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: makeParser(),
      loadPresetText: makeLoader(),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
      onError,
    });

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(setScene).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(0);
    runtime.dispose();
  });

  it("reports an imported File read failure without parsing, saving, or publishing", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const onError = vi.fn();
    const parseObjText = vi.fn();
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText,
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
      onError,
    });
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const unreadable = { text: vi.fn(async () => { throw new Error("read failed"); }) };
    Object.defineProperty(input, "files", { configurable: true, value: [unreadable] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(parseObjText).not.toHaveBeenCalled();
    expect(setScene).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(0);
    runtime.dispose();
  });

  it("reports Luna persistence failure without publishing a false scene", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const onError = vi.fn();
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: () => ({
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
      }),
      loadPresetText: async () => "luna obj",
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
      onError,
    });
    storage.failWrites = true;

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "FacialPersistenceError" }));
    expect(setScene).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(0);
    runtime.dispose();
  });

  it("routes a synchronous autosave failure through the runtime error callback", () => {
    const root = document.createElement("div");
    const onError = vi.fn();
    startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage: {
        getItem: () => null,
        setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
      },
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
      onError,
    });

    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      name: "FacialPersistenceError",
    }));
    expect(root.querySelector('[data-mesh-id="copy-1"]')).toBeNull();
  });

  it("keeps a failed rename dialog open and focused without changing the mesh", () => {
    const root = document.createElement("div");
    root.className = "viewport";
    document.body.append(root);
    const storage = new MemoryStorage();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
      onError,
    });
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();
    storage.failWrites = true;
    root.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    const trigger = root.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')!;
    trigger.click();
    const input = root.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
    input.value = "Smile";

    root.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')?.click();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "FacialPersistenceError" }));
    expect(root.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(root.querySelector('[data-mesh-id="copy-1"]')?.textContent).toBe("Base Mask Copy 1");

    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(root.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    runtime.dispose();
    root.remove();
  });

  it("keeps a failed delete dialog open and focused without removing the mesh", () => {
    const root = document.createElement("div");
    root.className = "viewport";
    document.body.append(root);
    const storage = new MemoryStorage();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
      onError,
    });
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();
    storage.failWrites = true;
    root.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]')?.click();
    const deleteButton = root.querySelector<HTMLButtonElement>('[data-dialog-action="delete"]')!;

    deleteButton.click();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "FacialPersistenceError" }));
    expect(root.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(false);
    expect(document.activeElement).toBe(deleteButton);
    expect(root.querySelector('[data-mesh-id="copy-1"]')).not.toBeNull();
    runtime.dispose();
    root.remove();
  });

  it("picks a vertex from a canvas tap and shows the projected gizmo", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    const pickVertex = vi.fn(() => 2);
    const viewport: FacialViewportPort = {
      setScene,
      projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
      pickVertex,
      dispose: vi.fn(),
    };
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => viewport,
    });

    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));

    expect(pickVertex).toHaveBeenCalledWith(40, 60, 12);
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({
      meshId: "base",
      selectedVertex: 2,
    }));
    const gizmo = root.querySelector<HTMLElement>(".vertex-gizmo");
    expect(gizmo?.hidden).toBe(false);
    expect(gizmo?.style.transform).toBe("translate(120px, 80px)");
  });

  it("lets a keyboard-only user cycle vertex selection from the canvas", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ selectedVertex: 0 }));
    expect(root.querySelector<HTMLElement>(".vertex-gizmo")?.hidden).toBe(false);
    const status = root.querySelector<HTMLElement>(".facial-selection-status")!;
    const beforeMove = status.textContent;
    expect(beforeMove).toContain("X");
    const xHandle = root.querySelector<HTMLButtonElement>('[data-axis="x"]')!;
    xHandle.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    }));
    expect(status.textContent).toContain("X");
    expect(status.textContent).not.toBe(beforeMove);
  });

  it("focuses the selected vertex with the F key", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const focusVertex = vi.fn();
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
        pickVertex: vi.fn(() => 2),
        focusVertex,
        dispose: vi.fn(),
      }),
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    const focusEvent = new KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
      cancelable: true,
    });

    canvas.dispatchEvent(focusEvent);

    expect(focusEvent.defaultPrevented).toBe(true);
    expect(focusVertex).toHaveBeenCalledWith(2);
  });

  it("moves the selected vertex through the active constrained plane handle", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    const modelDeltaForPlaneDrag = vi.fn(() => [0.25, -0.5, 0] as const);
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
        pickVertex: vi.fn(() => 2),
        modelDeltaForPlaneDrag,
        dispose: vi.fn(),
      }),
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    root.querySelector<HTMLButtonElement>('[data-movement-mode="constrained-plane"]')?.click();
    const planeHandle = root.querySelector<HTMLButtonElement>(".vertex-gizmo__plane-handle")!;

    planeHandle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 120, clientY: 80 }));
    planeHandle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 140, clientY: 90 }));

    expect(modelDeltaForPlaneDrag).toHaveBeenCalledWith(
      2,
      "xy",
      { x: 120, y: 80 },
      { x: 140, y: 90 },
    );
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ selectedVertex: 2 }));
  });

  it("moves a screen-space plane body in its two world axes even when ray-plane drag is unavailable", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    const modelDeltaForPlaneDrag = vi.fn(() => null);
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
        pickVertex: vi.fn(() => 2),
        modelDeltaForPlaneDrag,
        dispose: vi.fn(),
      }),
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    const before = setScene.mock.calls.at(-1)?.[0] as FacialViewportScene;
    root.querySelector<HTMLButtonElement>('[data-movement-mode="constrained-plane"]')?.click();
    const screenSpace = root.querySelector<HTMLInputElement>('[data-plane-screen-space="true"]')!;
    screenSpace.checked = true;
    screenSpace.dispatchEvent(new Event("change", { bubbles: true }));
    modelDeltaForPlaneDrag.mockClear();
    const planeHandle = root.querySelector<HTMLButtonElement>(".vertex-gizmo__plane-handle")!;

    planeHandle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 120, clientY: 80 }));
    planeHandle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 140, clientY: 90 }));

    const after = setScene.mock.calls.at(-1)?.[0] as FacialViewportScene;
    const offset = 2 * 3;
    expect(modelDeltaForPlaneDrag).not.toHaveBeenCalled();
    expect(after.geometry.positions[offset]).toBeGreaterThan(before.geometry.positions[offset]!);
    expect(after.geometry.positions[offset + 1]).toBeLessThan(before.geometry.positions[offset + 1]!);
    expect(after.geometry.positions[offset + 2]).toBe(before.geometry.positions[offset + 2]);
  });

  it("deletes a copied mesh only after confirming the destructive dialog", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    const setScene = vi.fn();
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();

    root.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]')?.click();
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ meshId: "copy-1" }));
    root.querySelector<HTMLButtonElement>('[data-dialog-action="delete"]')?.click();

    expect(root.querySelectorAll(".facial-mesh-row")).toHaveLength(1);
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ meshId: "base" }));
  });

  it("rejects a tap whose scene changed after pointer-down", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
        pickVertex: vi.fn(() => 2),
        dispose: vi.fn(),
      }),
    });

    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));

    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({
      meshId: "copy-1",
      selectedVertex: null,
    }));
    expect(root.querySelector<HTMLElement>(".vertex-gizmo")?.hidden).toBe(true);
  });

  it("reprojects the selected gizmo after a camera or viewport change", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    let viewChanged: (() => void) | undefined;
    const detachViewChange = vi.fn();
    const projectVertex = vi.fn(() => ({ x: 120, y: 80 }));
    const viewport = {
      setScene: vi.fn(),
      projectVertex,
      pickVertex: vi.fn(() => 2),
      subscribeViewChange: (listener: () => void) => {
        viewChanged = listener;
        return detachViewChange;
      },
      dispose: vi.fn(),
    } as FacialViewportPort & { subscribeViewChange(listener: () => void): () => void };
    const runtime = startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => viewport,
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    projectVertex.mockReturnValue({ x: 200, y: 140 });

    viewChanged?.();

    expect(root.querySelector<HTMLElement>(".vertex-gizmo")?.style.transform)
      .toBe("translate(200px, 140px)");
    runtime.dispose();
    expect(detachViewChange).toHaveBeenCalledOnce();
  });

  it("moves the selected vertex from an X-axis gizmo drag", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    const viewport: FacialViewportPort = {
      setScene,
      projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
      pickVertex: vi.fn(() => 0),
      dispose: vi.fn(),
    };
    startFacialRuntime({
      canvas,
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startViewport: () => viewport,
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    const selectedScene = setScene.mock.lastCall?.[0] as FacialViewportScene | undefined;
    const before = selectedScene?.geometry.positions[0] ?? 0;
    const handle = root.querySelector<HTMLButtonElement>('[data-axis="x"]');
    if (!handle) throw new Error("X gizmo handle missing");

    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 20, 10));
    handle.dispatchEvent(pointerEvent("pointerup", 20, 10));

    const movedScene = setScene.mock.lastCall?.[0] as FacialViewportScene | undefined;
    expect(movedScene?.geometry.positions[0]).toBeCloseTo(before + 0.1);
  });
});
