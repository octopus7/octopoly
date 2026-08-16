import { afterEach, describe, expect, it, vi } from "vitest";

import * as renderer from "../src/viewport/renderer";

type FakeWebGL = WebGL2RenderingContext & {
  bufferData: ReturnType<typeof vi.fn>;
  depthFunc: ReturnType<typeof vi.fn>;
  drawArrays: ReturnType<typeof vi.fn>;
  drawElements: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
  enable: ReturnType<typeof vi.fn>;
  deleteBuffer: ReturnType<typeof vi.fn>;
  deleteProgram: ReturnType<typeof vi.fn>;
  deleteVertexArray: ReturnType<typeof vi.fn>;
  shaderSource: ReturnType<typeof vi.fn>;
  useProgram: ReturnType<typeof vi.fn>;
};

function createFakeWebGL(): FakeWebGL {
  let objectId = 0;
  const object = (): object => ({ id: objectId += 1 });
  const noop = vi.fn();
  return {
    ARRAY_BUFFER: 0x8892,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    CULL_FACE: 0x0b44,
    DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_TEST: 0x0b71,
    DYNAMIC_DRAW: 0x88e8,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    LESS: 0x0201,
    LEQUAL: 0x0203,
    LINES: 0x0001,
    LINK_STATUS: 0x8b82,
    POINTS: 0x0000,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    UNSIGNED_INT: 0x1405,
    UNSIGNED_SHORT: 0x1403,
    VERTEX_SHADER: 0x8b31,
    attachShader: noop,
    bindBuffer: noop,
    bindVertexArray: noop,
    bufferData: vi.fn(),
    clear: noop,
    clearColor: noop,
    compileShader: noop,
    createBuffer: vi.fn(object),
    createProgram: vi.fn(object),
    createShader: vi.fn(object),
    createVertexArray: vi.fn(object),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: noop,
    deleteVertexArray: vi.fn(),
    depthFunc: vi.fn(),
    disable: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: noop,
    getAttribLocation: vi.fn((_program: WebGLProgram, name: string) => name === "aPosition" ? 0 : 1),
    getProgramInfoLog: vi.fn(() => ""),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => ({ name })),
    lineWidth: noop,
    linkProgram: noop,
    shaderSource: vi.fn(),
    uniform1f: noop,
    uniform3fv: noop,
    uniformMatrix4fv: noop,
    useProgram: vi.fn(),
    vertexAttribPointer: noop,
    viewport: noop,
  } as unknown as FakeWebGL;
}

interface HarnessOptions {
  readonly animationFrameFailure?: boolean;
  readonly resizeObserverFailure?: "construct" | "observe";
  readonly width?: number;
  readonly height?: number;
}

function createHarness(options: HarnessOptions = {}): {
  canvas: HTMLCanvasElement;
  flushFrame: () => void;
  gl: FakeWebGL;
  observerDisconnect: ReturnType<typeof vi.fn>;
} {
  const gl = createFakeWebGL();
  const canvas = document.createElement("canvas");
  const width = options.width ?? 400;
  const height = options.height ?? 200;
  Object.defineProperties(canvas, {
    clientWidth: { value: width },
    clientHeight: { value: height },
    getBoundingClientRect: {
      value: () => ({ left: 10, top: 20, width, height, right: 10 + width, bottom: 20 + height, x: 10, y: 20, toJSON: () => ({}) }),
    },
    getContext: { value: vi.fn(() => gl) },
    setPointerCapture: { value: vi.fn() },
  });

  let frameCallback: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    if (options.animationFrameFailure) throw new Error("late constructor failure");
    frameCallback = callback;
    return 42;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const observerDisconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(_callback: ResizeObserverCallback) {
      if (options.resizeObserverFailure === "construct") throw new Error("late constructor failure");
    }
    observe(): void {
      if (options.resizeObserverFailure === "observe") throw new Error("late constructor failure");
    }
    disconnect(): void { observerDisconnect(); }
  });

  return {
    canvas,
    flushFrame: () => {
      const callback = frameCallback as FrameRequestCallback | null;
      frameCallback = null;
      callback?.(0);
    },
    gl,
    observerDisconnect,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mesh viewport renderer", () => {
  it("exports the generic viewport starter without removing cube compatibility", () => {
    expect(typeof renderer.startMeshViewport).toBe("function");
    expect(typeof renderer.startCubeViewport).toBe("function");
  });

  it("rejects position arrays that cannot describe complete vertices", () => {
    const canvas = document.createElement("canvas");

    expect(() => renderer.startMeshViewport(canvas, {
      geometry: { positions: [0, 1], indices: [0, 0, 0] },
      editable: true,
    })).toThrow(/positions.*multiple of 3/i);
  });

  it("rejects finite coordinates that overflow WebGL 32-bit vertex storage", () => {
    const canvas = document.createElement("canvas");

    expect(() => renderer.startMeshViewport(canvas, {
      geometry: { positions: [Number.MAX_VALUE, 0, 0], indices: [0, 0, 0] },
      editable: false,
    })).toThrow(/32-bit float/i);
  });

  it("normalizes large finite coordinates before preparing 32-bit vertex data", () => {
    const { canvas, gl } = createHarness();

    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [3e38, 3e38, 0, -3e38, 3e38, 0, 3e38, -3e38, 0],
        indices: [0, 1, 2],
      },
      editable: false,
    });
    expect(gl.bufferData).toHaveBeenCalled();
    for (const index of [0, 1, 2]) {
      const point = controller.projectVertex(index)!;
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.depth)).toBe(true);
    }
    controller.dispose();
  });

  it("uploads generic geometry and renders editable faces, edges, and vertices", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
        indices: [0, 1, 2],
      },
      editable: true,
      color: [0.4, 0.5, 0.6],
    });

    flushFrame();

    const uploads = gl.bufferData.mock.calls.map((call) => call[1]);
    expect(uploads.some((data) => data instanceof Float32Array && data.length === 18)).toBe(true);
    expect(uploads.some((data) => data instanceof Uint16Array && data.length === 3)).toBe(true);
    expect(uploads.some((data) => data instanceof Uint16Array && data.length === 6)).toBe(true);
    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0);
    expect(gl.drawElements).toHaveBeenCalledWith(gl.LINES, 6, gl.UNSIGNED_SHORT, 0);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.POINTS, 0, 3);
    expect(gl.depthFunc).toHaveBeenCalledWith(gl.LEQUAL);

    controller.dispose();
  });

  it("renders normal and selected vertex handles without face depth occlusion", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    controller.setSelectedVertex(1);

    flushFrame();

    const depthDisableIndex = gl.disable.mock.calls.findIndex((call) => call[0] === gl.DEPTH_TEST);
    expect(depthDisableIndex).toBeGreaterThanOrEqual(0);
    const depthDisableOrder = gl.disable.mock.invocationCallOrder[depthDisableIndex]!;
    const pointDrawOrders = gl.drawArrays.mock.invocationCallOrder;
    const restoredDepthOrder = gl.enable.mock.invocationCallOrder.at(-1)!;
    expect(pointDrawOrders).toHaveLength(2);
    expect(depthDisableOrder).toBeLessThan(pointDrawOrders[0]!);
    expect(restoredDepthOrder).toBeGreaterThan(pointDrawOrders[1]!);
    controller.dispose();
  });

  it("returns from the unlit fragment path before evaluating mesh normals", () => {
    const { canvas, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    const fragmentSource = gl.shaderSource.mock.calls
      .map((call) => call[1] as string)
      .find((source) => source.includes("precision highp float"));
    controller.dispose();

    expect(fragmentSource).toMatch(
      /if\s*\(uLighting\s*<\s*0\.5\)\s*\{[\s\S]*?outColor\s*=[\s\S]*?return;[\s\S]*?\}[\s\S]*?normalize\(vNormal\)/,
    );
  });

  it("uses 32-bit index buffers for large generic meshes", () => {
    const { canvas, gl } = createHarness();
    const vertexCount = 150_000;
    const positions = new Array<number>(vertexCount * 3).fill(0);
    const indices = Array.from({ length: vertexCount }, (_value, index) => index);

    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions, indices },
      editable: false,
    });

    const uploads = gl.bufferData.mock.calls.map((call) => call[1]);
    expect(uploads.some((data) => data instanceof Uint32Array && data.length === indices.length)).toBe(true);
    controller.dispose();
  });

  it("rebuilds dynamic buffers and marks a selected editable vertex", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    flushFrame();
    gl.bufferData.mockClear();
    gl.drawArrays.mockClear();

    controller.setScene({
      geometry: {
        positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });
    flushFrame();
    const uploads = gl.bufferData.mock.calls.map((call) => call[1]);
    expect(uploads.some((data) => data instanceof Float32Array && data.length === 24)).toBe(true);
    expect(uploads.some((data) => data instanceof Uint16Array && data.length === 6)).toBe(true);
    expect(uploads.some((data) => data instanceof Uint16Array && data.length === 10)).toBe(true);

    controller.setSelectedVertex(2);
    flushFrame();
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.POINTS, 2, 1);
    controller.dispose();
  });

  it("round-trips projected client coordinates through vertex picking", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 0, 0], indices: [0, 1, 2] },
      editable: true,
    });

    const projected = controller.projectVertex(2);
    expect(projected).not.toBeNull();
    expect(projected?.x).toBeGreaterThanOrEqual(10);
    expect(projected?.y).toBeGreaterThanOrEqual(20);
    expect(controller.pickVertex(projected!.x, projected!.y, 1)).toBe(2);
    controller.dispose();
  });

  it("focuses a vertex at the viewport center without changing the scene", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });

    controller.focusVertex(0);

    const projected = controller.projectVertex(0)!;
    expect(projected.x).toBeCloseTo(210);
    expect(projected.y).toBeCloseTo(120);
    controller.dispose();
  });

  it("maps a screen drag onto a constrained world plane", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    controller.focusVertex(0);
    const start = controller.projectVertex(0)!;

    const delta = controller.modelDeltaForPlaneDrag(
      0,
      "xy",
      { x: start.x, y: start.y },
      { x: start.x + 20, y: start.y + 10 },
    )!;

    expect(delta[2]).toBeCloseTo(0);
    expect(Math.hypot(...delta)).toBeGreaterThan(0);
    controller.dispose();
  });

  it("scales plane drag deltas back into the active model coordinate scale", () => {
    const regularHarness = createHarness();
    const regular = renderer.startMeshViewport(regularHarness.canvas, {
      geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    const tinyHarness = createHarness();
    const tiny = renderer.startMeshViewport(tinyHarness.canvas, {
      geometry: { positions: [0, 0, 0, 0.001, 0, 0, 0, 0.001, 0], indices: [0, 1, 2] },
      editable: true,
    });
    regular.focusVertex(0);
    tiny.focusVertex(0);
    const regularStart = regular.projectVertex(0)!;
    const tinyStart = tiny.projectVertex(0)!;

    const regularDelta = regular.modelDeltaForPlaneDrag(0, "view", regularStart, {
      x: regularStart.x + 20,
      y: regularStart.y,
    })!;
    const tinyDelta = tiny.modelDeltaForPlaneDrag(0, "view", tinyStart, {
      x: tinyStart.x + 20,
      y: tinyStart.y,
    })!;

    expect(Math.hypot(...tinyDelta) / Math.hypot(...regularDelta)).toBeCloseTo(0.001);
    regular.dispose();
    tiny.dispose();
  });

  it("frames translated and large geometry around its bounds", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [20, -100, 0, 21, -100, 0, 20.5, 100, 0],
        indices: [0, 1, 2],
      },
      editable: true,
    });

    for (const vertexIndex of [0, 1, 2]) {
      const point = controller.projectVertex(vertexIndex);
      expect(point).not.toBeNull();
      expect(point!.x).toBeGreaterThanOrEqual(10);
      expect(point!.x).toBeLessThanOrEqual(410);
      expect(point!.y).toBeGreaterThanOrEqual(20);
      expect(point!.y).toBeLessThanOrEqual(220);
      expect(point!.depth).toBeGreaterThanOrEqual(-1);
      expect(point!.depth).toBeLessThanOrEqual(1);
    }
    controller.dispose();
  });

  it("frames geometry centered at very large absolute coordinates without precision loss", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [1_000_000, 0, 0, 1_000_001, 0, 0, 1_000_000, 1, 0],
        indices: [0, 1, 2],
      },
      editable: true,
    });

    for (const vertexIndex of [0, 1, 2]) {
      const point = controller.projectVertex(vertexIndex)!;
      expect(point.depth).toBeGreaterThanOrEqual(-1);
      expect(point.depth).toBeLessThanOrEqual(1);
    }
    controller.dispose();
  });

  it("keeps camera projection finite for geometry with Float32-scale bounds", () => {
    const { canvas } = createHarness({ width: 768, height: 768 });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [
          -1e38, -1e38, -1e38,
          1e38, 1e38, 1e38,
          0, 0, 0,
          1, 0, 0,
          0, 1, 0,
        ],
        indices: [2, 3, 4],
      },
      editable: true,
    });

    for (const vertexIndex of [0, 1, 2, 3, 4]) {
      const point = controller.projectVertex(vertexIndex)!;
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.depth)).toBe(true);
      expect(point.depth).toBeGreaterThanOrEqual(-1);
      expect(point.depth).toBeLessThanOrEqual(1);
    }
    controller.dispose();
  });

  it("normalizes a tiny imported mesh to a usable viewport size", () => {
    const { canvas } = createHarness({ width: 768, height: 768 });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [0, 0, 0, 0.001, 0, 0, 0, 0.001, 0],
        indices: [0, 1, 2],
      },
      editable: true,
    });
    const projected = [0, 1, 2].map((index) => controller.projectVertex(index)!);
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));

    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThan(100);
    controller.dispose();
  });

  it("fits wide geometry inside a portrait viewport", () => {
    const { canvas } = createHarness({ width: 200, height: 400 });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-100, -10, 0, 100, -10, 0, 0, 10, 0],
        indices: [0, 1, 2],
      },
      editable: true,
    });

    for (const vertexIndex of [0, 1, 2]) {
      const point = controller.projectVertex(vertexIndex)!;
      expect(point.x).toBeGreaterThanOrEqual(10);
      expect(point.x).toBeLessThanOrEqual(210);
      expect(point.y).toBeGreaterThanOrEqual(20);
      expect(point.y).toBeLessThanOrEqual(420);
    }
    controller.dispose();
  });

  it("rejects invalid triangle indices before uploading them", () => {
    const canvas = document.createElement("canvas");
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];

    expect(() => renderer.startMeshViewport(canvas, {
      geometry: { positions, indices: [0, 1, 3] },
      editable: false,
    })).toThrow(/outside the vertex range/i);
    expect(() => renderer.startMeshViewport(canvas, {
      geometry: { positions, indices: [0, 1] },
      editable: false,
    })).toThrow(/indices.*multiple of 3/i);
  });

  it.each([
    ["ResizeObserver construction", { resizeObserverFailure: "construct" } as const, 0],
    ["ResizeObserver observation", { resizeObserverFailure: "observe" } as const, 1],
    ["initial animation scheduling", { animationFrameFailure: true } as const, 1],
  ])("rolls back controls and observation when %s fails", (_failure, options, expectedDisconnects) => {
    const { canvas, gl, observerDisconnect } = createHarness(options);
    const removeEventListener = vi.spyOn(canvas, "removeEventListener");

    expect(() => renderer.startMeshViewport(canvas, {
      geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: false,
    })).toThrow("late constructor failure");

    expect(removeEventListener.mock.calls.map(([type]) => type)).toEqual([
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "wheel",
    ]);
    expect(observerDisconnect).toHaveBeenCalledTimes(expectedDisconnects);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(3);
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
  });

  it("unbinds the current program after rendering and before disposal", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: false,
    });

    flushFrame();
    expect(gl.useProgram).toHaveBeenLastCalledWith(null);

    gl.useProgram.mockClear();
    controller.dispose();
    expect(gl.useProgram).toHaveBeenCalledOnce();
    expect(gl.useProgram).toHaveBeenCalledWith(null);
    expect(gl.useProgram.mock.invocationCallOrder[0]).toBeLessThan(gl.deleteProgram.mock.invocationCallOrder[0]!);
  });

  it("disposes animation, observation, controls, and every WebGL resource exactly once", () => {
    const { canvas, gl, observerDisconnect } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: false,
    });

    controller.dispose();
    controller.dispose();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(observerDisconnect).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(3);
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
  });

  it("keeps the legacy cube starter as a non-editable 36-index render", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const stop = renderer.startCubeViewport(canvas);

    flushFrame();

    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    expect(gl.drawElements).not.toHaveBeenCalledWith(gl.LINES, expect.anything(), expect.anything(), 0);
    expect(gl.drawArrays).not.toHaveBeenCalled();
    stop();
  });
});
