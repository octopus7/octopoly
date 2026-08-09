import { afterEach, describe, expect, it, vi } from "vitest";

import type { PointerInputSink, PointerSample } from "@octopoly/contracts";

import { createNormalizedInputSurfaceFactory } from "../../src/input/surface";
import { isModelingPointer, isNavigationPointer } from "../../src/input/touch";
import { WebGL2RendererService } from "../../src/renderer";
import {
  createFakeCanvas,
  createScene,
  FakeRenderPass,
  ManualFrameScheduler,
} from "../renderer/core/fakes";
import fixture from "./fixtures/ipados-17.4-pencil.json";

interface FixtureEvent {
  readonly type: string;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly buttons: number;
  readonly timeStamp: number;
  readonly coalesced?: ReadonlyArray<Partial<FixtureEvent>>;
}

const originalDevicePixelRatio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDevicePixelRatio !== undefined) {
    Object.defineProperty(window, "devicePixelRatio", originalDevicePixelRatio);
  }
});

describe("replayable iPadOS 17.4 Pencil fixture", () => {
  it("preserves pen/coalesced pressure and tilt while routing concurrent touch as navigation", () => {
    const { element, captured } = createFixtureElement();
    const all: PointerSample[] = [];
    const modeling: PointerSample[] = [];
    const navigation: PointerSample[] = [];
    const sink: PointerInputSink = {
      dispatch(sample) {
        all.push(sample);
        if (isModelingPointer(sample)) {
          modeling.push(sample);
        }
        if (isNavigationPointer(sample)) {
          navigation.push(sample);
        }
        return sample.pointerType === "pen" && sample.phase === "down"
          ? { handled: true, capturePointer: true }
          : sample.pointerType === "pen" && sample.phase === "up"
            ? { handled: true, releasePointer: true }
            : { handled: true };
      },
    };
    const surface = createNormalizedInputSurfaceFactory().create(element, { touchAction: "none" });
    surface.connect(sink);

    element.dispatchEvent(pointerEvent(fixture.stroke[0] as FixtureEvent));
    expect(captured.has(41)).toBe(true);
    element.dispatchEvent(pointerEvent(fixture.stroke[1] as FixtureEvent));
    for (const event of fixture.touchDuringStroke) {
      element.dispatchEvent(pointerEvent(event as FixtureEvent));
    }
    element.dispatchEvent(pointerEvent(fixture.stroke[2] as FixtureEvent));

    expect(captured.has(41)).toBe(false);
    expect(modeling.map(({ phase, timestamp, coalesced }) => [phase, timestamp, coalesced])).toEqual([
      ["down", 100, false],
      ["move", 108, true],
      ["move", 112, true],
      ["move", 116, false],
      ["up", 120, false],
    ]);
    expect(modeling.map(({ pressure, tiltX, tiltY }) => [pressure, tiltX, tiltY])).toEqual([
      [0.2, 10, -12],
      [0.4, 14, -16],
      [0.6, 19, -22],
      [0.8, 24, -28],
      [0, 24, -28],
    ]);
    expect(modeling.map(({ x, y }) => [x, y])).toEqual([
      [20, 30],
      [30, 40],
      [40, 50],
      [50, 60],
      [52, 62],
    ]);
    expect(navigation).toHaveLength(3);
    expect(navigation.every((sample) => sample.pointerId === 77)).toBe(true);
    expect(all.filter((sample) => sample.pointerId === 41)).toEqual(modeling);
    surface.dispose();
  });

  it("normalizes lost capture and explicit pointer cancel exactly once", () => {
    const { element } = createFixtureElement();
    const samples: PointerSample[] = [];
    const surface = createNormalizedInputSurfaceFactory().create(element);
    surface.connect({
      dispatch(sample) {
        samples.push(sample);
        return sample.phase === "down"
          ? { handled: true, capturePointer: true }
          : { handled: true };
      },
    });

    const lost = fixture.lostCapture;
    element.dispatchEvent(pointerEvent(basePen("pointerdown", lost.pointerId, lost.downTimeStamp)));
    element.dispatchEvent(pointerEvent(basePen("lostpointercapture", lost.pointerId, lost.lostTimeStamp)));
    element.dispatchEvent(pointerEvent(basePen("lostpointercapture", lost.pointerId, lost.lostTimeStamp + 1)));

    const cancelled = fixture.explicitCancel;
    element.dispatchEvent(pointerEvent(basePen("pointerdown", cancelled.pointerId, cancelled.downTimeStamp)));
    element.dispatchEvent(pointerEvent(basePen("pointercancel", cancelled.pointerId, cancelled.cancelTimeStamp)));

    expect(samples.map(({ pointerId, phase }) => [pointerId, phase])).toEqual([
      [42, "down"],
      [42, "cancel"],
      [43, "down"],
      [43, "cancel"],
    ]);
    surface.dispose();
  });

  it("publishes CSS-pixel resize and orientation changes independently from DPR", () => {
    const { element, dimensions } = createFixtureElement();
    const surface = createNormalizedInputSurfaceFactory().create(element);
    const viewports: Array<readonly [number, number, number]> = [];
    surface.subscribeViewport((viewport) => {
      viewports.push([viewport.cssWidth, viewport.cssHeight, viewport.devicePixelRatio]);
    });

    for (const change of fixture.viewportChanges) {
      dimensions.width = change.width;
      dimensions.height = change.height;
      window.dispatchEvent(new Event(change.event));
    }

    expect(viewports).toEqual([
      [640, 360, fixture.surface.devicePixelRatio],
      [360, 640, fixture.surface.devicePixelRatio],
    ]);
    surface.dispose();
  });

  it("rebuilds WebGL2 resources from CPU scene state after context loss", async () => {
    const { canvas } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const pass = new FakeRenderPass();
    const renderer = new WebGL2RendererService(
      [pass],
      undefined,
      scheduler.schedule,
      scheduler.cancel,
    );
    await expect(renderer.initialize(canvas)).resolves.toMatchObject({ status: "ready" });
    renderer.render(createScene());

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(renderer.state()).toBe("context-lost");
    expect(pass.invalidateCount).toBe(1);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(renderer.state()).toBe("ready");
    scheduler.flush();
    expect(pass.initializeCount).toBe(2);
    expect(pass.renderCount).toBe(1);
    renderer.dispose();
  });
});

function createFixtureElement(): {
  readonly element: HTMLDivElement;
  readonly captured: Set<number>;
  readonly dimensions: { width: number; height: number };
} {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: fixture.surface.devicePixelRatio,
  });
  const element = document.createElement("div");
  const captured = new Set<number>();
  const dimensions = { width: fixture.surface.width, height: fixture.surface.height };
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({
    left: fixture.surface.left,
    top: fixture.surface.top,
    width: dimensions.width,
    height: dimensions.height,
    right: fixture.surface.left + dimensions.width,
    bottom: fixture.surface.top + dimensions.height,
    x: fixture.surface.left,
    y: fixture.surface.top,
    toJSON: () => ({}),
  }));
  element.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
  element.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
  element.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
  return { element, captured, dimensions };
}

function basePen(type: string, pointerId: number, timeStamp: number): FixtureEvent {
  return {
    type,
    pointerId,
    pointerType: "pen",
    isPrimary: true,
    clientX: 20,
    clientY: 30,
    pressure: type === "pointerdown" ? 0.5 : 0,
    tiltX: 5,
    tiltY: -5,
    buttons: type === "pointerdown" ? 1 : 0,
    timeStamp,
  };
}

function pointerEvent(values: FixtureEvent): PointerEvent {
  const event = new MouseEvent(values.type, {
    bubbles: true,
    cancelable: true,
    clientX: values.clientX,
    clientY: values.clientY,
    buttons: values.buttons,
  });
  const coalesced = (values.coalesced ?? []).map((sample) => pointerEvent({
    ...values,
    ...sample,
    type: "pointermove",
    coalesced: [],
  }));
  for (const [key, value] of Object.entries({
    pointerId: values.pointerId,
    pointerType: values.pointerType,
    isPrimary: values.isPrimary,
    pressure: values.pressure,
    tiltX: values.tiltX,
    tiltY: values.tiltY,
    timeStamp: values.timeStamp,
    getCoalescedEvents: () => coalesced,
  })) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event as PointerEvent;
}
