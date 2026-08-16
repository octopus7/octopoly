import { describe, expect, it, vi } from "vitest";

import {
  startFacialRuntime,
  type FacialViewportPort,
} from "../src/facial/runtime";
import type { FacialViewportScene } from "../src/facial/scene";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
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

describe("facial runtime composition", () => {
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

    root.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();

    expect(initialScene?.meshId).toBe("base");
    expect(setScene).toHaveBeenLastCalledWith(expect.objectContaining({ meshId: "copy-1" }));
    expect(root.querySelector('[data-mesh-id="copy-1"]')).not.toBeNull();
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
