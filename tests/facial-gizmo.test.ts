import { describe, expect, it, vi } from "vitest";

import { axisDragDelta, mountVertexGizmo } from "../src/facial/gizmo";

describe("facial gizmo math", () => {
  it("maps horizontal drag to X-axis movement", () => {
    expect(axisDragDelta("x", 20, 8, 0.01)).toBeCloseTo(0.2);
  });

  it("maps upward screen drag to positive Y-axis movement", () => {
    expect(axisDragDelta("y", 5, -30, 0.01)).toBeCloseTo(0.3);
  });

  it("projects drag onto the upward-right Z handle", () => {
    expect(axisDragDelta("z", 10, -10, 0.01)).toBeCloseTo(Math.SQRT2 * 0.1);
  });

  it("projects drag onto the current camera-projected world axis", () => {
    const projectedDelta = axisDragDelta as unknown as (
      axis: "x",
      deltaX: number,
      deltaY: number,
      unitsPerPixel: number,
      direction: { x: number; y: number },
    ) => number;

    expect(projectedDelta("x", 0, 20, 0.01, { x: 0, y: 1 })).toBeCloseTo(0.2);
  });

  it("shows three axis handles at the selected vertex screen position", () => {
    const container = document.createElement("div");
    const gizmo = mountVertexGizmo(container, { onMove: () => undefined });

    gizmo.show({ x: 120, y: 80 });

    expect(gizmo.element.hidden).toBe(false);
    expect(gizmo.element.style.transform).toBe("translate(120px, 80px)");
    expect([...gizmo.element.querySelectorAll<HTMLButtonElement>("[data-axis]")]
      .map((handle) => handle.dataset.axis)).toEqual(["x", "y", "z"]);

    gizmo.show(null);
    expect(gizmo.element.hidden).toBe(true);
  });

  it("updates pointer and keyboard movement to the active mesh scale", () => {
    const container = document.createElement("div");
    const onMove = vi.fn();
    const gizmo = mountVertexGizmo(container, { onMove });
    gizmo.setMovementScale(0.000_01, 0.000_1);
    const handle = gizmo.element.querySelector<HTMLButtonElement>('[data-axis="x"]')!;

    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 10 }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 20, clientY: 10 }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(onMove).toHaveBeenNthCalledWith(1, "x", 0.000_1);
    expect(onMove).toHaveBeenNthCalledWith(2, "x", 0.000_1);
  });

  it("owns pointer drag on an axis handle and emits only that axis delta", () => {
    const container = document.createElement("div");
    const viewportMove = vi.fn();
    const onMove = vi.fn();
    container.addEventListener("pointermove", viewportMove);
    const gizmo = mountVertexGizmo(container, { onMove });
    const handle = gizmo.element.querySelector<HTMLButtonElement>('[data-axis="x"]');
    if (!handle) throw new Error("X handle missing");

    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 25, clientY: 30 }));
    handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 25, clientY: 30 }));

    expect(onMove).toHaveBeenCalledWith("x", 0.15);
    expect(viewportMove).not.toHaveBeenCalled();
  });

  it("keeps the first primary pointer as owner and ignores additional pointers", () => {
    const container = document.createElement("div");
    const onMove = vi.fn();
    const gizmo = mountVertexGizmo(container, { onMove });
    const handle = gizmo.element.querySelector<HTMLButtonElement>('[data-axis="x"]');
    if (!handle) throw new Error("X handle missing");
    handle.setPointerCapture = vi.fn();
    const pointerEvent = (type: string, pointerId: number, x: number): MouseEvent => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 10 });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        isPrimary: { value: true },
      });
      return event;
    };

    handle.dispatchEvent(pointerEvent("pointerdown", 7, 10));
    handle.dispatchEvent(pointerEvent("pointerdown", 8, 100));
    handle.dispatchEvent(pointerEvent("pointermove", 7, 20));

    expect(handle.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
    expect(onMove).toHaveBeenCalledWith("x", 0.1);
  });

  it("moves an axis from keyboard arrow controls", () => {
    const container = document.createElement("div");
    const onMove = vi.fn();
    const gizmo = mountVertexGizmo(container, { onMove });
    const handle = gizmo.element.querySelector<HTMLButtonElement>('[data-axis="y"]');
    if (!handle) throw new Error("Y handle missing");

    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    expect(onMove).toHaveBeenNthCalledWith(1, "y", 0.1);
    expect(onMove).toHaveBeenNthCalledWith(2, "y", -0.1);
  });

  it("releases an owned pointer when disposed during a drag", () => {
    const container = document.createElement("div");
    const onMove = vi.fn();
    const gizmo = mountVertexGizmo(container, { onMove });
    const handle = gizmo.element.querySelector<HTMLButtonElement>('[data-axis="x"]');
    if (!handle) throw new Error("X handle missing");
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
    const down = new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 });
    Object.defineProperty(down, "pointerId", { value: 7 });
    handle.dispatchEvent(down);

    gizmo.dispose();
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 10 }));

    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("stops a drag when pointer capture is lost", () => {
    const container = document.createElement("div");
    const onMove = vi.fn();
    const gizmo = mountVertexGizmo(container, { onMove });
    const handle = gizmo.element.querySelector<HTMLButtonElement>('[data-axis="x"]');
    if (!handle) throw new Error("X handle missing");
    const pointerEvent = (type: string, x: number): MouseEvent => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 });
      Object.defineProperty(event, "pointerId", { value: 7 });
      return event;
    };
    handle.dispatchEvent(pointerEvent("pointerdown", 10));

    handle.dispatchEvent(pointerEvent("lostpointercapture", 10));
    handle.dispatchEvent(pointerEvent("pointermove", 20));

    expect(onMove).not.toHaveBeenCalled();
  });
});
