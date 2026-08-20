import { describe, expect, it, vi } from "vitest";

import {
  startFacialRuntime,
  type FacialViewportPort,
} from "../src/facial/runtime";
import type { FacialViewportScene } from "../src/facial/scene";
import { FACIAL_WORKSPACE_STORAGE_KEY } from "../src/facial/storage";
import {
  decodeOctopolyProject,
  encodeOctopolyProject as encodeProjectArchive,
  OCTOPOLY_ARCHIVE_LIMITS,
  OCTOPOLY_PROJECT_FILENAME,
  type OctopolyProjectSnapshot,
} from "../src/facial/project-codec";
import type { FacialWorkspace } from "../src/facial/workspace";

const TEST_CAMERA_STATE = Object.freeze({
  yaw: 0.4,
  pitch: -0.2,
  distance: 3.8,
  target: [0.1, 0.2, -0.1] as const,
});

function encodeOctopolyProject(
  snapshot: Omit<OctopolyProjectSnapshot, "cameraState"> & Partial<Pick<OctopolyProjectSnapshot, "cameraState">>,
): Uint8Array {
  return encodeProjectArchive({ ...snapshot, cameraState: snapshot.cameraState ?? TEST_CAMERA_STATE });
}

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

  removeItem(key: string): void {
    this.values.delete(key);
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

const VALID_PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const VALID_JPEG_BYTES = new Uint8Array([255, 216, 255, 224, 1]);

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
    const bitmap = { width: 2, height: 2, close } as unknown as ImageBitmap;
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
    const file = new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" });
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

  it("rejects a direct texture whose decoded dimensions exceed the project limit", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const bitmap = { width: 4097, height: 1, close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(async () => bitmap),
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([VALID_PNG_BYTES], "too-wide.png", { type: "image/png" })],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/4096/),
    })));
    expect(setTexture).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("rejects direct texture bytes whose signature disagrees with the declared MIME", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(async () => bitmap),
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([VALID_JPEG_BYTES], "mislabeled.png", { type: "image/png" })],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/MIME/),
    })));
    expect(setTexture).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("enforces the aggregate decoded-pixel budget across direct model textures", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const geometry = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0, 1],
    };
    storage.values.set(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
      version: 1,
      activeMeshId: "base",
      meshes: [
        { id: "base", name: "Base Mask", kind: "base", geometry },
        { id: "copy-1", name: "Copy 1", kind: "copy", geometry },
        { id: "copy-2", name: "Copy 2", kind: "copy", geometry },
      ],
    }));
    const bitmaps = Array.from({ length: 3 }, () => ({
      width: 4096,
      height: 4096,
      close: vi.fn(),
    } as unknown as ImageBitmap));
    const decodeTextureImage = vi.fn()
      .mockResolvedValueOnce(bitmaps[0])
      .mockResolvedValueOnce(bitmaps[1])
      .mockResolvedValueOnce(bitmaps[2]);
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-3", parseObjText: vi.fn(), onError, decodeTextureImage,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    const load = async (meshId: string, expectedUploads: number): Promise<void> => {
      root.querySelector<HTMLButtonElement>(`[data-mesh-id="${meshId}"]`)!.click();
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([VALID_PNG_BYTES], `${meshId}.png`, { type: "image/png" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (expectedUploads > 0) await vi.waitFor(() => expect(setTexture).toHaveBeenCalledTimes(expectedUploads));
    };

    await load("base", 1);
    await load("copy-1", 2);
    await load("copy-2", 0);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/전체 해상도/),
    })));

    expect(setTexture).toHaveBeenCalledTimes(2);
    expect(bitmaps[2]!.close).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("requests an app-level reset from the New Project command", () => {
    const root = document.createElement("div");
    const onNewProject = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"),
      panelContainer: root,
      overlayContainer: root,
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(),
      onNewProject,
      startViewport: () => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    });

    root.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-action="new-project"]')!.click();

    expect(onNewProject).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("saves the current project with source bytes retained only after a successful texture upload", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const downloadProject = vi.fn();
    const setTexture = vi.fn();
    const cameraState = vi.fn(() => TEST_CAMERA_STATE);
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: vi.fn(async () => bitmap),
      downloadProject,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(), cameraState,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const textureBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
    const textureInput = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(textureInput, "files", {
      configurable: true,
      value: [new File([textureBytes], "surface.png", { type: "image/png" })],
    });

    textureInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(setTexture).toHaveBeenCalledOnce());
    root.querySelector<HTMLButtonElement>('[data-action="save-project"]')!.click();

    expect(downloadProject).toHaveBeenCalledOnce();
    const [archive, filename] = downloadProject.mock.calls[0]!;
    expect(filename).toBe(OCTOPOLY_PROJECT_FILENAME);
    const restored = decodeOctopolyProject(archive);
    expect(restored.workspace.activeMeshId).toBe("base");
    expect(restored.selectedVertex).toBeNull();
    expect(restored.movementState.mode).toBe("gizmo");
    expect(restored.cameraState).toEqual(TEST_CAMERA_STATE);
    expect(restored.textures).toEqual([{
      modelId: "base",
      mimeType: "image/png",
      originalFilename: "surface.png",
      bytes: textureBytes,
    }]);
    expect([...storage.values.values()].some((value) => value.includes("surface.png"))).toBe(false);
    runtime.dispose();
  });

  it("downloads distinct deterministic OBJ files for all models and the active model", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const downloadObj = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), downloadObj,
      startViewport: () => ({
        setScene: vi.fn(), projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });

    root.querySelector<HTMLButtonElement>('[data-action="export-all-obj"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-action="export-active-obj"]')!.click();

    expect(downloadObj).toHaveBeenCalledTimes(2);
    expect(downloadObj.mock.calls[0]?.[1]).toBe("octopoly-all.obj");
    expect(downloadObj.mock.calls[1]?.[1]).toBe("octopoly-current.obj");
    expect(downloadObj.mock.calls[0]?.[0]).toContain("# OctoPoly OBJ export");
    expect(downloadObj.mock.calls[1]?.[0]).toContain("o Base_Mask");
    runtime.dispose();
  });

  it("opens a validated project by staging textures before publishing workspace, selection, and movement state", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const textureBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9]);
    const projectWorkspace: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: {
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
          uvs: [0, 0, 1, 0, 0, 1],
        },
      }],
    };
    const archive = encodeOctopolyProject({
      workspace: projectWorkspace,
      selectedVertex: 2,
      movementState: {
        mode: "constrained-plane",
        enabledConstrainedPlanes: ["yz", "xz"],
        activeConstrainedPlane: "xz",
        constrainedPlaneScreenSpace: true,
      },
      textures: [{ modelId: "base", mimeType: "image/png", bytes: textureBytes }],
    });
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const commit = vi.fn();
    const disposeStage = vi.fn();
    const textureFinalize = vi.fn(() => { throw new Error("cleanup failed"); });
    const prepareTextures = vi.fn(() => ({
      commit,
      dispose: disposeStage,
      finalize: textureFinalize,
    }));
    const sceneCommit = vi.fn();
    const sceneDispose = vi.fn();
    const sceneFinalize = vi.fn();
    const prepareScene = vi.fn(() => ({
      commit: sceneCommit,
      dispose: sceneDispose,
      finalize: sceneFinalize,
    }));
    const setScene = vi.fn();
    let activeCameraState = { yaw: 0, pitch: 0, distance: 6.5, target: [0, 0, 0] as readonly [number, number, number] };
    const cameraState = vi.fn(() => activeCameraState);
    const restoreCameraState = vi.fn((state: typeof activeCameraState) => { activeCameraState = state; });
    const onStatus = vi.fn();
    const onError = vi.fn();
    const downloadProject = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: vi.fn(async () => bitmap),
      downloadProject,
      onStatus, onError,
      startViewport: () => ({
        setScene, prepareScene, prepareTextures, setTexture: vi.fn(), deleteTexture: vi.fn(),
        cameraState, restoreCameraState,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "restored.octopoly", { type: "application/x-octopoly" })],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());

    expect(prepareTextures).toHaveBeenCalledWith([{ textureKey: "base", source: bitmap }]);
    expect(prepareScene).toHaveBeenCalledWith(expect.objectContaining({
      meshId: "base", selectedVertex: 2, textureKey: "base",
    }));
    expect(sceneCommit).toHaveBeenCalledOnce();
    expect(restoreCameraState).toHaveBeenCalledWith(TEST_CAMERA_STATE);
    expect(sceneDispose).not.toHaveBeenCalled();
    expect(sceneFinalize).toHaveBeenCalledOnce();
    expect(textureFinalize).toHaveBeenCalledOnce();
    expect(disposeStage).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledWith("작업 파일을 불러왔습니다.");
    expect(onError).not.toHaveBeenCalled();
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!)).toEqual(projectWorkspace);
    expect(setScene).not.toHaveBeenCalled();
    expect(root.querySelector('[data-movement-mode="constrained-plane"]')?.getAttribute("aria-pressed"))
      .toBe("true");
    expect(root.querySelector('[data-constrained-plane="xz"]')?.getAttribute("aria-pressed"))
      .toBe("true");
    root.querySelector<HTMLButtonElement>('[data-action="save-project"]')!.click();
    expect(downloadProject).toHaveBeenCalledOnce();
    const savedProject = decodeOctopolyProject(downloadProject.mock.calls[0]![0]);
    expect(savedProject.cameraState).toEqual(TEST_CAMERA_STATE);
    expect(savedProject.textures).toEqual([{
      modelId: "base", mimeType: "image/png", bytes: textureBytes,
    }]);
    runtime.dispose();
  });

  it("disposes staged project textures and keeps prior state when project autosave fails", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const before = structuredClone(JSON.parse(JSON.stringify({
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      }],
    })));
    storage.values.set(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify(before));
    const replacement: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: { positions: [0, 0, 1, 2, 0, 1, 0, 2, 1], indices: [0, 1, 2] },
      }],
    };
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: 1,
      movementState: {
        mode: "view-plane",
        enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy",
        constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const commit = vi.fn();
    const disposeStage = vi.fn();
    const setScene = vi.fn();
    const previousCameraState = { yaw: 0, pitch: 0, distance: 6.5, target: [0, 0, 0] as const };
    const restoreCameraState = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene,
        cameraState: () => previousCameraState,
        restoreCameraState,
        prepareTextures: vi.fn(() => ({ commit, dispose: disposeStage })),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    storage.failWrites = true;
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "failed.octopoly")],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(commit).toHaveBeenCalledOnce();
    expect(disposeStage).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!)).toEqual(before);
    expect(setScene).toHaveBeenCalledTimes(2);
    expect(restoreCameraState.mock.calls).toEqual([[TEST_CAMERA_STATE], [previousCameraState]]);
    expect(root.querySelector('[data-movement-mode="gizmo"]')?.getAttribute("aria-pressed")).toBe("true");
    runtime.dispose();
  });

  it("snapshots camera before allocating staged project resources", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const workspace = JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!) as FacialWorkspace;
    const archive = encodeOctopolyProject({
      workspace,
      selectedVertex: null,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const cameraFailure = new Error("camera snapshot failed");
    const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(),
        cameraState: () => { throw cameraFailure; },
        restoreCameraState: vi.fn(),
        prepareTextures,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "camera-failed.octopoly")],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(cameraFailure));

    expect(prepareTextures).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("rejects project load before staging when the viewport cannot snapshot and restore camera state", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const workspace = JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!) as FacialWorkspace;
    const archive = encodeOctopolyProject({
      workspace,
      selectedVertex: null,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "missing-camera-port.octopoly")],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(String(onError.mock.calls[0]?.[0])).toMatch(/camera|카메라/i);
    expect(prepareTextures).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("preserves a scene-preparation error when staged texture cleanup also throws", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const workspace = JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!) as FacialWorkspace;
    const archive = encodeOctopolyProject({
      workspace,
      selectedVertex: null,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const sceneFailure = new Error("scene preparation failed");
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(), onError,
      startViewport: () => ({
        setScene: vi.fn(),
        cameraState: vi.fn(() => TEST_CAMERA_STATE), restoreCameraState: vi.fn(),
        prepareScene: () => { throw sceneFailure; },
        prepareTextures: () => ({
          commit: vi.fn(),
          dispose: () => { throw new Error("texture cleanup failed"); },
        }),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "scene-failure.octopoly")],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError).toHaveBeenCalledWith(sceneFailure);
    runtime.dispose();
  });

  it("rolls back storage, scene, movement, and staged textures when candidate scene publication fails", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const before = storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!;
    const replacement = JSON.parse(before) as FacialWorkspace;
    replacement.meshes[0]!.geometry.positions[2] = 9;
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: 1,
      movementState: {
        mode: "view-plane", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const commit = vi.fn();
    const disposeStage = vi.fn(() => { throw new Error("texture cleanup failed"); });
    const setScene = vi.fn()
      .mockImplementationOnce(() => { throw new Error("scene publication failed"); })
      .mockImplementation(() => undefined);
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene, prepareTextures: vi.fn(() => ({ commit, dispose: disposeStage })),
        cameraState: vi.fn(() => TEST_CAMERA_STATE), restoreCameraState: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "scene-failure.octopoly")],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(before);
    expect(setScene).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
    expect(disposeStage).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-movement-mode="gizmo"]')?.getAttribute("aria-pressed")).toBe("true");
    runtime.dispose();
  });

  it("rolls back movement and leaves the project unpublished when staged texture commit fails", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const before = storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!;
    const replacement = JSON.parse(before) as FacialWorkspace;
    replacement.meshes[0]!.geometry.positions[2] = 7;
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: null,
      movementState: {
        mode: "view-plane", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const disposeStage = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(),
        cameraState: vi.fn(() => TEST_CAMERA_STATE), restoreCameraState: vi.fn(),
        prepareTextures: vi.fn(() => ({
          commit: () => { throw new Error("texture commit failed"); },
          dispose: disposeStage,
        })),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "texture-failure.octopoly")],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(before);
    expect(disposeStage).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-movement-mode="gizmo"]')?.getAttribute("aria-pressed")).toBe("true");
    runtime.dispose();
  });

  it("does not publish a project whose file read completes after a newer workspace command", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const pending = deferred<ArrayBuffer>();
    const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
    const onError = vi.fn();
    const replacement: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: { positions: [0, 0, 2, 2, 0, 2, 0, 2, 2], indices: [0, 1, 2] },
      }],
    };
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: null,
      movementState: {
        mode: "gizmo",
        enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy",
        constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [{ size: archive.length, arrayBuffer: () => pending.promise } as File],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.click();
    pending.resolve(new Uint8Array(archive).buffer as ArrayBuffer);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(prepareTextures).not.toHaveBeenCalled();
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)!).meshes).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("does not publish a pending project after New Project is requested", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const pending = deferred<ArrayBuffer>();
    const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
    const onNewProject = vi.fn();
    const replacement: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: { positions: [0, 0, 2, 2, 0, 2, 0, 2, 2], indices: [0, 1, 2] },
      }],
    };
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: null,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onNewProject,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [{ size: archive.length, arrayBuffer: () => pending.promise } as File],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-action="new-project"]')!.click();
    pending.resolve(new Uint8Array(archive).buffer as ArrayBuffer);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(onNewProject).toHaveBeenCalledOnce();
    expect(prepareTextures).not.toHaveBeenCalled();
    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
    runtime.dispose();
  });

  it.each(["movement", "proportional"] as const)(
    "does not overwrite a newer %s tool change with a stale project load",
    async (tool) => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    const pending = deferred<ArrayBuffer>();
    const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
    const replacement: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: { positions: [0, 0, 3, 3, 0, 3, 0, 3, 3], indices: [0, 1, 2] },
      }],
    };
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: null,
      movementState: {
        mode: "constrained-plane",
        enabledConstrainedPlanes: ["yz", "xz"],
        activeConstrainedPlane: "xz",
        constrainedPlaneScreenSpace: true,
      },
      textures: [],
    });
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [{ size: archive.length, arrayBuffer: () => pending.promise } as File],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    if (tool === "movement") {
      root.querySelector<HTMLButtonElement>('[data-movement-mode="view-plane"]')!.click();
    } else {
      root.querySelector<HTMLButtonElement>('[data-action="toggle-proportional-edit"]')!.click();
    }
    pending.resolve(new Uint8Array(archive).buffer as ArrayBuffer);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(prepareTextures).not.toHaveBeenCalled();
    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
    if (tool === "movement") {
      expect(root.querySelector('[data-movement-mode="view-plane"]')?.getAttribute("aria-pressed")).toBe("true");
    } else {
      expect(root.querySelector('[data-action="toggle-proportional-edit"]')?.getAttribute("aria-pressed")).toBe("true");
    }
    runtime.dispose();
  });

  it("does not overwrite a newer keyboard vertex selection with a stale project load", async () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const storage = new MemoryStorage();
    const pending = deferred<ArrayBuffer>();
    const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
    const replacement: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: { positions: [0, 0, 4, 4, 0, 4, 0, 4, 4], indices: [0, 1, 2] },
      }],
    };
    const archive = encodeOctopolyProject({
      workspace: replacement,
      selectedVertex: null,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const runtime = startFacialRuntime({
      canvas, panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures,
        projectVertex: vi.fn(() => ({ x: 1, y: 1 })), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [{ size: archive.length, arrayBuffer: () => pending.promise } as File],
    });

    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    pending.resolve(new Uint8Array(archive).buffer as ArrayBuffer);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prepareTextures).not.toHaveBeenCalled();
    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
    expect(root.textContent).toContain("정점 1 선택됨");
    runtime.dispose();
  });

  it.each(["keyboard", "button"] as const)(
    "does not publish a pending project after a newer %s Focus command",
    async (source) => {
      const root = document.createElement("div");
      const canvas = document.createElement("canvas");
      root.append(canvas);
      const storage = new MemoryStorage();
      const pending = deferred<ArrayBuffer>();
      const prepareTextures = vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() }));
      const focusVertex = vi.fn();
      const replacement: FacialWorkspace = {
        version: 1,
        activeMeshId: "base",
        meshes: [{
          id: "base", name: "Base Mask", kind: "base",
          geometry: { positions: [0, 0, 7, 1, 0, 7, 0, 1, 7], indices: [0, 1, 2] },
        }],
      };
      const archive = encodeOctopolyProject({
        workspace: replacement,
        selectedVertex: null,
        movementState: {
          mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
          activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
        },
        textures: [],
      });
      const runtime = startFacialRuntime({
        canvas, panelContainer: root, overlayContainer: root,
        storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(),
        decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
        startViewport: () => ({
          setScene: vi.fn(), prepareTextures, focusVertex,
          projectVertex: vi.fn(() => ({ x: 1, y: 1 })),
          pickVertex: vi.fn(() => null), dispose: vi.fn(),
        }),
      });
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [{ size: archive.length, arrayBuffer: () => pending.promise } as File],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));

      if (source === "keyboard") {
        canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
      } else {
        root.querySelector<HTMLButtonElement>('[data-action="focus-selected"]')!.click();
      }
      expect(focusVertex).toHaveBeenCalledOnce();
      pending.resolve(new Uint8Array(archive).buffer as ArrayBuffer);
      await pending.promise;
      await Promise.resolve();
      await Promise.resolve();

      expect(prepareTextures).not.toHaveBeenCalled();
      expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
      expect(root.textContent).toContain("정점 1 선택됨");
      runtime.dispose();
    },
  );

  it("rejects an oversized project file before reading it into memory", () => {
    const root = document.createElement("div");
    const arrayBuffer = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage: new MemoryStorage(), nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage: vi.fn(), downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ size: OCTOPOLY_ARCHIVE_LIMITS.archiveBytes + 1, arrayBuffer } as unknown as File],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/크기 제한/) }));
    runtime.dispose();
  });

  it("routes a synchronous project file read failure without starting decode", () => {
    const root = document.createElement("div");
    const onError = vi.fn();
    const decodeTextureImage = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage: new MemoryStorage(), nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage,
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures: vi.fn(), setTexture: vi.fn(), deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ size: 1, arrayBuffer: () => { throw new Error("read failed"); } } as unknown as File],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "read failed" }));
    expect(decodeTextureImage).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("stops sequential project texture decoding as soon as the aggregate pixel budget is exceeded", async () => {
    const root = document.createElement("div");
    const geometry = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0, 1],
    };
    const workspace: FacialWorkspace = {
      version: 1,
      activeMeshId: "base",
      meshes: Array.from({ length: 4 }, (_, index) => ({
        id: index === 0 ? "base" : `mesh-${index}`,
        name: index === 0 ? "Base Mask" : `Mesh ${index}`,
        kind: index === 0 ? "base" as const : "copy" as const,
        geometry,
      })),
    };
    const archive = encodeOctopolyProject({
      workspace,
      selectedVertex: null,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: workspace.meshes.map((mesh) => ({
        modelId: mesh.id,
        mimeType: "image/png" as const,
        bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      })),
    });
    const bitmaps = Array.from({ length: 4 }, () => ({
      width: 4096,
      height: 4096,
      close: vi.fn(),
    } as unknown as ImageBitmap));
    const decodeTextureImage = vi.fn(async () => bitmaps[decodeTextureImage.mock.calls.length - 1]!);
    const prepareTextures = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage: new MemoryStorage(), nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage, downloadProject: vi.fn(),
      startViewport: () => ({
        setScene: vi.fn(), prepareTextures,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array(archive).buffer as ArrayBuffer], "pixel-budget.octopoly")],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(decodeTextureImage).toHaveBeenCalledTimes(3);
    expect(bitmaps.slice(0, 3).every((bitmap) => vi.mocked(bitmap.close).mock.calls.length === 1)).toBe(true);
    expect(bitmaps[3]!.close).not.toHaveBeenCalled();
    expect(prepareTextures).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("rejects a texture larger than the project per-texture limit before decode or upload", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const decodeTextureImage = vi.fn();
    const setTexture = vi.fn();
    const onError = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), onError,
      decodeTextureImage,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const oversized = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "huge.png", {
      type: "image/png",
    });
    Object.defineProperty(oversized, "size", { value: 16 * 1024 * 1024 + 1 });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [oversized] });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(decodeTextureImage).not.toHaveBeenCalled();
    expect(setTexture).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/크기 제한/) }));
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
    const file = new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" });
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
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(setTexture).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("closes a late direct-texture bitmap when arrayBuffer throws synchronously", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const decodeTextureImage = vi.fn(() => pending.promise);
    const onError = vi.fn();
    const setTexture = vi.fn();
    const runtime = startFacialRuntime({
      canvas: document.createElement("canvas"), panelContainer: root, overlayContainer: root,
      storage, nextCopyId: () => "copy-1", parseObjText: vi.fn(), decodeTextureImage, onError,
      startViewport: () => ({
        setScene: vi.fn(), setTexture, deleteTexture: vi.fn(),
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const input = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    const file = new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: () => { throw new Error("texture read failed"); },
    });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(decodeTextureImage).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "texture read failed" }));
    pending.resolve(bitmap);
    await pending.promise;
    await Promise.resolve();

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(setTexture).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("closes a decoded bitmap without upload when the active model changes during decode", async () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ImageBitmap>();
    const close = vi.fn();
    const bitmap = { width: 2, height: 2, close } as unknown as ImageBitmap;
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
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
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
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
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
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
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
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
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
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
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
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
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
    const firstBitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const secondBitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
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
      value: [new File([VALID_PNG_BYTES, "first"], "first.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([VALID_JPEG_BYTES, "second"], "second.jpg", { type: "image/jpeg" })],
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
    const secondBitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
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
      value: [new File([VALID_PNG_BYTES, "first"], "first.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([VALID_PNG_BYTES, "second"], "second.png", { type: "image/png" })],
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
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
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
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
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
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const setTexture = vi.fn();
    const deleteTexture = vi.fn();
    const setScene = vi.fn();
    const restoreCameraState = vi.fn();
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
        cameraState: () => TEST_CAMERA_STATE,
        restoreCameraState,
        projectVertex: vi.fn(() => null), pickVertex: vi.fn(() => null), dispose: vi.fn(),
      }),
    });
    const textureInput = root.querySelector<HTMLInputElement>('[data-texture-input]')!;
    Object.defineProperty(textureInput, "files", {
      configurable: true,
      value: [new File([VALID_PNG_BYTES], "surface.png", { type: "image/png" })],
    });
    textureInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(setTexture).toHaveBeenCalledOnce());

    root.querySelector<HTMLButtonElement>('[data-preset-id="luna"]')!.click();
    await vi.waitFor(() => expect(setScene).toHaveBeenCalled());

    expect(deleteTexture).toHaveBeenCalledOnce();
    expect(deleteTexture).toHaveBeenCalledWith("base");
    expect(restoreCameraState).not.toHaveBeenCalled();
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

  it("keeps File, movement, and proportional tool popovers mutually exclusive", () => {
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
    const proportionalSettings = root.querySelector<HTMLButtonElement>('[data-action="toggle-proportional-settings"]')!;
    const proportionalPopover = root.querySelector<HTMLElement>(".proportional-controls__popover")!;

    fileToggle.click();
    expect(fileMenu.hidden).toBe(false);
    movementToggle.click();
    expect(movementPopover.hidden).toBe(false);
    expect(fileMenu.hidden).toBe(true);
    expect(fileToggle.getAttribute("aria-expanded")).toBe("false");

    proportionalSettings.click();
    expect(proportionalPopover.hidden).toBe(false);
    expect(movementPopover.hidden).toBe(true);
    expect(movementToggle.getAttribute("aria-expanded")).toBe("false");

    fileToggle.click();
    expect(fileMenu.hidden).toBe(false);
    expect(proportionalPopover.hidden).toBe(true);
    expect(proportionalSettings.getAttribute("aria-expanded")).toBe("false");
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

  it("does not transfer an owned gizmo drag to a selection changed mid-gesture", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const setScene = vi.fn();
    startFacialRuntime({
      canvas, panelContainer: root, overlayContainer: root,
      storage: new MemoryStorage(), nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn(() => ({ x: 120, y: 80 })),
        pickVertex: vi.fn(() => 0),
        dispose: vi.fn(),
      }),
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    const handle = root.querySelector<HTMLButtonElement>('[data-axis="x"]')!;

    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 20, 10));
    const afterFirstMove = [...((setScene.mock.lastCall?.[0] as FacialViewportScene).geometry.positions)];
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    handle.dispatchEvent(pointerEvent("pointermove", 30, 10));
    handle.dispatchEvent(pointerEvent("pointerup", 30, 10));

    expect((setScene.mock.lastCall?.[0] as FacialViewportScene).geometry.positions).toEqual(afterFirstMove);
    expect(root.textContent).toContain("정점 2 선택됨");
  });

  it("does not rebase an active proportional drag onto a newly loaded project", async () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const storage = new MemoryStorage();
    seedUvWorkspace(storage);
    const pending = deferred<ArrayBuffer>();
    const replacementPositions = [10, 0, 0, 10.1, 0, 0, 10, 1, 0];
    const archive = encodeOctopolyProject({
      workspace: {
        version: 1,
        activeMeshId: "base",
        meshes: [{
          id: "base", name: "Base Mask", kind: "base",
          geometry: { positions: replacementPositions, indices: [0, 1, 2] },
        }],
      },
      selectedVertex: 0,
      movementState: {
        mode: "gizmo", enabledConstrainedPlanes: ["xy", "yz", "xz"],
        activeConstrainedPlane: "xy", constrainedPlaneScreenSpace: false,
      },
      textures: [],
    });
    const setScene = vi.fn();
    const runtime = startFacialRuntime({
      canvas, panelContainer: root, overlayContainer: root, storage,
      nextCopyId: () => "copy-1", parseObjText: vi.fn(), decodeTextureImage: vi.fn(),
      startViewport: () => ({
        setScene,
        cameraState: vi.fn(() => TEST_CAMERA_STATE), restoreCameraState: vi.fn(),
        prepareTextures: vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() })),
        projectVertex: vi.fn((index: number) => ({ x: 120 + index * 10, y: 80 })),
        projectRadius: vi.fn(() => 40), pickVertex: vi.fn(() => 0), dispose: vi.fn(),
      }),
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    root.querySelector<HTMLButtonElement>('[data-action="toggle-proportional-edit"]')!.click();
    const projectInput = root.querySelector<HTMLInputElement>('[data-project-input]')!;
    Object.defineProperty(projectInput, "files", {
      configurable: true,
      value: [{ size: archive.length, arrayBuffer: () => pending.promise } as File],
    });
    projectInput.dispatchEvent(new Event("change", { bubbles: true }));
    const handle = root.querySelector<HTMLButtonElement>('[data-axis="x"]')!;
    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));

    pending.resolve(new Uint8Array(archive).buffer as ArrayBuffer);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();
    handle.dispatchEvent(pointerEvent("pointermove", 20, 10));
    handle.dispatchEvent(pointerEvent("pointerup", 20, 10));

    expect((setScene.mock.lastCall?.[0] as FacialViewportScene).geometry.positions)
      .toEqual(replacementPositions);
    runtime.dispose();
  });

  it("moves nearby vertices with falloff when proportional editing is enabled", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const storage = new MemoryStorage();
    storage.values.set(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
      version: 1,
      activeMeshId: "base",
      meshes: [{
        id: "base", name: "Base Mask", kind: "base",
        geometry: {
          positions: [0, 0, 0, 0.1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
        },
      }],
    }));
    const setScene = vi.fn();
    startFacialRuntime({
      canvas, panelContainer: root, overlayContainer: root, storage,
      nextCopyId: () => "copy-1", parseObjText: vi.fn(),
      startViewport: () => ({
        setScene,
        projectVertex: vi.fn((index: number) => ({ x: 120 + index * 10, y: 80 })),
        projectRadius: vi.fn(() => 40),
        pickVertex: vi.fn(() => 0),
        dispose: vi.fn(),
      }),
    });
    canvas.dispatchEvent(pointerEvent("pointerdown", 40, 60));
    canvas.dispatchEvent(pointerEvent("pointerup", 40, 60));
    root.querySelector<HTMLButtonElement>('[data-action="toggle-proportional-edit"]')?.click();
    const influence = root.querySelector<HTMLElement>(".proportional-influence")!;
    expect(influence.hidden).toBe(false);
    expect(influence.querySelector<HTMLElement>(".proportional-influence__ring")?.style.width).toBe("80px");
    expect(influence.querySelectorAll(".proportional-influence__point")).toHaveLength(2);
    const before = [...((setScene.mock.lastCall?.[0] as FacialViewportScene).geometry.positions)];
    const handle = root.querySelector<HTMLButtonElement>('[data-axis="x"]')!;

    handle.dispatchEvent(pointerEvent("pointerdown", 10, 10));
    handle.dispatchEvent(pointerEvent("pointermove", 20, 10));
    const afterFirstMove = [...((setScene.mock.lastCall?.[0] as FacialViewportScene).geometry.positions)];
    handle.dispatchEvent(pointerEvent("pointermove", 30, 10));
    handle.dispatchEvent(pointerEvent("pointerup", 30, 10));

    const after = (setScene.mock.lastCall?.[0] as FacialViewportScene).geometry.positions;
    const selectedDelta = after[0]! - before[0]!;
    const neighborDelta = after[3]! - before[3]!;
    const firstNeighborStep = afterFirstMove[3]! - before[3]!;
    const secondNeighborStep = after[3]! - afterFirstMove[3]!;
    const firstSelectedStep = afterFirstMove[0]! - before[0]!;
    const secondSelectedStep = after[0]! - afterFirstMove[0]!;
    expect(selectedDelta).toBeGreaterThan(0);
    expect(neighborDelta).toBeGreaterThan(0);
    expect(neighborDelta).toBeLessThan(selectedDelta);
    expect(secondNeighborStep / secondSelectedStep).toBeCloseTo(firstNeighborStep / firstSelectedStep, 8);
    expect(after[6]).toBe(before[6]);
  });
});
