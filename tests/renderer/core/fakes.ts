import type {
  AttributeKey,
  AttributeValue,
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetResolver,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangleHit,
  MeshTriangulationService,
  Ray,
  RenderSceneSnapshot,
  ShadingProgramDescriptor,
  ShadingProvider,
  UniformValue,
  Unsubscribe,
} from "@octopoly/contracts";
import type { RenderPass, RenderPassPhase } from "../../../src/renderer/core/pass";

export class ManualFrameScheduler {
  readonly callbacks = new Map<number, FrameRequestCallback>();
  readonly cancelled: number[] = [];
  #nextId = 1;

  schedule = (callback: FrameRequestCallback): number => {
    const id = this.#nextId;
    this.#nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    this.cancelled.push(id);
    this.callbacks.delete(id);
  };

  flush(): void {
    const callbacks = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of callbacks) {
      callback(0);
    }
  }
}

interface FakeHandle {
  readonly kind: "shader" | "program" | "texture" | "buffer" | "vertex-array";
  readonly id: number;
  source?: string;
}

export class FakeWebGL2Context {
  readonly MAX_TEXTURE_SIZE = 0x0d33;
  readonly DEPTH_TEST = 0x0b71;
  readonly LEQUAL = 0x0203;
  readonly COLOR_BUFFER_BIT = 0x00004000;
  readonly DEPTH_BUFFER_BIT = 0x00000100;
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly TEXTURE_2D = 0x0de1;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly LINEAR = 0x2601;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
  readonly RGBA = 0x1908;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly TEXTURE0 = 0x84c0;
  readonly ARRAY_BUFFER = 0x8892;
  readonly STATIC_DRAW = 0x88e4;
  readonly FLOAT = 0x1406;
  readonly TRIANGLES = 0x0004;

  readonly deletedPrograms: FakeHandle[] = [];
  readonly deletedShaders: FakeHandle[] = [];
  readonly deletedTextures: FakeHandle[] = [];
  readonly createdPrograms: FakeHandle[] = [];
  readonly createdTextures: FakeHandle[] = [];
  readonly deletedBuffers: FakeHandle[] = [];
  readonly deletedVertexArrays: FakeHandle[] = [];
  readonly bufferUploads: number[][] = [];
  readonly vertexAttribPointers: Array<readonly [number, number]> = [];
  readonly drawCalls: Array<readonly [number, number, number]> = [];
  readonly events: string[] = [];
  readonly viewportCalls: Array<readonly [number, number, number, number]> = [];
  readonly clearCalls: number[] = [];
  readonly uniformCalls: string[] = [];
  textureUploadCount = 0;
  maxTextureSize = 8192;
  floatColorBuffer = true;
  linkSucceeds = true;
  createTextureSucceeds = true;
  #nextHandle = 1;

  constructor(readonly canvas: HTMLCanvasElement) {}

  get drawingBufferWidth(): number {
    return this.canvas.width;
  }

  get drawingBufferHeight(): number {
    return this.canvas.height;
  }

  getParameter(parameter: number): unknown {
    return parameter === this.MAX_TEXTURE_SIZE ? this.maxTextureSize : null;
  }

  getExtension(name: string): object | null {
    return name === "EXT_color_buffer_float" && this.floatColorBuffer ? {} : null;
  }

  enable(): void {}
  depthFunc(): void {}
  clearColor(): void {}
  clearDepth(): void {}

  viewport(x: number, y: number, width: number, height: number): void {
    this.viewportCalls.push([x, y, width, height]);
  }

  clear(mask: number): void {
    this.clearCalls.push(mask);
  }

  createShader(): WebGLShader {
    return this.#handle("shader") as unknown as WebGLShader;
  }

  shaderSource(shader: WebGLShader, source: string): void {
    (shader as unknown as FakeHandle).source = source;
  }

  compileShader(): void {}

  getShaderParameter(shader: WebGLShader, parameter: number): unknown {
    if (parameter !== this.COMPILE_STATUS) {
      return null;
    }
    return !(shader as unknown as FakeHandle).source?.includes("FAIL_COMPILE");
  }

  getShaderInfoLog(): string {
    return "fake shader compile failure";
  }

  deleteShader(shader: WebGLShader): void {
    this.deletedShaders.push(shader as unknown as FakeHandle);
  }

  createProgram(): WebGLProgram {
    const handle = this.#handle("program");
    this.createdPrograms.push(handle);
    return handle as unknown as WebGLProgram;
  }

  attachShader(): void {}
  linkProgram(): void {}

  getProgramParameter(_program: WebGLProgram, parameter: number): unknown {
    return parameter === this.LINK_STATUS ? this.linkSucceeds : null;
  }

  getProgramInfoLog(): string {
    return "fake program link failure";
  }

  detachShader(): void {}

  deleteProgram(program: WebGLProgram): void {
    this.deletedPrograms.push(program as unknown as FakeHandle);
  }

  useProgram(): void {}

  getUniformLocation(_program: WebGLProgram, name: string): WebGLUniformLocation {
    return { name } as unknown as WebGLUniformLocation;
  }

  uniform1f(): void { this.uniformCalls.push("1f"); }
  uniform2f(): void { this.uniformCalls.push("2f"); }
  uniform3f(): void { this.uniformCalls.push("3f"); }
  uniform4f(): void { this.uniformCalls.push("4f"); }
  uniform1i(): void { this.uniformCalls.push("1i"); }
  uniform1fv(): void { this.uniformCalls.push("1fv"); }
  uniform2fv(): void { this.uniformCalls.push("2fv"); }
  uniform3fv(): void { this.uniformCalls.push("3fv"); }
  uniform4fv(): void { this.uniformCalls.push("4fv"); }
  uniformMatrix4fv(): void { this.uniformCalls.push("m4"); }

  createTexture(): WebGLTexture | null {
    if (!this.createTextureSucceeds) {
      return null;
    }
    const handle = this.#handle("texture");
    this.createdTextures.push(handle);
    return handle as unknown as WebGLTexture;
  }

  bindTexture(): void {}
  texParameteri(): void {}
  pixelStorei(): void {}
  activeTexture(): void {}

  texImage2D(): void {
    this.textureUploadCount += 1;
  }

  deleteTexture(texture: WebGLTexture): void {
    this.deletedTextures.push(texture as unknown as FakeHandle);
  }

  createVertexArray(): WebGLVertexArrayObject {
    return this.#handle("vertex-array") as unknown as WebGLVertexArrayObject;
  }

  bindVertexArray(): void {}

  deleteVertexArray(vertexArray: WebGLVertexArrayObject): void {
    this.deletedVertexArrays.push(vertexArray as unknown as FakeHandle);
  }

  createBuffer(): WebGLBuffer {
    return this.#handle("buffer") as unknown as WebGLBuffer;
  }

  bindBuffer(): void {}

  bufferData(_target: number, data: BufferSource | null): void {
    if (data === null) {
      this.bufferUploads.push([]);
      return;
    }
    const view = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.bufferUploads.push(Array.from(new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4)));
  }

  deleteBuffer(buffer: WebGLBuffer): void {
    this.deletedBuffers.push(buffer as unknown as FakeHandle);
  }

  getAttribLocation(_program: WebGLProgram, name: string): number {
    const names = ["position", "normal", "vertexValue", "cornerValue", "faceValue"];
    return names.indexOf(name);
  }

  enableVertexAttribArray(): void {}

  vertexAttribPointer(location: number, size: number): void {
    this.vertexAttribPointers.push([location, size]);
  }

  drawArrays(mode: number, first: number, count: number): void {
    this.drawCalls.push([mode, first, count]);
    this.events.push("provider");
  }

  asContext(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }

  #handle(kind: FakeHandle["kind"]): FakeHandle {
    const handle = { kind, id: this.#nextHandle };
    this.#nextHandle += 1;
    return handle;
  }
}

export class FakeRenderPass implements RenderPass {
  initializeCount = 0;
  renderCount = 0;
  invalidateCount = 0;
  disposeCount = 0;
  lastDpr = 0;
  throwOnInitialize = false;

  constructor(
    readonly phase: RenderPassPhase = "base",
    readonly label = "pass",
    readonly events?: string[],
  ) {}

  initialize(): void {
    this.initializeCount += 1;
    if (this.throwOnInitialize) {
      throw new Error("pass initialization failed");
    }
  }

  render(
    _gl: WebGL2RenderingContext,
    _scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.renderCount += 1;
    this.lastDpr = devicePixelRatio;
    this.events?.push(this.label);
  }

  invalidate(): void {
    this.invalidateCount += 1;
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}

export class FakeTriangulationService implements MeshTriangulationService {
  constructor(readonly result: ReadonlyArray<MeshTriangle> = []) {}

  triangles(_mesh: MeshSnapshot): ReadonlyArray<MeshTriangle> {
    return this.result;
  }

  raycast(_ray: Ray, _mesh: MeshSnapshot, _maxDistance?: number): MeshTriangleHit | null {
    return null;
  }
}

export class FakeShadingProvider implements ShadingProvider {
  disposeCount = 0;
  supported = true;
  descriptor: ShadingProgramDescriptor = {
    language: "glsl-es-300",
    vertexShader: "#version 300 es\nvoid main(){gl_Position=vec4(0.0);}",
    fragmentShader: "#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(1.0);}",
  };
  uniformValues: Readonly<Record<string, UniformValue>> = {};
  supportError: Error | null = null;
  programError: Error | null = null;
  uniformsError: Error | null = null;

  constructor(readonly id: string, readonly label = id) {}

  supports(): boolean {
    if (this.supportError !== null) {
      throw this.supportError;
    }
    return this.supported;
  }

  program(): ShadingProgramDescriptor {
    if (this.programError !== null) {
      throw this.programError;
    }
    return this.descriptor;
  }

  uniforms(): Readonly<Record<string, UniformValue>> {
    if (this.uniformsError !== null) {
      throw this.uniformsError;
    }
    return this.uniformValues;
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}

export class FakeImageResolver implements ImageAssetResolver {
  readonly requested: ImageAssetRef[] = [];
  readonly pending: Array<{
    readonly ref: ImageAssetRef;
    readonly resolve: (bitmap: ImageBitmap) => void;
    readonly reject: (error: unknown) => void;
  }> = [];
  readonly listeners = new Set<(event: ImageAssetEvent) => void>();

  resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    this.requested.push(ref);
    return new Promise((resolve, reject) => {
      this.pending.push({ ref, resolve, reject });
    });
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ImageAssetEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

export function createCanvasWithContext(
  context: WebGL2RenderingContext | null,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: () => context,
  });
  return canvas;
}

export function createFakeCanvas(): {
  readonly canvas: HTMLCanvasElement;
  readonly gl: FakeWebGL2Context;
} {
  const canvas = document.createElement("canvas");
  const gl = new FakeWebGL2Context(canvas);
  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: () => gl.asContext(),
  });
  return { canvas, gl };
}

export function createScene(
  viewport = { cssWidth: 100, cssHeight: 50, devicePixelRatio: 2 },
): RenderSceneSnapshot {
  const identity = Object.freeze({ elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]) });
  return Object.freeze({
    camera: Object.freeze({
      view: identity,
      projection: identity,
      viewProjection: identity,
      position: Object.freeze({ x: 0, y: 0, z: 5 }),
    }),
    viewport: Object.freeze(viewport),
    retopo: Object.freeze({
      version: 0,
      vertices: Object.freeze([]),
      edges: Object.freeze([]),
      corners: Object.freeze([]),
      faces: Object.freeze([]),
      attributes: {
        has: (_key: AttributeKey<AttributeValue>) => false,
        get: (_key: AttributeKey<AttributeValue>, _elementId: number) => undefined,
      },
    }),
    selection: Object.freeze({
      version: 0,
      vertices: new Set<number>(),
      edges: new Set<number>(),
      faces: new Set<number>(),
    }),
  });
}

export function fakeBitmap(): ImageBitmap & { closeCount: number } {
  const bitmap = {
    closeCount: 0,
    close(): void {
      this.closeCount += 1;
    },
  };
  return bitmap as ImageBitmap & { closeCount: number };
}
