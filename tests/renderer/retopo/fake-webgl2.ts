export interface FakeBufferUpload {
  readonly buffer: object;
  readonly data: Float32Array;
  readonly usage: number;
}

export interface FakeDrawCall {
  readonly mode: number;
  readonly count: number;
  readonly buffer: object | null;
  readonly depthEnabled: boolean;
  readonly blendEnabled: boolean;
}

export class FakeWebGL2 {
  readonly ARRAY_BUFFER = 0x8892;
  readonly STATIC_DRAW = 0x88e4;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly FLOAT = 0x1406;
  readonly TRIANGLES = 0x0004;
  readonly LINES = 0x0001;
  readonly LINE_STRIP = 0x0003;
  readonly POINTS = 0x0000;
  readonly DEPTH_TEST = 0x0b71;
  readonly BLEND = 0x0be2;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly LESS = 0x0201;
  readonly LEQUAL = 0x0203;
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;

  readonly uploads: FakeBufferUpload[] = [];
  readonly draws: FakeDrawCall[] = [];
  readonly createdBuffers: object[] = [];
  readonly createdPrograms: object[] = [];
  readonly pointSizes: number[] = [];
  readonly lineWidths: number[] = [];
  readonly deletedBuffers: object[] = [];
  readonly deletedPrograms: object[] = [];
  readonly depthMasks: boolean[] = [];

  private nextId = 1;
  private boundBuffer: object | null = null;
  private readonly enabled = new Set<number>();

  asContext(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }

  createShader(type: number): WebGLShader {
    return { kind: "shader", type, id: this.nextId++ } as unknown as WebGLShader;
  }

  shaderSource(): void {}

  compileShader(): void {}

  getShaderParameter(): boolean {
    return true;
  }

  getShaderInfoLog(): string | null {
    return null;
  }

  deleteShader(): void {}

  createProgram(): WebGLProgram {
    const program = { kind: "program", id: this.nextId++ };
    this.createdPrograms.push(program);
    return program as unknown as WebGLProgram;
  }

  attachShader(): void {}

  linkProgram(): void {}

  getProgramParameter(): boolean {
    return true;
  }

  getProgramInfoLog(): string | null {
    return null;
  }

  getUniformLocation(_program: WebGLProgram, name: string): WebGLUniformLocation {
    return { name } as unknown as WebGLUniformLocation;
  }

  deleteProgram(program: WebGLProgram): void {
    this.deletedPrograms.push(program);
  }

  createBuffer(): WebGLBuffer {
    const buffer = { kind: "buffer", id: this.nextId++ };
    this.createdBuffers.push(buffer);
    return buffer as unknown as WebGLBuffer;
  }

  deleteBuffer(buffer: WebGLBuffer): void {
    this.deletedBuffers.push(buffer);
  }

  bindBuffer(_target: number, buffer: WebGLBuffer | null): void {
    this.boundBuffer = buffer;
  }

  bufferData(_target: number, data: BufferSource | null, usage: number): void {
    if (this.boundBuffer === null || !(data instanceof Float32Array)) {
      throw new Error("FakeWebGL2 expected a bound Float32Array upload");
    }
    this.uploads.push({
      buffer: this.boundBuffer,
      data: new Float32Array(data),
      usage,
    });
  }

  useProgram(): void {}

  uniformMatrix4fv(): void {}

  enableVertexAttribArray(): void {}

  vertexAttribPointer(): void {}

  uniform4f(): void {}

  uniform1f(_location: WebGLUniformLocation, value: number): void {
    this.pointSizes.push(value);
  }

  lineWidth(value: number): void {
    this.lineWidths.push(value);
  }

  drawArrays(mode: number, _first: number, count: number): void {
    this.draws.push({
      mode,
      count,
      buffer: this.boundBuffer,
      depthEnabled: this.enabled.has(this.DEPTH_TEST),
      blendEnabled: this.enabled.has(this.BLEND),
    });
  }

  enable(capability: number): void {
    this.enabled.add(capability);
  }

  disable(capability: number): void {
    this.enabled.delete(capability);
  }

  depthMask(value: boolean): void {
    this.depthMasks.push(value);
  }

  depthFunc(): void {}

  blendFunc(): void {}
}
