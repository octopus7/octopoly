import { describe, expect, it, vi } from "vitest";

import type {
  PointerInputSink,
  PointerSample,
  ToolInputResult,
} from "@octopoly/contracts";
import { normalizePointerEvent, pointerPhase } from "../../src/input/pen";
import { createNormalizedInputSurfaceFactory } from "../../src/input/surface";
import { isModelingPointer, isNavigationPointer } from "../../src/input/touch";

function pointerEvent(
  type: string,
  values: {
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;
    clientX?: number;
    clientY?: number;
    pressure?: number;
    tiltX?: number;
    tiltY?: number;
    buttons?: number;
    timeStamp?: number;
    coalesced?: ReadonlyArray<PointerEvent>;
  } = {},
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: values.clientX ?? 0,
    clientY: values.clientY ?? 0,
    buttons: values.buttons ?? 0,
  });
  const properties = {
    pointerId: values.pointerId ?? 1,
    pointerType: values.pointerType ?? "pen",
    isPrimary: values.isPrimary ?? true,
    pressure: values.pressure ?? 0.5,
    tiltX: values.tiltX ?? 0,
    tiltY: values.tiltY ?? 0,
    timeStamp: values.timeStamp ?? 0,
    getCoalescedEvents: () => [...(values.coalesced ?? [])],
  };
  for (const [name, value] of Object.entries(properties)) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  return event as PointerEvent;
}

function sample(pointerType: PointerSample["pointerType"]): PointerSample {
  return Object.freeze({
    pointerId: 1,
    pointerType,
    phase: "down",
    isPrimary: true,
    x: 0,
    y: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    buttons: 1,
    modifiers: Object.freeze({ alt: false, ctrl: false, meta: false, shift: false }),
    timestamp: 1,
    coalesced: false,
  });
}

describe("pointer normalization", () => {
  it("normalizes kind, phase, local CSS coordinates, pressure, and tilt without exposing the event", () => {
    const event = pointerEvent("pointermove", {
      pointerType: "pen",
      clientX: 35,
      clientY: 62,
      pressure: 3,
      tiltX: 120,
      tiltY: -120,
      buttons: 1,
      timeStamp: 7,
    });
    const normalized = normalizePointerEvent(event, pointerPhase(event), 10, 20, false);

    expect(normalized).toEqual({
      pointerId: 1,
      pointerType: "pen",
      phase: "move",
      isPrimary: true,
      x: 25,
      y: 42,
      pressure: 1,
      tiltX: 90,
      tiltY: -90,
      buttons: 1,
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      timestamp: 7,
      coalesced: false,
    });
    expect(normalized).not.toHaveProperty("event");
    expect(pointerPhase(pointerEvent("pointermove", { pointerType: "mouse", buttons: 0 }))).toBe("hover");
    expect(normalizePointerEvent(pointerEvent("pointerdown", { pointerType: "unknown" }), "down", 0, 0, false).pointerType).toBe("mouse");
  });

  it.each([
    ["pointerdown", "touch", 1, "down"],
    ["pointermove", "touch", 1, "move"],
    ["pointermove", "mouse", 0, "hover"],
    ["pointerup", "pen", 0, "up"],
    ["pointercancel", "pen", 0, "cancel"],
  ] as const)("maps %s for %s with buttons=%s to %s", (type, kind, buttons, phase) => {
    const event = pointerEvent(type, { pointerType: kind, buttons });
    const normalized = normalizePointerEvent(event, pointerPhase(event), 0, 0, false);
    expect(normalized.pointerType).toBe(kind);
    expect(normalized.phase).toBe(phase);
  });

  it("keeps touch navigation separate from pen and mouse modeling", () => {
    expect(isNavigationPointer(sample("touch"))).toBe(true);
    expect(isModelingPointer(sample("touch"))).toBe(false);
    expect(isModelingPointer(sample("pen"))).toBe(true);
    expect(isModelingPointer(sample("mouse"))).toBe(true);
  });
});

describe("normalized input surface", () => {
  it("orders and deduplicates coalesced samples before the original sample", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
      right: 310,
      bottom: 220,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));

    const samples: PointerSample[] = [];
    const sink: PointerInputSink = {
      dispatch(value): ToolInputResult {
        samples.push(value);
        return { handled: true };
      },
    };
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect(sink);

    const older = pointerEvent("pointermove", { clientX: 20, clientY: 30, buttons: 1, timeStamp: 10 });
    const newer = pointerEvent("pointermove", { clientX: 25, clientY: 35, buttons: 1, timeStamp: 20 });
    const originalDuplicate = pointerEvent("pointermove", { clientX: 30, clientY: 40, buttons: 1, timeStamp: 30 });
    element.dispatchEvent(pointerEvent("pointermove", {
      clientX: 30,
      clientY: 40,
      buttons: 1,
      timeStamp: 30,
      coalesced: [newer, older, newer, originalDuplicate],
    }));

    expect(samples.map((value) => value.timestamp)).toEqual([10, 20, 30]);
    expect(samples.map((value) => value.coalesced)).toEqual([true, true, false]);
    expect(samples.map((value) => [value.x, value.y])).toEqual([[10, 10], [15, 15], [20, 20]]);
    surface.dispose();
  });

  it("applies capture intent and emits one final cancel on lost capture", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    const samples: PointerSample[] = [];
    const surface = createNormalizedInputSurfaceFactory().create(element, { touchAction: "none" });
    surface.connect({
      dispatch(value) {
        samples.push(value);
        return value.phase === "down"
          ? { handled: true, capturePointer: true }
          : { handled: true };
      },
    });

    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 4, buttons: 1, timeStamp: 1 }));
    expect(element.setPointerCapture).toHaveBeenCalledWith(4);
    element.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 4, timeStamp: 2 }));
    element.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 4, timeStamp: 3 }));

    expect(samples.map((value) => value.phase)).toEqual(["down", "cancel"]);
    surface.dispose();
    expect(element.style.touchAction).toBe("");
  });

  it("cancels and releases capture on disconnect or dispose and ignores later events", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 80,
      right: 100,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    const phases: string[] = [];
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect({
      dispatch(value) {
        phases.push(value.phase);
        return value.phase === "down" ? { handled: true, capturePointer: true } : { handled: true };
      },
    });
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 8, buttons: 1, timeStamp: 1 }));

    surface.dispose();
    surface.dispose();
    element.dispatchEvent(pointerEvent("pointermove", { pointerId: 8, buttons: 1, timeStamp: 4 }));

    expect(phases).toEqual(["down", "cancel"]);
    expect(element.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("publishes immutable CSS viewport updates independently from device pixels", () => {
    const element = document.createElement("div");
    let width = 120;
    let height = 80;
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    const surface = createNormalizedInputSurfaceFactory().create(element);
    const updates: Array<{ readonly cssWidth: number; readonly cssHeight: number }> = [];
    surface.subscribeViewport((viewport) => updates.push(viewport));

    width = 240;
    height = 160;
    window.dispatchEvent(new Event("resize"));

    expect(surface.viewport().cssWidth).toBe(240);
    expect(surface.viewport().cssHeight).toBe(160);
    expect(updates).toHaveLength(1);
    expect(Object.isFrozen(surface.viewport())).toBe(true);
    surface.dispose();
  });

  it("normalizes window blur to one cancel per captured pointer and releases DOM capture", () => {
    const element = document.createElement("div");
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    const samples: PointerSample[] = [];
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect({
      dispatch(value) {
        samples.push(value);
        return value.phase === "down" ? { handled: true, capturePointer: true } : { handled: true };
      },
    });
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 4, buttons: 1, timeStamp: 1 }));
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 5, buttons: 1, timeStamp: 2 }));

    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("blur"));

    expect(samples.map(({ pointerId, phase }) => [pointerId, phase])).toEqual([
      [4, "down"],
      [5, "down"],
      [4, "cancel"],
      [5, "cancel"],
    ]);
    expect(element.releasePointerCapture).toHaveBeenCalledTimes(2);
    expect(captured.size).toBe(0);
    surface.dispose();
  });

  it("finishes disconnect cleanup and permits reconnection when a cancel callback throws", () => {
    const element = document.createElement("div");
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    const cancelled: number[] = [];
    const surface = createNormalizedInputSurfaceFactory().create(element);
    const connection = surface.connect({
      dispatch(value) {
        if (value.phase === "cancel") {
          cancelled.push(value.pointerId);
          if (value.pointerId === 4) {
            throw new Error("cancel failed");
          }
        }
        return value.phase === "down" ? { handled: true, capturePointer: true } : { handled: true };
      },
    });
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 4, buttons: 1, timeStamp: 1 }));
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 5, buttons: 1, timeStamp: 2 }));

    expect(() => connection.dispose()).toThrow("cancel failed");

    expect(cancelled).toEqual([4, 5]);
    expect(element.releasePointerCapture).toHaveBeenCalledTimes(2);
    expect(captured.size).toBe(0);
    const replacement = surface.connect({ dispatch: () => ({ handled: false }) });
    replacement.dispose();
    surface.dispose();
  });

  it("clears lost-capture bookkeeping before propagating the cancel callback failure", () => {
    const element = document.createElement("div");
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    let lostCaptureListener: EventListener | undefined;
    const addEventListener = element.addEventListener.bind(element);
    vi.spyOn(element, "addEventListener").mockImplementation((type, listener, options) => {
      addEventListener(type, listener, options);
      if (type === "lostpointercapture") {
        lostCaptureListener = listener as EventListener;
      }
    });
    const surface = createNormalizedInputSurfaceFactory().create(element);
    let cancels = 0;
    surface.connect({
      dispatch(value) {
        if (value.phase === "cancel") {
          cancels += 1;
          throw new Error("lost cancel failed");
        }
        return { handled: true, capturePointer: true };
      },
    });
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 9, buttons: 1, timeStamp: 1 }));
    const lost = pointerEvent("lostpointercapture", { pointerId: 9, timeStamp: 2 });

    expect(() => lostCaptureListener?.(lost)).toThrow("lost cancel failed");
    expect(() => lostCaptureListener?.(lost)).not.toThrow();
    expect(cancels).toBe(1);
    surface.dispose();
  });

  it("rolls back sink ownership when DOM pointer-capture acquisition fails", () => {
    const element = document.createElement("div");
    const failure = new Error("capture unavailable");
    element.setPointerCapture = vi.fn(() => { throw failure; });
    element.releasePointerCapture = vi.fn();
    element.hasPointerCapture = vi.fn(() => false);
    let downListener: EventListener | undefined;
    const addEventListener = element.addEventListener.bind(element);
    vi.spyOn(element, "addEventListener").mockImplementation((type, listener, options) => {
      addEventListener(type, listener, options);
      if (type === "pointerdown") downListener = listener as EventListener;
    });
    let owned = false;
    let cancels = 0;
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect({
      dispatch(value) {
        if (value.phase === "down") {
          owned = true;
          return { handled: true, capturePointer: true };
        }
        if (value.phase === "cancel") {
          owned = false;
          cancels += 1;
          return { handled: true, releasePointer: true };
        }
        return { handled: false };
      },
    });

    expect(() => downListener?.(pointerEvent("pointerdown", {
      pointerId: 15,
      pointerType: "mouse",
      buttons: 4,
    }))).toThrow(failure);
    expect(owned).toBe(false);
    expect(cancels).toBe(1);
    surface.dispose();
  });

  it("releases every active capture when a non-terminal sink callback throws", () => {
    const element = document.createElement("div");
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    let moveListener: EventListener | undefined;
    const addEventListener = element.addEventListener.bind(element);
    vi.spyOn(element, "addEventListener").mockImplementation((type, listener, options) => {
      addEventListener(type, listener, options);
      if (type === "pointermove") moveListener = listener as EventListener;
    });
    const cancels: number[] = [];
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect({
      dispatch(value) {
        if (value.phase === "move") throw new Error("camera callback failed");
        if (value.phase === "cancel") cancels.push(value.pointerId);
        return value.phase === "down"
          ? { handled: true, capturePointer: true }
          : { handled: true };
      },
    });
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 13, buttons: 1, timeStamp: 1 }));
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 14, buttons: 1, timeStamp: 2 }));

    expect(() => moveListener?.(pointerEvent("pointermove", {
      pointerId: 13,
      buttons: 1,
      timeStamp: 3,
    }))).toThrow("camera callback failed");
    expect(cancels).toEqual([13, 14]);
    expect(captured.size).toBe(0);
    expect(element.releasePointerCapture).toHaveBeenCalledTimes(2);
    surface.dispose();
  });

  it("releases terminal pointer capture even when the sink callback throws", () => {
    const element = document.createElement("div");
    const captured = new Set<number>();
    element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
    let pointerListener: EventListener | undefined;
    const addEventListener = element.addEventListener.bind(element);
    vi.spyOn(element, "addEventListener").mockImplementation((type, listener, options) => {
      addEventListener(type, listener, options);
      if (type === "pointerup") {
        pointerListener = listener as EventListener;
      }
    });
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect({
      dispatch(value) {
        if (value.phase === "up") {
          throw new Error("up failed");
        }
        return { handled: true, capturePointer: true };
      },
    });
    element.dispatchEvent(pointerEvent("pointerdown", { pointerId: 12, buttons: 1, timeStamp: 1 }));

    expect(() => pointerListener?.(pointerEvent("pointerup", { pointerId: 12, timeStamp: 2 }))).toThrow("up failed");
    expect(element.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(captured.size).toBe(0);
    surface.dispose();
    expect(element.releasePointerCapture).toHaveBeenCalledTimes(1);
  });
});
