import { describe, expect, it, vi } from "vitest";

import type { PointerSample, Tool, ToolContext } from "@octopoly/contracts";

import {
  connectDesktopWheelCamera,
  WorkspaceInputController,
} from "../../src/app/composition/workspace-input";
import { OrbitCameraController } from "../../src/camera";
import { createNormalizedInputSurfaceFactory } from "../../src/input/surface";
import { ToolRuntime } from "../../src/tools/runtime";

const VIEWPORT = Object.freeze({ cssWidth: 400, cssHeight: 300, devicePixelRatio: 1 });

function pointerEvent(
  type: string,
  values: {
    readonly pointerId?: number;
    readonly pointerType?: string;
    readonly x?: number;
    readonly y?: number;
    readonly buttons?: number;
    readonly shift?: boolean;
  } = {},
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: values.x ?? 20,
    clientY: values.y ?? 20,
    buttons: values.buttons ?? 0,
    shiftKey: values.shift ?? false,
  });
  for (const [name, value] of Object.entries({
    pointerId: values.pointerId ?? 1,
    pointerType: values.pointerType ?? "mouse",
    isPrimary: true,
    pressure: type === "pointerup" || type === "pointercancel" ? 0 : 0.5,
    tiltX: 0,
    tiltY: 0,
    getCoalescedEvents: () => [],
  })) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  return event as PointerEvent;
}

function toolContext(): ToolContext {
  return {
    mesh: {} as ToolContext["mesh"],
    mutations: {} as ToolContext["mutations"],
    selection: {} as ToolContext["selection"],
    history: {} as ToolContext["history"],
    surface: {} as ToolContext["surface"],
    getCamera: () => ({}) as ReturnType<ToolContext["getCamera"]>,
    getViewport: () => VIEWPORT,
    setPreview: () => undefined,
    requestRender: () => undefined,
  };
}

function setup() {
  const element = document.createElement("canvas");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: VIEWPORT.cssWidth,
    height: VIEWPORT.cssHeight,
    right: VIEWPORT.cssWidth,
    bottom: VIEWPORT.cssHeight,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const captured = new Set<number>();
  element.setPointerCapture = vi.fn((id: number) => captured.add(id));
  element.releasePointerCapture = vi.fn((id: number) => captured.delete(id));
  element.hasPointerCapture = vi.fn((id: number) => captured.has(id));

  const received: PointerSample[] = [];
  const tool: Tool = {
    id: "modeling-fixture",
    pointer(sample) {
      received.push(sample);
      if (sample.phase === "down") return { handled: true, capturePointer: true };
      if (sample.phase === "up" || sample.phase === "cancel") {
        return { handled: true, releasePointer: true };
      }
      return { handled: true };
    },
  };
  const runtime = new ToolRuntime(toolContext());
  runtime.tools.register(tool);
  runtime.tools.activate(tool.id);
  const camera = new OrbitCameraController({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 });
  const render = vi.fn();
  const input = new WorkspaceInputController(runtime, camera, () => VIEWPORT, render);
  const surface = createNormalizedInputSurfaceFactory().create(element, { touchAction: "none" });
  const connection = surface.connect(input);
  const wheel = connectDesktopWheelCamera(element, input, camera, render);
  return { element, captured, received, runtime, camera, render, input, surface, connection, wheel };
}

describe("desktop mouse camera integration", () => {
  it("routes middle orbit, frozen Shift pan, and wheel zoom through the real input boundaries", () => {
    const harness = setup();
    const startPosition = harness.camera.position();

    harness.element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, buttons: 4 }));
    harness.element.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, x: 80, y: 40, buttons: 4 }));
    expect(harness.camera.position()).not.toEqual(startPosition);
    expect(harness.received).toEqual([]);
    expect(harness.captured.has(7)).toBe(true);
    harness.element.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, x: 80, y: 40 }));
    expect(harness.captured.size).toBe(0);

    const beforePanPosition = harness.camera.position();
    const beforePanTarget = harness.camera.target();
    harness.element.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 8,
      x: 80,
      y: 40,
      buttons: 4,
      shift: true,
    }));
    harness.element.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 8,
      x: 100,
      y: 55,
      buttons: 4,
      shift: false,
    }));
    const positionDelta = {
      x: harness.camera.position().x - beforePanPosition.x,
      y: harness.camera.position().y - beforePanPosition.y,
      z: harness.camera.position().z - beforePanPosition.z,
    };
    const targetDelta = {
      x: harness.camera.target().x - beforePanTarget.x,
      y: harness.camera.target().y - beforePanTarget.y,
      z: harness.camera.target().z - beforePanTarget.z,
    };
    expect(positionDelta.x).toBeCloseTo(targetDelta.x, 12);
    expect(positionDelta.y).toBeCloseTo(targetDelta.y, 12);
    expect(positionDelta.z).toBeCloseTo(targetDelta.z, 12);
    harness.element.dispatchEvent(pointerEvent("pointerup", { pointerId: 8 }));

    const distanceBeforeWheel = Math.hypot(
      harness.camera.position().x - harness.camera.target().x,
      harness.camera.position().y - harness.camera.target().y,
      harness.camera.position().z - harness.camera.target().z,
    );
    const event = new WheelEvent("wheel", { cancelable: true, deltaY: 50, deltaMode: 0 });
    harness.element.dispatchEvent(event);
    const distanceAfterWheel = Math.hypot(
      harness.camera.position().x - harness.camera.target().x,
      harness.camera.position().y - harness.camera.target().y,
      harness.camera.position().z - harness.camera.target().z,
    );
    expect(distanceAfterWheel).toBeGreaterThan(distanceBeforeWheel);
    expect(event.defaultPrevented).toBe(true);
    expect(harness.runtime.capturedPointerId()).toBeNull();
    harness.surface.dispose();
    harness.wheel.dispose();
  });

  it("preserves left modeling, reserves right input, and blocks wheel during tool capture", () => {
    const harness = setup();
    harness.element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 10, buttons: 2 }));
    expect(harness.received).toEqual([]);

    harness.element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 11, buttons: 1 }));
    expect(harness.received.map(({ phase }) => phase)).toEqual(["down"]);
    const before = harness.camera.position();
    const blockedWheel = new WheelEvent("wheel", { cancelable: true, deltaY: 80 });
    harness.element.dispatchEvent(blockedWheel);
    expect(harness.camera.position()).toEqual(before);
    expect(blockedWheel.defaultPrevented).toBe(false);
    harness.element.dispatchEvent(pointerEvent("pointerup", { pointerId: 11 }));
    expect(harness.received.map(({ phase }) => phase)).toEqual(["down", "up"]);
    expect(harness.runtime.capturedPointerId()).toBeNull();
    harness.surface.dispose();
    harness.wheel.dispose();
  });

  it("cleans DOM/logical capture on lost capture, blur, disconnect, and repeated dispose", () => {
    const harness = setup();
    harness.element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 19, buttons: 4 }));
    harness.element.dispatchEvent(pointerEvent("pointermove", { pointerId: 19, buttons: 0 }));
    expect(harness.captured.has(19)).toBe(false);
    expect(harness.input.canHandleWheel()).toBe(true);

    harness.element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 20, buttons: 4 }));
    harness.captured.delete(20); // the browser has already lost physical capture
    harness.element.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 20 }));
    expect(harness.input.canHandleWheel()).toBe(true);

    harness.element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 21, buttons: 4 }));
    window.dispatchEvent(new Event("blur"));
    expect(harness.captured.size).toBe(0);
    expect(harness.input.canHandleWheel()).toBe(true);

    harness.connection.dispose();
    harness.connection.dispose();
    harness.surface.dispose();
    harness.surface.dispose();
    harness.input.dispose();
    harness.input.dispose();
    harness.wheel.dispose();
    harness.wheel.dispose();
    const before = harness.camera.position();
    harness.element.dispatchEvent(pointerEvent("pointermove", { pointerId: 21, x: 100, buttons: 4 }));
    harness.element.dispatchEvent(new WheelEvent("wheel", { cancelable: true, deltaY: 100 }));
    expect(harness.camera.position()).toEqual(before);
  });
});
