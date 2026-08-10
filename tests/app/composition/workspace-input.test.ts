import { describe, expect, it } from "vitest";

import type {
  PointerKind,
  PointerPhase,
  PointerSample,
  Tool,
  ToolContext,
} from "@octopoly/contracts";

import { WorkspaceInputController } from "../../../src/app/composition/workspace-input";
import { OrbitCameraController } from "../../../src/camera";
import { ToolRuntime } from "../../../src/tools/runtime";

const VIEWPORT = Object.freeze({ cssWidth: 200, cssHeight: 100, devicePixelRatio: 2 });

interface SampleOptions {
  readonly pointerId?: number;
  readonly pointerType?: PointerKind;
  readonly x?: number;
  readonly y?: number;
  readonly buttons?: number;
  readonly shift?: boolean;
}

function sample(phase: PointerPhase, options: SampleOptions = {}): PointerSample {
  const terminal = phase === "up" || phase === "cancel" || phase === "hover";
  return Object.freeze({
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? "mouse",
    phase,
    isPrimary: true,
    x: options.x ?? 20,
    y: options.y ?? 20,
    pressure: terminal ? 0 : 0.5,
    tiltX: 0,
    tiltY: 0,
    buttons: options.buttons ?? (terminal ? 0 : 1),
    modifiers: Object.freeze({
      alt: false,
      ctrl: false,
      meta: false,
      shift: options.shift ?? false,
    }),
    timestamp: 1,
    coalesced: false,
  });
}

function context(): ToolContext {
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

interface Harness {
  readonly input: WorkspaceInputController;
  readonly runtime: ToolRuntime;
  readonly camera: OrbitCameraController;
  readonly received: PointerSample[];
  readonly cameraChanges: () => number;
}

function createHarness(options: {
  readonly captureTool?: boolean;
  readonly cameraChanged?: () => void;
} = {}): Harness {
  const received: PointerSample[] = [];
  const tool: Tool = {
    id: "fixture",
    pointer: (pointer) => {
      received.push(pointer);
      if (pointer.phase === "down" && options.captureTool === true) {
        return { handled: true, capturePointer: true };
      }
      if (pointer.phase === "up" || pointer.phase === "cancel") {
        return { handled: true, releasePointer: true };
      }
      return { handled: true };
    },
  };
  const runtime = new ToolRuntime(context());
  runtime.tools.register(tool);
  runtime.tools.activate(tool.id);
  const camera = new OrbitCameraController({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 });
  let changes = 0;
  const input = new WorkspaceInputController(runtime, camera, () => VIEWPORT, () => {
    options.cameraChanged?.();
    changes += 1;
  });
  return { input, runtime, camera, received, cameraChanges: () => changes };
}

describe("WorkspaceInputController desktop ownership", () => {
  it("captures middle-only orbit and never routes its samples to tools", () => {
    const harness = createHarness();
    const before = harness.camera.position();

    expect(harness.input.dispatch(sample("down", { buttons: 4, x: 20, y: 20 }))).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(harness.input.canHandleWheel()).toBe(false);
    expect(harness.input.dispatch(sample("move", { buttons: 4, x: 60, y: 30 }))).toEqual({
      handled: true,
    });
    expect(harness.input.dispatch(sample("up", { x: 60, y: 30 }))).toEqual({
      handled: true,
      releasePointer: true,
    });

    expect(harness.received).toEqual([]);
    expect(harness.camera.position()).not.toEqual(before);
    expect(harness.cameraChanges()).toBe(1);
    expect(harness.input.canHandleWheel()).toBe(true);
  });

  it("snapshots Shift for pan and does not switch mode during the drag", () => {
    const harness = createHarness();
    const beforePosition = harness.camera.position();
    const beforeTarget = harness.camera.target();

    harness.input.dispatch(sample("down", { buttons: 4, shift: true, x: 20, y: 20 }));
    harness.input.dispatch(sample("move", { buttons: 4, shift: false, x: 50, y: 30 }));

    const positionDelta = {
      x: harness.camera.position().x - beforePosition.x,
      y: harness.camera.position().y - beforePosition.y,
      z: harness.camera.position().z - beforePosition.z,
    };
    const targetDelta = {
      x: harness.camera.target().x - beforeTarget.x,
      y: harness.camera.target().y - beforeTarget.y,
      z: harness.camera.target().z - beforeTarget.z,
    };
    expect(positionDelta).toEqual(targetDelta);
    expect(harness.received).toEqual([]);
  });

  it("starts mouse tools only for primary-only down while preserving hover and captured terminals", () => {
    const harness = createHarness({ captureTool: true });

    expect(harness.input.dispatch(sample("hover"))).toEqual({ handled: true });
    expect(harness.input.dispatch(sample("down", { pointerId: 2, buttons: 2 }))).toEqual({ handled: false });
    expect(harness.input.dispatch(sample("down", { pointerId: 3, buttons: 3 }))).toEqual({ handled: false });
    expect(harness.input.dispatch(sample("down", { pointerId: 4, buttons: 5 }))).toEqual({ handled: false });
    expect(harness.input.dispatch(sample("down", { pointerId: 5, buttons: 1 }))).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(harness.input.canHandleWheel()).toBe(false);
    expect(harness.input.dispatch(sample("move", { pointerId: 5, buttons: 0 }))).toEqual({ handled: true });
    expect(harness.input.dispatch(sample("cancel", { pointerId: 5 }))).toEqual({
      handled: true,
      releasePointer: true,
    });

    expect(harness.received.map(({ phase, pointerId }) => [phase, pointerId])).toEqual([
      ["hover", 1],
      ["down", 5],
      ["move", 5],
      ["cancel", 5],
    ]);
    expect(harness.runtime.capturedPointerId()).toBeNull();
  });

  it("gives an existing tool capture priority over mouse and touch navigation", () => {
    const harness = createHarness({ captureTool: true });
    harness.input.dispatch(sample("down", { pointerId: 7, buttons: 1 }));
    const before = harness.camera.position();

    expect(harness.input.dispatch(sample("down", { pointerId: 8, buttons: 4 }))).toEqual({ handled: false });
    expect(harness.input.dispatch(sample("down", { pointerId: 9, pointerType: "touch", buttons: 1 }))).toEqual({
      handled: false,
    });
    expect(harness.input.dispatch(sample("move", { pointerId: 7, buttons: 1 }))).toEqual({ handled: true });

    expect(harness.camera.position()).toEqual(before);
    expect(harness.received.map((entry) => entry.pointerId)).toEqual([7, 7]);
  });

  it("cleans tracked and suppressed touches before tool-capture arbitration", () => {
    const harness = createHarness({ captureTool: true });

    expect(harness.input.dispatch(sample("down", { pointerId: 10, pointerType: "touch" }))).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(harness.input.dispatch(sample("down", { pointerId: 11, pointerType: "pen", buttons: 1 }))).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(harness.input.canHandleWheel()).toBe(false);
    expect(harness.input.dispatch(sample("move", { pointerId: 10, pointerType: "touch" }))).toEqual({
      handled: true,
    });
    expect(harness.input.dispatch(sample("up", { pointerId: 10, pointerType: "touch" }))).toEqual({
      handled: true,
      releasePointer: true,
    });
    expect(harness.input.dispatch(sample("up", { pointerId: 10, pointerType: "touch" }))).toEqual({ handled: false });

    expect(harness.received.map(({ pointerType, pointerId }) => [pointerType, pointerId])).toEqual([["pen", 11]]);
  });

  it("rebases the remaining touch after a two-touch terminal without a camera jump", () => {
    const harness = createHarness();
    harness.input.dispatch(sample("down", { pointerId: 20, pointerType: "touch", x: 20, y: 20 }));
    harness.input.dispatch(sample("down", { pointerId: 21, pointerType: "touch", x: 80, y: 20 }));
    harness.input.dispatch(sample("move", { pointerId: 20, pointerType: "touch", x: 30, y: 20 }));
    const beforeCancel = harness.camera.position();

    harness.input.dispatch(sample("cancel", { pointerId: 21, pointerType: "touch", x: 80, y: 20 }));
    harness.input.dispatch(sample("move", { pointerId: 20, pointerType: "touch", x: 30, y: 20 }));

    expect(harness.camera.position()).toEqual(beforeCancel);
    expect(harness.cameraChanges()).toBe(2);
  });

  it("cleans middle-bit loss, cancel, cancelNavigation, and dispose idempotently", () => {
    const harness = createHarness();
    harness.input.dispatch(sample("down", { pointerId: 30, buttons: 4 }));

    expect(harness.input.dispatch(sample("hover", { pointerId: 30, buttons: 0 }))).toEqual({
      handled: true,
      releasePointer: true,
    });
    expect(harness.input.dispatch(sample("cancel", { pointerId: 30 }))).toEqual({ handled: false });
    expect(harness.input.canHandleWheel()).toBe(true);

    harness.input.dispatch(sample("down", { pointerId: 31, buttons: 4 }));
    harness.input.cancelNavigation();
    harness.input.cancelNavigation();
    expect(harness.input.canHandleWheel()).toBe(true);

    harness.input.dispose();
    harness.input.dispose();
    const before = harness.camera.position();
    expect(harness.input.dispatch(sample("down", { pointerId: 32, buttons: 4 }))).toEqual({ handled: false });
    expect(harness.camera.position()).toEqual(before);
    expect(harness.input.canHandleWheel()).toBe(false);
  });

  it("clears mouse and touch ownership when the camera callback fails", () => {
    const failure = new Error("render callback failed");
    const mouseHarness = createHarness({ cameraChanged: () => { throw failure; } });
    mouseHarness.input.dispatch(sample("down", { pointerId: 35, buttons: 4 }));
    expect(() => mouseHarness.input.dispatch(sample("move", {
      pointerId: 35,
      buttons: 4,
      x: 40,
    }))).toThrow(failure);
    expect(mouseHarness.input.canHandleWheel()).toBe(true);

    const touchHarness = createHarness({ cameraChanged: () => { throw failure; } });
    touchHarness.input.dispatch(sample("down", { pointerId: 36, pointerType: "touch" }));
    expect(() => touchHarness.input.dispatch(sample("move", {
      pointerId: 36,
      pointerType: "touch",
      x: 40,
    }))).toThrow(failure);
    expect(touchHarness.input.canHandleWheel()).toBe(true);
    expect(touchHarness.input.dispatch(sample("cancel", {
      pointerId: 36,
      pointerType: "touch",
    }))).toEqual({ handled: false });
  });

  it("preserves ordinary Pencil modeling and one-touch orbit", () => {
    const harness = createHarness({ captureTool: true });
    expect(harness.input.dispatch(sample("down", { pointerId: 40, pointerType: "pen", buttons: 1 }))).toEqual({
      handled: true,
      capturePointer: true,
    });
    harness.input.dispatch(sample("up", { pointerId: 40, pointerType: "pen" }));

    const before = harness.camera.position();
    harness.input.dispatch(sample("down", { pointerId: 41, pointerType: "touch", x: 20, y: 20 }));
    harness.input.dispatch(sample("move", { pointerId: 41, pointerType: "touch", x: 40, y: 30 }));

    expect(harness.received.map((entry) => entry.pointerType)).toEqual(["pen", "pen"]);
    expect(harness.camera.position()).not.toEqual(before);
  });
});
