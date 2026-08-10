import { describe, expect, it, vi } from "vitest";

import {
  createWheelZoomAdapter,
  type WheelZoomAdapterOptions,
} from "../../../src/input/mouse";

function rect(height = 200): DOMRect {
  return {
    left: 0,
    top: 0,
    width: 300,
    height,
    right: 300,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function wheel(deltaY: number, deltaMode = 0): WheelEvent {
  const event = new WheelEvent("wheel", {
    cancelable: true,
    deltaY: Number.isFinite(deltaY) ? deltaY : 0,
    deltaMode,
  });
  if (!Number.isFinite(deltaY)) {
    Object.defineProperty(event, "deltaY", { configurable: true, value: deltaY });
  }
  return event;
}

function setup(overrides: Partial<WheelZoomAdapterOptions> = {}) {
  const element = document.createElement("div");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect());
  const zoom = vi.fn();
  const requestRender = vi.fn();
  const canZoom = vi.fn(() => true);
  const add = vi.spyOn(element, "addEventListener");
  const remove = vi.spyOn(element, "removeEventListener");
  const adapter = createWheelZoomAdapter(element, {
    lineHeightCssPx: 20,
    maxDeltaCssPx: 100,
    sensitivity: 0.001,
    canZoom,
    zoom,
    requestRender,
    ...overrides,
  });
  return { element, zoom, requestRender, canZoom, adapter, add, remove };
}

describe("wheel zoom adapter", () => {
  it("normalizes pixel, line, and current-page-height deltas to the same continuous scale", () => {
    const { element, zoom, requestRender } = setup();

    const events = [wheel(40, 0), wheel(2, 1), wheel(0.2, 2)];
    for (const event of events) {
      element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }

    expect(zoom).toHaveBeenCalledTimes(3);
    expect(zoom.mock.calls.map(([scale]) => scale)).toEqual([
      Math.exp(0.04),
      Math.exp(0.04),
      Math.exp(0.04),
    ]);
    expect(requestRender).toHaveBeenCalledTimes(3);
  });

  it("rejects zero, non-finite, unsupported, and non-positive page deltas without handling", () => {
    const { element, zoom, requestRender, canZoom } = setup();
    vi.mocked(element.getBoundingClientRect).mockReturnValue(rect(0));
    const events = [wheel(0), wheel(Number.NaN), wheel(Number.POSITIVE_INFINITY), wheel(1, 3), wheel(1, 2)];

    for (const event of events) {
      element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(canZoom).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("symmetrically clamps deltas and preserves fractional trackpad movement", () => {
    const { element, zoom } = setup();

    element.dispatchEvent(wheel(10_000));
    element.dispatchEvent(wheel(-10_000));
    element.dispatchEvent(wheel(0.25));
    element.dispatchEvent(wheel(0.5));

    const [positive, negative, quarter, half] = zoom.mock.calls.map(
      ([scale]) => scale as number,
    ) as [number, number, number, number];
    expect(positive).toBe(Math.exp(0.1));
    expect(negative).toBe(Math.exp(-0.1));
    expect(positive * negative).toBeCloseTo(1, 14);
    expect(quarter).toBe(Math.exp(0.00025));
    expect(half).toBe(Math.exp(0.0005));
    expect(quarter).not.toBe(half);
    for (const scale of [positive, negative, quarter, half]) {
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeGreaterThan(0);
    }
  });

  it("uses a passive-false listener and leaves blocked wheel events to the browser", () => {
    const gate = vi.fn(() => false);
    const { element, zoom, requestRender, add } = setup({ canZoom: gate });
    const event = wheel(5);

    element.dispatchEvent(event);

    expect(add).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    expect(event.defaultPrevented).toBe(false);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(zoom).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("prevents default only after zoom and render callbacks both succeed", () => {
    const zoomFailure = new Error("zoom failed");
    const renderFailure = new Error("render failed");

    for (const overrides of [
      { zoom: () => { throw zoomFailure; } },
      { requestRender: () => { throw renderFailure; } },
    ] satisfies Array<Partial<WheelZoomAdapterOptions>>) {
      const element = document.createElement("div");
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect());
      let listener: EventListener | undefined;
      vi.spyOn(element, "addEventListener").mockImplementation((type, callback) => {
        if (type === "wheel") {
          listener = callback as EventListener;
        }
      });
      const adapter = createWheelZoomAdapter(element, {
        lineHeightCssPx: 20,
        maxDeltaCssPx: 100,
        sensitivity: 0.001,
        canZoom: () => true,
        zoom: () => undefined,
        requestRender: () => undefined,
        ...overrides,
      });
      const event = wheel(5);

      expect(() => listener?.(event)).toThrow(overrides.zoom === undefined ? renderFailure : zoomFailure);
      expect(event.defaultPrevented).toBe(false);
      adapter.dispose();
    }
  });

  it("disposes idempotently, unregisters the exact listener, and invokes nothing afterward", () => {
    const { element, zoom, requestRender, canZoom, adapter, add, remove } = setup();
    const listener = add.mock.calls.find(([type]) => type === "wheel")?.[1];

    adapter.dispose();
    adapter.dispose();
    element.dispatchEvent(wheel(5));

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("wheel", listener);
    expect(canZoom).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it.each([
    ["lineHeightCssPx", 0],
    ["lineHeightCssPx", Number.NaN],
    ["maxDeltaCssPx", -1],
    ["sensitivity", Number.POSITIVE_INFINITY],
  ] as const)("rejects invalid %s before registering a listener", (key, value) => {
    const element = document.createElement("div");
    const add = vi.spyOn(element, "addEventListener");

    expect(() => createWheelZoomAdapter(element, {
      lineHeightCssPx: 20,
      maxDeltaCssPx: 100,
      sensitivity: 0.001,
      canZoom: () => true,
      zoom: () => undefined,
      requestRender: () => undefined,
      [key]: value,
    })).toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});
