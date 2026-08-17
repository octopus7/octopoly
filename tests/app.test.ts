import { describe, expect, it, vi } from "vitest";

import { mountOctoPolyApp } from "../src/app";
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
  it("replaces the cube with one Facial runtime on first Facial selection", () => {
    const root = document.createElement("div");
    const stopCube = vi.fn();
    const disposeFacial = vi.fn();
    const startCube = vi.fn(() => stopCube);
    const startFacial = vi.fn((_options: FacialRuntimeOptions) => ({ dispose: disposeFacial }));
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });

    root.querySelector<HTMLButtonElement>('[data-mode="facial"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-mode="facial"]')?.click();

    expect(startCube).toHaveBeenCalledOnce();
    expect(stopCube).toHaveBeenCalledOnce();
    expect(startFacial).toHaveBeenCalledOnce();
    expect(startFacial.mock.calls[0]?.[0].panelContainer.className).toBe("facial-panel-layer");
    expect(startFacial.mock.calls[0]?.[0].overlayContainer.className).toBe("viewport-overlay");
    expect(root.querySelector(".status")?.textContent).toBe("페이셜 모드");

    app.dispose();
    app.dispose();
    expect(disposeFacial).toHaveBeenCalledOnce();
  });

  it("closes a mesh dialog on Escape without changing an open app menu", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
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
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    facial.click();
    expect(startFacial).toHaveBeenCalledOnce();
    expect(startCube).toHaveBeenCalledTimes(2);
    expect(facial.getAttribute("aria-current")).not.toBe("true");
    expect(root.querySelector(".status")?.textContent).toBe("transient startup failure");

    facial.click();
    expect(startFacial).toHaveBeenCalledTimes(2);
    expect(facial.getAttribute("aria-current")).toBe("true");
    expect(root.querySelector(".status")?.textContent).toBe("페이셜 모드");

    app.dispose();
  });

  it("rolls back and permits retry when the current runtime disposer throws", () => {
    const root = document.createElement("div");
    const brokenCubeDispose = vi.fn(() => { throw new Error("cube cleanup failed"); });
    const recoveredCubeDispose = vi.fn();
    const startCube = vi.fn()
      .mockImplementationOnce(() => brokenCubeDispose)
      .mockImplementationOnce(() => recoveredCubeDispose);
    const startFacial = vi.fn(() => ({ dispose: vi.fn() }));
    const app = mountOctoPolyApp(root, {
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
      startCube,
      startFacial,
      startViewport: vi.fn(),
    });
    const facial = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;

    facial.click();
    expect(startFacial).not.toHaveBeenCalled();
    expect(startCube).toHaveBeenCalledTimes(2);
    expect(facial.getAttribute("aria-current")).not.toBe("true");

    facial.click();
    expect(startFacial).toHaveBeenCalledOnce();
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
      startCube: vi.fn(() => disposeRuntime),
      startFacial: vi.fn(),
      startViewport: vi.fn(),
    });
    const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle")!;

    expect(() => app.dispose()).toThrow("runtime cleanup failed");
    menuToggle.click();
    expect(menuToggle.getAttribute("aria-expanded")).toBe("false");
    expect(() => app.dispose()).not.toThrow();
  });
});
