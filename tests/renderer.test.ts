import { afterEach, describe, expect, it, vi } from "vitest";

import * as renderer from "../src/viewport/renderer";

type FakeWebGL = WebGL2RenderingContext & {
  activeTexture: ReturnType<typeof vi.fn>;
  bindFramebuffer: ReturnType<typeof vi.fn>;
  bindTexture: ReturnType<typeof vi.fn>;
  bufferData: ReturnType<typeof vi.fn>;
  depthFunc: ReturnType<typeof vi.fn>;
  drawArrays: ReturnType<typeof vi.fn>;
  drawElements: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
  enable: ReturnType<typeof vi.fn>;
  deleteBuffer: ReturnType<typeof vi.fn>;
  deleteProgram: ReturnType<typeof vi.fn>;
  deleteVertexArray: ReturnType<typeof vi.fn>;
  deleteTexture: ReturnType<typeof vi.fn>;
  createTexture: ReturnType<typeof vi.fn>;
  createFramebuffer: ReturnType<typeof vi.fn>;
  createProgram: ReturnType<typeof vi.fn>;
  deleteFramebuffer: ReturnType<typeof vi.fn>;
  getError: ReturnType<typeof vi.fn>;
  shaderSource: ReturnType<typeof vi.fn>;
  texImage2D: ReturnType<typeof vi.fn>;
  uniform1f: ReturnType<typeof vi.fn>;
  uniform2f: ReturnType<typeof vi.fn>;
  useProgram: ReturnType<typeof vi.fn>;
  colorMask: ReturnType<typeof vi.fn>;
  depthMask: ReturnType<typeof vi.fn>;
  depthRange: ReturnType<typeof vi.fn>;
  viewport: ReturnType<typeof vi.fn>;
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
    DEPTH_ATTACHMENT: 0x8d00,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_TEST: 0x0b71,
    DYNAMIC_DRAW: 0x88e8,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRAGMENT_SHADER: 0x8b30,
    LESS: 0x0201,
    LEQUAL: 0x0203,
    LINES: 0x0001,
    LINK_STATUS: 0x8b82,
    NO_ERROR: 0,
    NONE: 0,
    NEAREST: 0x2600,
    INVALID_VALUE: 0x0501,
    POINTS: 0x0000,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_COMPARE_MODE: 0x884c,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_INT: 0x1405,
    UNSIGNED_SHORT: 0x1403,
    VERTEX_SHADER: 0x8b31,
    attachShader: noop,
    activeTexture: vi.fn(),
    bindFramebuffer: vi.fn(),
    bindBuffer: noop,
    bindTexture: vi.fn(),
    bindVertexArray: noop,
    bufferData: vi.fn(),
    clear: noop,
    clearColor: noop,
    colorMask: vi.fn(),
    compileShader: noop,
    createBuffer: vi.fn(object),
    createFramebuffer: vi.fn(object),
    createProgram: vi.fn(object),
    createShader: vi.fn(object),
    createTexture: vi.fn(object),
    createVertexArray: vi.fn(object),
    deleteBuffer: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: noop,
    deleteTexture: vi.fn(),
    deleteVertexArray: vi.fn(),
    depthFunc: vi.fn(),
    depthMask: vi.fn(),
    depthRange: vi.fn(),
    disable: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: noop,
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    drawBuffers: noop,
    framebufferTexture2D: noop,
    getAttribLocation: vi.fn((_program: WebGLProgram, name: string) => name === "aPosition" ? 0 : name === "aNormal" ? 1 : 2),
    getError: vi.fn(() => 0),
    getProgramInfoLog: vi.fn(() => ""),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => ({ name })),
    lineWidth: noop,
    linkProgram: noop,
    pixelStorei: noop,
    readBuffer: noop,
    shaderSource: vi.fn(),
    texImage2D: vi.fn(),
    texStorage2D: vi.fn(),
    texParameteri: noop,
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: noop,
    uniform3fv: noop,
    uniformMatrix4fv: noop,
    useProgram: vi.fn(),
    vertexAttribPointer: noop,
    viewport: vi.fn(),
  } as unknown as FakeWebGL;
}

interface HarnessOptions {
  readonly animationFrameFailure?: boolean;
  readonly resizeObserverFailure?: "construct" | "observe";
  readonly width?: number;
  readonly height?: number;
  readonly devicePixelRatio?: number;
}

function createHarness(options: HarnessOptions = {}): {
  canvas: HTMLCanvasElement;
  flushFrame: () => void;
  gl: FakeWebGL;
  observerDisconnect: ReturnType<typeof vi.fn>;
  resize: (width: number, height: number) => void;
} {
  const gl = createFakeWebGL();
  const canvas = document.createElement("canvas");
  let width = options.width ?? 400;
  let height = options.height ?? 200;
  vi.stubGlobal("devicePixelRatio", options.devicePixelRatio ?? 1);
  Object.defineProperties(canvas, {
    clientWidth: { get: () => width },
    clientHeight: { get: () => height },
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
  let resizeCallback: ResizeObserverCallback | null = null;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) {
      if (options.resizeObserverFailure === "construct") throw new Error("late constructor failure");
      resizeCallback = callback;
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
    resize: (nextWidth, nextHeight) => {
      width = nextWidth;
      height = nextHeight;
      resizeCallback?.([], {} as ResizeObserver);
    },
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

  it("uploads an active-model texture and draws faces before editable overlays", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
        indices: [0, 1, 2],
        uvs: [0, 0, 1, 0, 0.5, 1],
      },
      editable: true,
      textureKey: "base",
    });
    const bitmap = { width: 2, height: 2 } as ImageBitmap;

    controller.setTexture("base", bitmap);
    flushFrame();

    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bitmap,
    );
    const faceDraw = gl.drawElements.mock.invocationCallOrder[1]!;
    const edgeDraw = gl.drawElements.mock.invocationCallOrder[2]!;
    const pointDraw = gl.drawArrays.mock.invocationCallOrder[0]!;
    expect(faceDraw).toBeLessThan(edgeDraw);
    expect(edgeDraw).toBeLessThan(pointDraw);

    controller.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  });

  it("keeps the prior GL texture when replacement upload fails, then deletes it exactly once on disposal", () => {
    const { canvas, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
        indices: [0, 1, 2],
        uvs: [0, 0, 1, 0, 0.5, 1],
      },
      editable: true,
      textureKey: "base",
    });
    const first = { width: 2, height: 2 } as ImageBitmap;
    const replacement = { width: 4, height: 4 } as ImageBitmap;
    controller.setTexture("base", first);
    const firstTexture = gl.createTexture.mock.results[0]!.value;
    gl.getError.mockReturnValueOnce(gl.NO_ERROR).mockReturnValueOnce(gl.INVALID_VALUE);

    expect(() => controller.setTexture("base", replacement)).toThrow(/WebGL 텍스처 업로드 오류/);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).not.toHaveBeenCalledWith(firstTexture);

    controller.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledWith(firstTexture);
  });

  it("deletes the prior texture after successful replacement and the current texture on explicit deletion", () => {
    const { canvas, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
        indices: [0, 1, 2],
        uvs: [0, 0, 1, 0, 0.5, 1],
      },
      editable: true,
      textureKey: "base",
    });
    controller.setTexture("base", { width: 2, height: 2 } as ImageBitmap);
    const firstTexture = gl.createTexture.mock.results[0]!.value;
    controller.setTexture("base", { width: 4, height: 4 } as ImageBitmap);
    const secondTexture = gl.createTexture.mock.results[1]!.value;

    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).toHaveBeenCalledWith(firstTexture);

    controller.deleteTexture("base");
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledWith(secondTexture);

    controller.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  });

  it("keeps every prior texture when an atomic texture-set replacement fails", () => {
    const { canvas, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
    };
    const controller = renderer.startMeshViewport(canvas, {
      geometry, editable: true, textureKey: "base",
    });
    controller.setTexture("base", { width: 2, height: 2 } as ImageBitmap);
    const prior = gl.createTexture.mock.results[0]!.value;
    gl.getError
      .mockReturnValueOnce(gl.NO_ERROR)
      .mockReturnValueOnce(gl.NO_ERROR)
      .mockReturnValueOnce(gl.NO_ERROR)
      .mockReturnValueOnce(gl.INVALID_VALUE);

    expect(() => controller.replaceTextures([
      { textureKey: "base", source: { width: 4, height: 4 } as ImageBitmap },
      { textureKey: "copy-1", source: { width: 4, height: 4 } as ImageBitmap },
    ])).toThrow(/WebGL 텍스처 업로드 오류/);

    expect(gl.deleteTexture).not.toHaveBeenCalledWith(prior);
    expect(gl.deleteTexture).toHaveBeenCalledWith(gl.createTexture.mock.results[1]!.value);
    expect(gl.deleteTexture).toHaveBeenCalledWith(gl.createTexture.mock.results[2]!.value);
    controller.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledWith(prior);
  });

  it("preserves the upload error and attempts every staged texture cleanup", () => {
    const { canvas, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
    };
    const controller = renderer.startMeshViewport(canvas, { geometry, editable: true });
    gl.getError
      .mockReturnValueOnce(gl.NO_ERROR).mockReturnValueOnce(gl.NO_ERROR)
      .mockReturnValueOnce(gl.NO_ERROR).mockReturnValueOnce(gl.NO_ERROR)
      .mockReturnValueOnce(gl.NO_ERROR).mockReturnValueOnce(gl.INVALID_VALUE);
    let deleteCalls = 0;
    gl.deleteTexture.mockImplementation(() => {
      deleteCalls += 1;
      if (deleteCalls === 2) throw new Error("candidate cleanup failed");
    });

    expect(() => controller.prepareTextures([
      { textureKey: "base", source: {} as TexImageSource },
      { textureKey: "copy-1", source: {} as TexImageSource },
      { textureKey: "copy-2", source: {} as TexImageSource },
    ])).toThrow(/WebGL 텍스처 업로드 오류/);

    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it("restores every prior texture when a committed replacement is rolled back", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
    };
    const controller = renderer.startMeshViewport(canvas, {
      geometry, editable: true, textureKey: "base",
    });
    controller.setTexture("base", { width: 2, height: 2 } as ImageBitmap);
    const prior = gl.createTexture.mock.results[0]!.value;
    const transaction = controller.prepareTextures([
      { textureKey: "base", source: { width: 4, height: 4 } as ImageBitmap },
    ]);
    const candidate = gl.createTexture.mock.results[1]!.value;

    transaction.commit();
    transaction.dispose();
    flushFrame();

    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, prior);
    expect(gl.deleteTexture).toHaveBeenCalledWith(candidate);
    expect(gl.deleteTexture).not.toHaveBeenCalledWith(prior);
    controller.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledWith(prior);
  });

  it("deletes an uploaded staged texture when candidate-map insertion fails", () => {
    const { canvas, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0, 1],
    };
    const controller = renderer.startMeshViewport(canvas, { geometry, editable: true });
    const originalSet = Map.prototype.set;
    let thrown: unknown;
    Map.prototype.set = function (): Map<unknown, unknown> {
      throw new Error("candidate map failed");
    };
    try {
      controller.prepareTextures([{ textureKey: "base", source: {} as TexImageSource }]);
    } catch (error) {
      thrown = error;
    } finally {
      Map.prototype.set = originalSet;
    }

    expect(thrown).toEqual(expect.objectContaining({ message: "candidate map failed" }));
    const candidate = vi.mocked(gl.createTexture).mock.results.at(-1)!.value;
    expect(gl.deleteTexture).toHaveBeenCalledWith(candidate);
    controller.dispose();
  });

  it("publishes prepared textures by reference swap without commit-time Map insertion", () => {
    const { canvas } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0, 1],
    };
    const controller = renderer.startMeshViewport(canvas, { geometry, editable: true });
    const transaction = controller.prepareTextures([
      { textureKey: "base", source: {} as TexImageSource },
    ]);
    const originalSet = Map.prototype.set;
    let thrown: unknown;
    Map.prototype.set = function (): Map<unknown, unknown> {
      throw new Error("commit-time Map.set");
    };
    try {
      transaction.commit();
    } catch (error) {
      thrown = error;
    } finally {
      Map.prototype.set = originalSet;
    }

    expect(thrown).toBeUndefined();
    transaction.finalize();
    controller.dispose();
  });

  it("deletes a direct texture candidate when preparing its replacement map fails", () => {
    const { canvas, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0, 1],
    };
    const controller = renderer.startMeshViewport(canvas, { geometry, editable: true });
    const originalSet = Map.prototype.set;
    let thrown: unknown;
    Map.prototype.set = function (): Map<unknown, unknown> {
      throw new Error("replacement map failed");
    };
    try {
      controller.setTexture("base", {} as TexImageSource);
    } catch (error) {
      thrown = error;
    } finally {
      Map.prototype.set = originalSet;
    }

    expect(thrown).toEqual(expect.objectContaining({ message: "replacement map failed" }));
    const candidate = vi.mocked(gl.createTexture).mock.results.at(-1)!.value;
    expect(gl.deleteTexture).toHaveBeenCalledWith(candidate);
    controller.dispose();
  });

  it("keeps a committed replacement published when prior-texture cleanup throws", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
    };
    const controller = renderer.startMeshViewport(canvas, {
      geometry, editable: true, textureKey: "base",
    });
    controller.setTexture("base", { width: 2, height: 2 } as ImageBitmap);
    const transaction = controller.prepareTextures([
      { textureKey: "base", source: { width: 4, height: 4 } as ImageBitmap },
    ]);
    const candidate = gl.createTexture.mock.results[1]!.value;
    transaction.commit();
    gl.deleteTexture.mockImplementationOnce(() => { throw new Error("cleanup failed"); });

    expect(() => transaction.finalize()).not.toThrow();
    flushFrame();
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, candidate);
    controller.dispose();
  });

  it("keeps the prior scene and deletes candidate buffers when staged scene upload fails", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const original = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const controller = renderer.startMeshViewport(canvas, { geometry: original, editable: true });
    const originalVertexArray = vi.mocked(gl.createVertexArray).mock.results[0]!.value;
    const originalBuffers = vi.mocked(gl.createBuffer).mock.results.slice(0, 4).map((result) => result.value);
    gl.getError
      .mockReturnValueOnce(gl.NO_ERROR)
      .mockReturnValueOnce(0x0505);

    expect(() => controller.prepareScene({
      geometry: {
        positions: [-2, -2, 0, 2, -2, 0, 0, 2, 0],
        indices: [0, 1, 2],
      },
      editable: true,
    })).toThrow(/WebGL 메시 업로드 오류/);

    const candidateBuffers = vi.mocked(gl.createBuffer).mock.results.slice(4, 8).map((result) => result.value);
    for (const buffer of candidateBuffers) expect(gl.deleteBuffer).toHaveBeenCalledWith(buffer);
    for (const buffer of originalBuffers) expect(gl.deleteBuffer).not.toHaveBeenCalledWith(buffer);
    expect(gl.deleteVertexArray).not.toHaveBeenCalledWith(originalVertexArray);
    flushFrame();
    expect(gl.bindVertexArray).toHaveBeenCalledWith(originalVertexArray);
    controller.dispose();
  });

  it("restores prior scene resources after a committed scene transaction rolls back", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const original = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const controller = renderer.startMeshViewport(canvas, { geometry: original, editable: true });
    const originalVertexArray = vi.mocked(gl.createVertexArray).mock.results[0]!.value;
    const originalBuffers = vi.mocked(gl.createBuffer).mock.results.slice(0, 4).map((result) => result.value);
    const before = controller.projectVertex(0);
    const transaction = controller.prepareScene({
      geometry: {
        positions: [-20, -20, 0, 20, -20, 0, 0, 20, 0],
        indices: [0, 1, 2],
      },
      editable: true,
    });
    const candidateVertexArray = vi.mocked(gl.createVertexArray).mock.results[1]!.value;
    const candidateBuffers = vi.mocked(gl.createBuffer).mock.results.slice(4, 8).map((result) => result.value);

    transaction.commit();
    transaction.dispose();
    flushFrame();

    expect(controller.projectVertex(0)).toEqual(before);
    expect(gl.bindVertexArray).toHaveBeenCalledWith(originalVertexArray);
    expect(gl.deleteVertexArray).toHaveBeenCalledWith(candidateVertexArray);
    expect(gl.deleteVertexArray).not.toHaveBeenCalledWith(originalVertexArray);
    for (const buffer of candidateBuffers) expect(gl.deleteBuffer).toHaveBeenCalledWith(buffer);
    for (const buffer of originalBuffers) expect(gl.deleteBuffer).not.toHaveBeenCalledWith(buffer);
    controller.dispose();
  });

  it("preloads an inactive model texture and renders it after the model becomes active", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
    };
    const controller = renderer.startMeshViewport(canvas, {
      geometry, editable: true, textureKey: "base",
    });

    expect(() => controller.setTexture("copy-1", { width: 2, height: 2 } as ImageBitmap))
      .not.toThrow();
    const copyTexture = gl.createTexture.mock.results[0]!.value;
    controller.setScene({ geometry, editable: true, textureKey: "copy-1" });
    flushFrame();

    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, copyTexture);
    controller.dispose();
  });

  it("renders the same keyed texture after switching away from and back to its model", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const geometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
    };
    const controller = renderer.startMeshViewport(canvas, {
      geometry, editable: true, textureKey: "base",
    });
    controller.setTexture("base", { width: 2, height: 2 } as ImageBitmap);
    const baseTexture = gl.createTexture.mock.results[0]!.value;

    controller.setScene({ geometry, editable: true, textureKey: "copy-1" });
    controller.setScene({ geometry, editable: true, textureKey: "base" });
    flushFrame();

    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, baseTexture);
    controller.dispose();
  });

  it("classifies handle centers against an unbiased face-depth prepass before drawing complete squares", () => {
    const { canvas, flushFrame, gl } = createHarness({ devicePixelRatio: 1 });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    controller.setSelectedVertex(1);

    flushFrame();

    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.createFramebuffer).toHaveBeenCalledOnce();
    const depthFramebuffer = gl.createFramebuffer.mock.results[0]!.value;
    const depthTexture = gl.createTexture.mock.results[0]!.value;
    expect(gl.texStorage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 400, 200,
    );
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, depthFramebuffer);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);

    const shaderSources = gl.shaderSource.mock.calls.map(([, source]) => source as string);
    const handleVertexSource = shaderSources.find((source) => source.includes("uMeshDepth"));
    const handleFragmentSource = shaderSources.find((source) => source.includes("out vec4 outColor")
      && !source.includes("uLighting"));
    expect(handleVertexSource).toContain("texelFetch");
    expect(handleVertexSource).toContain("centerDepth <= meshDepth");
    expect(handleVertexSource).not.toMatch(/epsilon|bias/i);
    expect(handleFragmentSource).not.toContain("discard");
    expect(shaderSources.some((source) => source.includes("clipPosition.z -="))).toBe(false);
    expect(shaderSources.some((source) => source.includes("inverse(uViewProjection)"))).toBe(false);

    const triangleDrawOrders = gl.drawElements.mock.calls
      .map(([mode], index) => mode === gl.TRIANGLES ? gl.drawElements.mock.invocationCallOrder[index]! : -1)
      .filter((order) => order >= 0);
    expect(triangleDrawOrders).toHaveLength(2);
    const unbindOrder = gl.bindFramebuffer.mock.calls
      .map(([target, framebuffer], index) => target === gl.FRAMEBUFFER && framebuffer === null
        ? gl.bindFramebuffer.mock.invocationCallOrder[index]!
        : -1)
      .find((order) => order > triangleDrawOrders[0]!)!;
    expect(unbindOrder).toBeLessThan(triangleDrawOrders[1]!);

    const pointDrawOrders = gl.drawArrays.mock.invocationCallOrder;
    expect(pointDrawOrders).toHaveLength(2);
    const handleProgram = gl.createProgram.mock.results[1]!.value;
    const handleProgramUseOrder = gl.useProgram.mock.calls
      .map(([program], index) => program === handleProgram ? gl.useProgram.mock.invocationCallOrder[index]! : -1)
      .find((order) => order >= 0)!;
    expect(handleProgramUseOrder).toBeLessThan(pointDrawOrders[0]!);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE1);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, depthTexture);
    expect(gl.disable).not.toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(gl.depthMask).toHaveBeenCalledWith(false);
    expect(gl.depthRange).toHaveBeenCalledWith(0, 0);
    expect(gl.depthMask).toHaveBeenLastCalledWith(true);
    expect(gl.depthRange).toHaveBeenLastCalledWith(0, 1);
    expect(gl.depthFunc).toHaveBeenLastCalledWith(gl.LESS);

    controller.dispose();
    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(depthFramebuffer);
    expect(gl.deleteTexture).toHaveBeenCalledWith(depthTexture);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
  });

  it("restores editable WebGL state and releases the program when edge drawing throws", () => {
    const { canvas, flushFrame, gl } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    gl.drawElements
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw new Error("edge draw failed"); });

    expect(flushFrame).toThrow("edge draw failed");

    const cullDisableIndex = gl.disable.mock.calls.findIndex(([capability]) => capability === gl.CULL_FACE);
    const cullEnableIndices = gl.enable.mock.calls
      .map(([capability], index) => capability === gl.CULL_FACE ? index : -1)
      .filter((index) => index >= 0);
    const finalCullEnableIndex = cullEnableIndices.at(-1)!;
    expect(gl.depthFunc).toHaveBeenLastCalledWith(gl.LESS);
    expect(gl.enable.mock.invocationCallOrder[finalCullEnableIndex]!)
      .toBeGreaterThan(gl.disable.mock.invocationCallOrder[cullDisableIndex]!);
    expect(gl.useProgram).toHaveBeenLastCalledWith(null);
    controller.dispose();
  });

  it("caps vertex handle scaling at two device pixels per CSS pixel", () => {
    const { canvas, flushFrame, gl } = createHarness({ devicePixelRatio: 4 });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    controller.setSelectedVertex(1);

    flushFrame();

    const pointSizes = gl.uniform1f.mock.calls
      .filter(([location]) => (location as { name?: string }).name === "uPointSize")
      .map(([, value]) => value as number);
    expect(pointSizes.slice(-2)).toEqual([10, 16]);
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

  it("projects a model-space influence radius into finite CSS pixels", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });

    const pixels = controller.projectRadius(2, 0.5);

    expect(pixels).not.toBeNull();
    expect(Number.isFinite(pixels)).toBe(true);
    expect(pixels).toBeGreaterThan(0);
    controller.dispose();
  });

  it("fills a wide viewport with a shallow Facial mesh while retaining a safe border", () => {
    const width = 1280;
    const height = 577;
    const { canvas } = createHarness({ width, height });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -0.3, 0, 1, -0.3, 0, 1, 0.3, 0, -1, 0.3, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });

    const projected = [0, 1, 2, 3].map((index) => controller.projectVertex(index)!);
    const span = Math.max(...projected.map(({ x }) => x)) - Math.min(...projected.map(({ x }) => x));
    expect(span).toBeGreaterThan(width * 0.9);
    expect(projected.every(({ x, y }) => x >= 10 && x <= 10 + width && y >= 20 && y <= 20 + height)).toBe(true);
    controller.dispose();
  });

  it("recovers finite close framing when a zero-sized mount receives layout", () => {
    const { canvas, resize } = createHarness({ width: 0, height: 0 });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -0.3, 0, 1, -0.3, 0, 1, 0.3, 0, -1, 0.3, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });

    resize(1280, 577);

    const projected = [0, 1, 2, 3].map((index) => controller.projectVertex(index)!);
    const span = Math.max(...projected.map(({ x }) => x)) - Math.min(...projected.map(({ x }) => x));
    expect(projected.every(({ x, y, depth }) => [x, y, depth].every(Number.isFinite))).toBe(true);
    expect(span).toBeGreaterThan(1280 * 0.9);
    controller.dispose();
  });

  it("keeps camera state unchanged after post-initial viewport resize", () => {
    const harness = createHarness({ width: 800, height: 500 });
    const controller = renderer.startMeshViewport(harness.canvas, {
      geometry: {
        positions: [-2, -0.5, 0, 2, -0.5, 0, 2, 0.5, 0, -2, 0.5, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });
    const before = controller.cameraState();

    harness.resize(300, 900);

    expect(controller.cameraState()).toEqual(before);
    controller.dispose();
  });

  it("uses only the constructor scene for deferred initial framing", () => {
    const initialScene = {
      geometry: {
        positions: [-1, -0.3, 0, 1, -0.3, 0, 1, 0.3, 0, -1, 0.3, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    } as const;
    const deferredHarness = createHarness({ width: 0, height: 0 });
    const deferred = renderer.startMeshViewport(deferredHarness.canvas, initialScene);
    deferred.setScene({
      geometry: {
        positions: [-0.1, -10, 0, 0.1, -10, 0, 0.1, 10, 0, -0.1, 10, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });
    deferredHarness.resize(1280, 577);

    const referenceHarness = createHarness({ width: 1280, height: 577 });
    const reference = renderer.startMeshViewport(referenceHarness.canvas, initialScene);

    expect(deferred.cameraState()).toEqual(reference.cameraState());
    deferred.dispose();
    reference.dispose();
  });

  it("keeps a user close zoom when selection republishes the same scene", () => {
    const { canvas } = createHarness({ width: 800, height: 500 });
    const scene = {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    } as const;
    const controller = renderer.startMeshViewport(canvas, scene);
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -1_000, cancelable: true }));
    const before = [controller.projectVertex(0)!, controller.projectVertex(1)!];
    const beforeSpan = Math.abs(before[1]!.x - before[0]!.x);

    controller.setScene(scene);
    controller.setSelectedVertex(1);

    const after = [controller.projectVertex(0)!, controller.projectVertex(1)!];
    expect(Math.abs(after[1]!.x - after[0]!.x)).toBeCloseTo(beforeSpan, 10);
    expect(after).toEqual(before);
    controller.dispose();
  });

  it("keeps a user close zoom when a large geometry edit refreshes bounds", () => {
    const { canvas } = createHarness({ width: 800, height: 500 });
    const scene = {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    } as const;
    const controller = renderer.startMeshViewport(canvas, scene);
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -1_000, cancelable: true }));
    const before = [controller.projectVertex(0)!, controller.projectVertex(1)!];
    const beforeSpan = Math.abs(before[1]!.x - before[0]!.x);

    controller.setScene({
      geometry: { positions: [-2, -2, 0, 2, -2, 0, 0, 2, 0], indices: [0, 1, 2] },
      editable: true,
    });

    const after = [controller.projectVertex(0)!, controller.projectVertex(1)!];
    expect(Math.abs(after[1]!.x - after[0]!.x)).toBeCloseTo(beforeSpan, 10);
    controller.dispose();
  });

  it("never adjusts camera state when replacement geometry changes bounds", () => {
    const width = 400;
    const height = 200;
    const { canvas } = createHarness({ width, height });
    const controller = renderer.startMeshViewport(canvas, {
      geometry: {
        positions: [-1, -0.1, 0, 1, -0.1, 0, 1, 0.1, 0, -1, 0.1, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });
    const initialCamera = controller.cameraState();

    controller.setScene({
      geometry: {
        positions: [-100, -1, 0, 0.1, -1, 0, 0.1, 100, 0, -0.1, 1, 0],
        indices: [0, 1, 2, 0, 2, 3],
      },
      editable: true,
    });

    expect(controller.cameraState()).toEqual(initialCamera);
    controller.dispose();
  });

  it("restores project camera state explicitly without consulting scene bounds", () => {
    const { canvas } = createHarness();
    const controller = renderer.startMeshViewport(canvas, {
      geometry: { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] },
      editable: true,
    });
    const saved = {
      yaw: -0.8,
      pitch: 0.35,
      distance: 4.2,
      target: [0.1, 0.2, -0.3] as const,
    };

    controller.restoreCameraState(saved);

    expect(controller.cameraState()).toEqual(saved);
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
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(4);
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
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
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(4);
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
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
