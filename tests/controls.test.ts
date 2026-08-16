import { describe, expect, it, vi } from "vitest";

import { OrbitCamera } from "../src/viewport/camera";
import { attachCameraControls } from "../src/viewport/controls";

function pointerEvent(
  type: string,
  pointerId: number,
  pointerType: "mouse" | "touch",
  x: number,
  y: number,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    clientX: { value: x },
    clientY: { value: y },
    button: { value: 0 },
  });
  return event as PointerEvent;
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "setPointerCapture", { value: vi.fn() });
  return canvas;
}

describe("camera controls", () => {
  it("orbits with a primary mouse drag", () => {
    const canvas = createCanvas();
    const camera = new OrbitCamera();
    const invalidate = vi.fn();
    const detach = attachCameraControls(canvas, camera, invalidate);
    const initialYaw = camera.state().yaw;
    const initialPitch = camera.state().pitch;

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, "mouse", 20, 20));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, "mouse", 60, 35));

    expect(camera.state().yaw).not.toBe(initialYaw);
    expect(camera.state().pitch).toBeLessThan(initialPitch);
    expect(invalidate).toHaveBeenCalledOnce();
    detach();
  });

  it("keeps the horizontal orbit direction for one-finger touch drag", () => {
    const canvas = createCanvas();
    const camera = new OrbitCamera();
    const detach = attachCameraControls(canvas, camera, vi.fn());
    const initialYaw = camera.state().yaw;

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, "touch", 50, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, "touch", 80, 50));

    expect(camera.state().yaw).toBeLessThan(initialYaw);
    detach();
  });

  it("reverses the vertical orbit direction for one-finger touch drag", () => {
    const canvas = createCanvas();
    const camera = new OrbitCamera();
    const detach = attachCameraControls(canvas, camera, vi.fn());
    const initialPitch = camera.state().pitch;

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, "touch", 50, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, "touch", 50, 80));

    expect(camera.state().pitch).toBeGreaterThan(initialPitch);
    detach();
  });

  it("zooms with a two-finger touch pinch", () => {
    const canvas = createCanvas();
    const camera = new OrbitCamera();
    const detach = attachCameraControls(canvas, camera, vi.fn());
    const initialDistance = camera.state().distance;

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, "touch", 50, 50));
    canvas.dispatchEvent(pointerEvent("pointerdown", 2, "touch", 150, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 2, "touch", 200, 50));

    expect(camera.state().distance).toBeLessThan(initialDistance);
    detach();
  });
});
