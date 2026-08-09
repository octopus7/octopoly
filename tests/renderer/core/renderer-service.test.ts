import { describe, expect, it } from "vitest";

import {
  APPLICATION_GPU_BUDGET_BYTES,
  APPLICATION_TEXTURE_BUDGET_BYTES,
  MAX_DEVICE_PIXEL_RATIO,
  WebGL2RendererService,
} from "../../../src/renderer/core/renderer-service";
import {
  createCanvasWithContext,
  createFakeCanvas,
  createScene,
  FakeRenderPass,
  ManualFrameScheduler,
} from "./fakes";

describe("WebGL2RendererService", () => {
  it("reports the frozen WebGL2 backend and ADR target budgets", async () => {
    const { canvas, gl } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const pass = new FakeRenderPass();
    const renderer = new WebGL2RendererService(
      [pass],
      undefined,
      scheduler.schedule,
      scheduler.cancel,
    );

    const result = await renderer.initialize(canvas);

    expect(result).toEqual({
      status: "ready",
      capabilities: {
        backend: "webgl2",
        maxTextureSize: 8192,
        supportsFloatColorBuffer: true,
        applicationTextureBudgetBytes: APPLICATION_TEXTURE_BUDGET_BYTES,
        applicationGpuBudgetBytes: APPLICATION_GPU_BUDGET_BYTES,
      },
    });
    expect(APPLICATION_TEXTURE_BUDGET_BYTES).toBe(512 * 1024 * 1024);
    expect(APPLICATION_GPU_BUDGET_BYTES).toBe(256 * 1024 * 1024);
    expect(renderer.state()).toBe("ready");
    expect(renderer.capabilities()?.backend).toBe("webgl2");
    expect(pass.initializeCount).toBe(1);
    expect(gl.viewportCalls).toEqual([]);

    renderer.dispose();
    renderer.dispose();
    expect(renderer.state()).toBe("disposed");
    expect(renderer.capabilities()).toBeNull();
    expect(pass.disposeCount).toBe(1);
  });

  it("returns unsupported and failed results without partial ready state", async () => {
    const unsupported = new WebGL2RendererService();
    await expect(unsupported.initialize(createCanvasWithContext(null))).resolves.toEqual({
      status: "unsupported",
      reason: "WebGL2 is unavailable",
    });
    expect(unsupported.state()).toBe("unsupported");
    expect(unsupported.capabilities()).toBeNull();

    const throwingCanvas = document.createElement("canvas");
    Object.defineProperty(throwingCanvas, "getContext", {
      value: () => { throw new Error("context creation blocked"); },
    });
    const failed = new WebGL2RendererService();
    await expect(failed.initialize(throwingCanvas)).resolves.toEqual({
      status: "failed",
      reason: "context creation blocked",
    });
    expect(failed.state()).toBe("failed");
    expect(failed.capabilities()).toBeNull();
  });

  it("treats malformed capabilities and pass initialization as failed", async () => {
    const malformed = createFakeCanvas();
    malformed.gl.maxTextureSize = Number.NaN;
    const malformedRenderer = new WebGL2RendererService();
    expect((await malformedRenderer.initialize(malformed.canvas)).status).toBe("failed");
    expect(malformedRenderer.capabilities()).toBeNull();

    const failing = createFakeCanvas();
    const pass = new FakeRenderPass();
    pass.throwOnInitialize = true;
    const renderer = new WebGL2RendererService([pass]);
    await expect(renderer.initialize(failing.canvas)).resolves.toEqual({
      status: "failed",
      reason: "pass initialization failed",
    });
    expect(pass.disposeCount).toBe(1);
    renderer.dispose();
    expect(pass.disposeCount).toBe(1);
  });

  it("coalesces renders and applies CSS-to-device pixel conversion exactly once", async () => {
    const { canvas, gl } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const pass = new FakeRenderPass();
    const renderer = new WebGL2RendererService(
      [pass],
      undefined,
      scheduler.schedule,
      scheduler.cancel,
    );
    await renderer.initialize(canvas);

    renderer.resize({ cssWidth: 100, cssHeight: 50, devicePixelRatio: 2 });
    expect([canvas.width, canvas.height]).toEqual([200, 100]);
    renderer.render(createScene({ cssWidth: 100, cssHeight: 50, devicePixelRatio: 2 }));
    renderer.render(createScene({ cssWidth: 100, cssHeight: 50, devicePixelRatio: 2 }));
    expect(scheduler.callbacks.size).toBe(1);
    scheduler.flush();

    expect(pass.renderCount).toBe(1);
    expect(pass.lastDpr).toBe(2);
    expect(gl.clearCalls).toHaveLength(1);

    renderer.resize({ cssWidth: 60, cssHeight: 120, devicePixelRatio: 10 });
    expect([canvas.width, canvas.height]).toEqual([
      60 * MAX_DEVICE_PIXEL_RATIO,
      120 * MAX_DEVICE_PIXEL_RATIO,
    ]);
    renderer.render(createScene({ cssWidth: 60, cssHeight: 120, devicePixelRatio: 10 }));
    scheduler.flush();
    expect(pass.lastDpr).toBe(MAX_DEVICE_PIXEL_RATIO);
  });

  it("also clamps framebuffer dimensions to the reported texture limit", async () => {
    const { canvas, gl } = createFakeCanvas();
    gl.maxTextureSize = 256;
    const scheduler = new ManualFrameScheduler();
    const pass = new FakeRenderPass();
    const renderer = new WebGL2RendererService(
      [pass],
      undefined,
      scheduler.schedule,
      scheduler.cancel,
    );
    await renderer.initialize(canvas);

    renderer.render(createScene({ cssWidth: 200, cssHeight: 100, devicePixelRatio: 4 }));
    scheduler.flush();

    expect([canvas.width, canvas.height]).toEqual([256, 128]);
    expect(pass.lastDpr).toBeCloseTo(1.28);
  });

  it("invalidates on context loss and rebuilds passes from CPU state on restore", async () => {
    const { canvas } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const pass = new FakeRenderPass();
    const renderer = new WebGL2RendererService(
      [pass],
      undefined,
      scheduler.schedule,
      scheduler.cancel,
    );
    await renderer.initialize(canvas);
    renderer.render(createScene());
    expect(scheduler.callbacks.size).toBe(1);

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(renderer.state()).toBe("context-lost");
    expect(renderer.capabilities()).toBeNull();
    expect(pass.invalidateCount).toBe(1);
    expect(scheduler.callbacks.size).toBe(0);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(renderer.state()).toBe("ready");
    expect(renderer.capabilities()?.backend).toBe("webgl2");
    expect(pass.initializeCount).toBe(2);
    expect(scheduler.callbacks.size).toBe(1);
    scheduler.flush();
    expect(pass.renderCount).toBe(1);
  });

  it("reports unsupported restore and rejects invalid lifecycle calls before effects", async () => {
    const { canvas, gl } = createFakeCanvas();
    let context: WebGL2RenderingContext | null = gl.asContext();
    Object.defineProperty(canvas, "getContext", {
      configurable: true,
      value: () => context,
    });
    const pass = new FakeRenderPass();
    const renderer = new WebGL2RendererService([pass]);

    expect(() => renderer.resize(createScene().viewport)).toThrow(/requires renderer state 'ready'/);
    await renderer.initialize(canvas);
    renderer.handleContextLoss();
    context = null;
    await expect(renderer.restore()).resolves.toEqual({
      status: "unsupported",
      reason: "WebGL2 is unavailable",
    });
    expect(renderer.state()).toBe("unsupported");
    expect(renderer.capabilities()).toBeNull();
    expect(() => renderer.render(createScene())).toThrow(/current state is 'unsupported'/);
  });
});
