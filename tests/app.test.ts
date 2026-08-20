import { describe, expect, it, vi } from "vitest";

import { mountOctoPolyApp } from "../src/app";
import { FACIAL_WORKSPACE_STORAGE_KEY } from "../src/facial/storage";
import type { FacialRuntimeOptions } from "../src/facial/runtime";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("OctoPoly app composition", () => {
  it("starts exactly one Facial runtime as the selected default without mounting the cube first", () => {
    const root = document.createElement("div");
    const disposeFacial = vi.fn();
    const startCube = vi.fn(() => vi.fn());
    const loadPresetText = vi.fn(async () => "preset");
    const decodeTextureImage = vi.fn(async () => ({ close: vi.fn() } as unknown as ImageBitmap));
    const downloadProject = vi.fn();
    const startFacial = vi.fn((_options: FacialRuntimeOptions) => ({ dispose: disposeFacial }));
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText,
      decodeTextureImage,
      downloadProject,
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    facial.click();

    expect(startCube).not.toHaveBeenCalled();
    expect(startFacial).toHaveBeenCalledOnce();
    expect(startFacial.mock.calls[0]?.[0].panelContainer.className).toBe("facial-panel-layer");
    expect(startFacial.mock.calls[0]?.[0].overlayContainer.className).toBe("viewport-overlay");
    expect(startFacial.mock.calls[0]?.[0].loadPresetText).toBe(loadPresetText);
    expect(startFacial.mock.calls[0]?.[0].decodeTextureImage).toBe(decodeTextureImage);
    expect(startFacial.mock.calls[0]?.[0].downloadProject).toBe(downloadProject);
    expect(facial.getAttribute("aria-pressed")).toBe("true");
    expect(facial.getAttribute("aria-current")).toBe("true");
    expect(root.querySelector("canvas")?.getAttribute("aria-label")).toBe("편집 가능한 페이셜 메시 3D 뷰포트");
    expect(root.querySelector(".status")?.textContent).toBe("페이셜 모드");

    app.dispose();
    app.dispose();
    expect(disposeFacial).toHaveBeenCalledOnce();
  });

  it("resets a Facial project to the initial cube and clears its persisted workspace", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "saved workspace");
    const disposeFacial = vi.fn();
    const disposeCube = vi.fn();
    const startCube = vi.fn(() => disposeCube);
    const startFacial = vi.fn((_options: FacialRuntimeOptions) => ({ dispose: disposeFacial }));
    const app = mountOctoPolyApp(root, {
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });

    startFacial.mock.calls[0]![0].onNewProject!();

    expect(disposeFacial).toHaveBeenCalledOnce();
    expect(startCube).toHaveBeenCalledOnce();
    expect(storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(root.querySelector("canvas")?.getAttribute("aria-label")).toBe("기본 큐브가 있는 3D 뷰포트");
    expect(root.querySelector(".status")?.textContent).toBe("새 작업");
    expect(root.querySelector('[data-mode="facial"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector('[data-mode="facial"]')?.getAttribute("aria-current")).toBeNull();

    app.dispose();
    expect(disposeCube).toHaveBeenCalledOnce();
  });

  it.each(["cube", "storage"] as const)(
    "rolls New Project back to the saved Facial workspace when %s reset staging fails",
    (failure) => {
      const root = document.createElement("div");
      const storage = new MemoryStorage();
      storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "saved workspace");
      if (failure === "storage") {
        vi.spyOn(storage, "removeItem").mockImplementation(() => { throw new Error("remove failed"); });
      }
      const facialDisposers = [vi.fn(), vi.fn()];
      const startFacial = vi.fn((_options: FacialRuntimeOptions) => ({
        dispose: facialDisposers[startFacial.mock.calls.length - 1]!,
      }));
      const disposeCube = vi.fn();
      const startCube = failure === "cube"
        ? vi.fn(() => { throw new Error("cube failed"); })
        : vi.fn(() => disposeCube);
      const app = mountOctoPolyApp(root, {
        storage,
        nextCopyId: () => "copy-1",
        parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
        loadPresetText: vi.fn(async () => "preset"),
        startCube,
        startFacial,
        startViewport: vi.fn(),
      });

      startFacial.mock.calls[0]![0].onNewProject!();

      expect(facialDisposers[0]).toHaveBeenCalledOnce();
      expect(startFacial).toHaveBeenCalledTimes(2);
      expect(storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY)).toBe("saved workspace");
      expect(root.querySelector("canvas")?.getAttribute("aria-label")).toBe("편집 가능한 페이셜 메시 3D 뷰포트");
      expect(root.querySelector('[data-mode="facial"]')?.getAttribute("aria-pressed")).toBe("true");
      expect(root.querySelector('[data-mode="facial"]')?.getAttribute("aria-current")).toBe("true");
      if (failure === "storage") expect(disposeCube).toHaveBeenCalledOnce();

      app.dispose();
      expect(facialDisposers[1]).toHaveBeenCalledOnce();
    },
  );

  it("restores saved workspace bytes when removeItem deletes before throwing", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "saved workspace");
    vi.spyOn(storage, "removeItem").mockImplementation((key) => {
      storage.values.delete(key);
      throw new Error("remove failed after delete");
    });
    const observedWorkspace = vi.fn(() => storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY));
    const startFacial = vi.fn((_options: FacialRuntimeOptions) => {
      observedWorkspace();
      return { dispose: vi.fn() };
    });
    const app = mountOctoPolyApp(root, {
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => vi.fn()),
      startFacial,
      startViewport: vi.fn(),
    });

    startFacial.mock.calls[0]![0].onNewProject!();

    expect(observedWorkspace.mock.results.map(({ value }) => value))
      .toEqual(["saved workspace", "saved workspace"]);
    expect(storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY)).toBe("saved workspace");
    app.dispose();
  });

  it("keeps the cube until saved workspace restoration succeeds on retry", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "saved workspace");
    vi.spyOn(storage, "removeItem").mockImplementation((key) => {
      storage.values.delete(key);
      throw new Error("remove failed after delete");
    });
    vi.spyOn(storage, "setItem")
      .mockImplementationOnce(() => { throw new Error("restore failed"); })
      .mockImplementation((key, value) => storage.values.set(key, value));
    const cubeDispose = vi.fn();
    const observedWorkspace = vi.fn(() => storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY));
    const startFacial = vi.fn((_options: FacialRuntimeOptions) => {
      observedWorkspace();
      return { dispose: vi.fn() };
    });
    const app = mountOctoPolyApp(root, {
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => cubeDispose),
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    startFacial.mock.calls[0]![0].onNewProject!();

    expect(startFacial).toHaveBeenCalledOnce();
    expect(cubeDispose).not.toHaveBeenCalled();
    expect(facial.getAttribute("aria-current")).not.toBe("true");
    facial.click();
    expect(storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY)).toBe("saved workspace");
    expect(cubeDispose).toHaveBeenCalledOnce();
    expect(startFacial).toHaveBeenCalledTimes(2);
    expect(observedWorkspace.mock.results.at(-1)?.value).toBe("saved workspace");
    app.dispose();
  });

  it("keeps one cube owner and permits retry when New Project rollback cleanup throws", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "saved workspace");
    vi.spyOn(storage, "removeItem").mockImplementation(() => { throw new Error("remove failed"); });
    const cubeDispose = vi.fn()
      .mockImplementationOnce(() => { throw new Error("cube cleanup failed"); })
      .mockImplementationOnce(() => undefined);
    const facialDisposers = [vi.fn(), vi.fn()];
    const startFacial = vi.fn((_options: FacialRuntimeOptions) => ({
      dispose: facialDisposers[startFacial.mock.calls.length - 1]!,
    }));
    const app = mountOctoPolyApp(root, {
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => cubeDispose),
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    startFacial.mock.calls[0]![0].onNewProject!();

    expect(startFacial).toHaveBeenCalledOnce();
    expect(cubeDispose).toHaveBeenCalledOnce();
    expect(facial.getAttribute("aria-current")).not.toBe("true");
    facial.click();
    expect(cubeDispose).toHaveBeenCalledTimes(2);
    expect(startFacial).toHaveBeenCalledTimes(2);
    expect(facial.getAttribute("aria-current")).toBe("true");
    app.dispose();
  });

  it("permits retry when restarting Facial during New Project rollback throws", () => {
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "saved workspace");
    vi.spyOn(storage, "removeItem").mockImplementation(() => { throw new Error("remove failed"); });
    const initialDispose = vi.fn();
    const retryDispose = vi.fn();
    const startFacial = vi.fn()
      .mockImplementationOnce(() => ({ dispose: initialDispose }))
      .mockImplementationOnce(() => { throw new Error("rollback startup failed"); })
      .mockImplementationOnce(() => ({ dispose: retryDispose }));
    const app = mountOctoPolyApp(root, {
      storage,
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => vi.fn()),
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    startFacial.mock.calls[0]![0].onNewProject!();

    expect(startFacial).toHaveBeenCalledTimes(2);
    expect(facial.getAttribute("aria-current")).not.toBe("true");
    facial.click();
    expect(startFacial).toHaveBeenCalledTimes(3);
    expect(facial.getAttribute("aria-current")).toBe("true");
    app.dispose();
    expect(retryDispose).toHaveBeenCalledOnce();
  });

  it("moves focus to the canvas after keyboard-activated New Project", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => vi.fn()),
      startViewport: vi.fn(() => ({
        setScene: vi.fn(), projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null), dispose: vi.fn(),
      })),
    });
    try {
      root.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!.click();
      const newProject = root.querySelector<HTMLButtonElement>('[data-action="new-project"]')!;
      const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
      newProject.focus();

      newProject.click();

      expect(document.activeElement).toBe(canvas);
    } finally {
      app.dispose();
      root.remove();
    }
  });

  it("closes a mesh dialog on Escape without changing an open app menu", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => vi.fn()),
      startViewport: vi.fn(() => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      })),
    });

    try {
      root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-action="toggle-mesh-drawer"]')!.click();
      root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.click();
      const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle")!;
      const menu = root.querySelector<HTMLElement>(".app-menu")!;
      menuToggle.click();
      root.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')!.click();
      const trigger = root.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')!;
      trigger.click();
      const input = root.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
      expect(document.activeElement).toBe(input);

      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));

      expect(root.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
      expect(document.activeElement).toBe(trigger);
      expect(menuToggle.getAttribute("aria-expanded")).toBe("true");
      expect(menu.hidden).toBe(false);
    } finally {
      app.dispose();
      root.remove();
    }
  });

  it("closes only the app menu when Escape bubbles from its focused trigger", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => vi.fn()),
      startViewport: vi.fn(() => ({
        setScene: vi.fn(),
        projectVertex: vi.fn(() => null),
        pickVertex: vi.fn(() => null),
        dispose: vi.fn(),
      })),
    });
    const backgroundKeydown = vi.fn();
    document.addEventListener("keydown", backgroundKeydown);

    try {
      root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!.click();
      const drawerToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-mesh-drawer"]')!;
      const drawer = root.querySelector<HTMLElement>(".facial-mesh-drawer")!;
      drawerToggle.click();
      const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle")!;
      const menu = root.querySelector<HTMLElement>(".app-menu")!;
      menuToggle.focus();
      menuToggle.click();
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });

      menuToggle.dispatchEvent(escape);

      expect(menu.hidden).toBe(true);
      expect(menuToggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(menuToggle);
      expect(drawer.dataset.open).toBe("true");
      expect(drawerToggle.getAttribute("aria-expanded")).toBe("true");
      expect(escape.defaultPrevented).toBe(true);
      expect(backgroundKeydown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", backgroundKeydown);
      app.dispose();
      root.remove();
    }
  });

  it("restores the cube and permits retry after Facial startup fails", () => {
    const root = document.createElement("div");
    const cubeDisposers = [vi.fn(), vi.fn()];
    const startCube = vi.fn(() => cubeDisposers[startCube.mock.calls.length - 1]!);
    const disposeFacial = vi.fn();
    const startFacial = vi.fn()
      .mockImplementationOnce(() => { throw new Error("transient startup failure"); })
      .mockImplementationOnce(() => ({ dispose: disposeFacial }));
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    expect(startFacial).toHaveBeenCalledOnce();
    expect(startCube).toHaveBeenCalledOnce();
    expect(facial.getAttribute("aria-pressed")).toBe("false");
    expect(facial.getAttribute("aria-current")).not.toBe("true");
    expect(root.querySelector(".status")?.textContent).toBe("transient startup failure");

    facial.click();
    expect(startFacial).toHaveBeenCalledTimes(2);
    expect(startCube).toHaveBeenCalledOnce();
    expect(cubeDisposers[0]).toHaveBeenCalledOnce();
    expect(facial.getAttribute("aria-current")).toBe("true");
    expect(root.querySelector(".status")?.textContent).toBe("페이셜 모드");

    app.dispose();
  });

  it("rolls back and permits retry when disposing the fallback cube throws", () => {
    const root = document.createElement("div");
    const brokenCubeDispose = vi.fn()
      .mockImplementationOnce(() => { throw new Error("cube cleanup failed"); })
      .mockImplementationOnce(() => undefined);
    const startCube = vi.fn(() => brokenCubeDispose);
    const startFacial = vi.fn()
      .mockImplementationOnce(() => { throw new Error("initial Facial failure"); })
      .mockImplementation(() => ({ dispose: vi.fn() }));
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    expect(startFacial).toHaveBeenCalledOnce();
    expect(startCube).toHaveBeenCalledOnce();
    facial.click();
    expect(startFacial).toHaveBeenCalledOnce();
    expect(startCube).toHaveBeenCalledOnce();
    expect(brokenCubeDispose).toHaveBeenCalledOnce();
    expect(facial.getAttribute("aria-current")).not.toBe("true");
    expect(root.querySelector(".status")?.textContent).toBe("cube cleanup failed");

    facial.click();
    expect(startFacial).toHaveBeenCalledTimes(2);
    expect(startCube).toHaveBeenCalledOnce();
    expect(brokenCubeDispose).toHaveBeenCalledTimes(2);
    expect(facial.getAttribute("aria-current")).toBe("true");

    app.dispose();
  });

  it("always disposes the shell when the active runtime disposer throws", () => {
    const root = document.createElement("div");
    const disposeRuntime = vi.fn(() => { throw new Error("runtime cleanup failed"); });
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      loadPresetText: vi.fn(async () => "preset"),
      startCube: vi.fn(() => vi.fn()),
      startFacial: vi.fn(() => ({ dispose: disposeRuntime })),
      startViewport: vi.fn(),
    });
    const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle")!;

    expect(() => app.dispose()).toThrow("runtime cleanup failed");
    menuToggle.click();
    expect(menuToggle.getAttribute("aria-expanded")).toBe("false");
    expect(() => app.dispose()).not.toThrow();
  });
});
