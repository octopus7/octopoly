interface FakeHandle {
  readonly kind: "shader" | "program" | "buffer" | "vertex-array" | "uniform";
  readonly id: number;
  readonly name?: string;
}

export interface BufferUpload {
  readonly target: number;
  readonly data: Float32Array | Uint32Array;
  readonly usage: number;
}

export class FakeWebGL2 {
  readonly ARRAY_BUFFER = 0x8892;
  readonly ELEMENT_ARRAY_BUFFER = 0x8893;
  readonly STATIC_DRAW = 0x88e4;
  readonly FLOAT = 0x1406;
  readonly UNSIGNED_INT = 0x1405;
  readonly TRIANGLES = 0x0004;
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly DEPTH_TEST = 0x0b71;
  readonly BLEND = 0x0be2;
  readonly CULL_FACE = 0x0b44;
  readonly LEQUAL = 0x0203;

  readonly uploads: BufferUpload[] = [];
  readonly shaderSources: string[] = [];
  readonly enabled: number[] = [];
  readonly disabled: number[] = [];
  readonly depthMasks: boolean[] = [];
  readonly depthFunctions: number[] = [];
  readonly draws: Array<readonly [number, number, number, number]> = [];
  readonly deletedBuffers: WebGLBuffer[] = [];
  readonly deletedVertexArrays: WebGLVertexArrayObject[] = [];
  readonly deletedPrograms: WebGLProgram[] = [];
  readonly deletedShaders: WebGLShader[] = [];
  readonly vertexAttrib3fCalls: Array<readonly [number, number, number, number]> = [];
  readonly uniform1iValues: number[] = [];
  readonly uniform4fValues: Array<readonly [number, number, number, number]> = [];
  readonly matrices: ReadonlyArray<number>[] = [];

  failCompile = false;
  failLink = false;
  failBufferAllocationAt: number | null = null;

  #nextId = 1;
  #bufferAllocations = 0;

  get context(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }

  createShader(): WebGLShader {
    return this.#handle("shader") as unknown as WebGLShader;
  }

  shaderSource(_shader: WebGLShader, source: string): void {
    this.shaderSources.push(source);
  }

  compileShader(): void {}

  getShaderParameter(): boolean {
    return !this.failCompile;
  }

  getShaderInfoLog(): string | null {
    return this.failCompile ? "synthetic compile failure" : null;
  }

  deleteShader(shader: WebGLShader): void {
    this.deletedShaders.push(shader);
  }

  createProgram(): WebGLProgram {
    return this.#handle("program") as unknown as WebGLProgram;
  }

  attachShader(): void {}

  linkProgram(): void {}

  getProgramParameter(): boolean {
    return !this.failLink;
  }

  getProgramInfoLog(): string | null {
    return this.failLink ? "synthetic link failure" : null;
  }

  deleteProgram(program: WebGLProgram): void {
    this.deletedPrograms.push(program);
  }

  getUniformLocation(_program: WebGLProgram, name: string): WebGLUniformLocation {
    return this.#handle("uniform", name) as unknown as WebGLUniformLocation;
  }

  createVertexArray(): WebGLVertexArrayObject {
    return this.#handle("vertex-array") as unknown as WebGLVertexArrayObject;
  }

  deleteVertexArray(vertexArray: WebGLVertexArrayObject): void {
    this.deletedVertexArrays.push(vertexArray);
  }

  bindVertexArray(): void {}

  createBuffer(): WebGLBuffer | null {
    this.#bufferAllocations += 1;
    if (this.failBufferAllocationAt === this.#bufferAllocations) {
      return null;
    }
    return this.#handle("buffer") as unknown as WebGLBuffer;
  }

  deleteBuffer(buffer: WebGLBuffer): void {
    this.deletedBuffers.push(buffer);
  }

  bindBuffer(): void {}

  bufferData(target: number, data: Float32Array | Uint32Array, usage: number): void {
    this.uploads.push({
      target,
      data: data instanceof Float32Array ? data.slice() : data.slice(),
      usage,
    });
  }

  enableVertexAttribArray(): void {}

  disableVertexAttribArray(): void {}

  vertexAttribPointer(): void {}

  vertexAttrib3f(index: number, x: number, y: number, z: number): void {
    this.vertexAttrib3fCalls.push([index, x, y, z]);
  }

  enable(capability: number): void {
    this.enabled.push(capability);
  }

  disable(capability: number): void {
    this.disabled.push(capability);
  }

  depthFunc(value: number): void {
    this.depthFunctions.push(value);
  }

  depthMask(value: boolean): void {
    this.depthMasks.push(value);
  }

  useProgram(): void {}

  uniformMatrix4fv(
    _location: WebGLUniformLocation,
    _transpose: boolean,
    value: ReadonlyArray<number>,
  ): void {
    this.matrices.push(Array.from(value));
  }

  uniform4f(
    _location: WebGLUniformLocation,
    x: number,
    y: number,
    z: number,
    w: number,
  ): void {
    this.uniform4fValues.push([x, y, z, w]);
  }

  uniform1i(_location: WebGLUniformLocation, value: number): void {
    this.uniform1iValues.push(value);
  }

  drawElements(mode: number, count: number, type: number, offset: number): void {
    this.draws.push([mode, count, type, offset]);
  }

  #handle(kind: FakeHandle["kind"], name?: string): FakeHandle {
    const handle = name === undefined
      ? { kind, id: this.#nextId }
      : { kind, id: this.#nextId, name };
    this.#nextId += 1;
    return handle;
  }
}
