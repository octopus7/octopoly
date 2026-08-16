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
