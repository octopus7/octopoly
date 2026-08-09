import type { OverlayPrimitive, RenderSceneSnapshot, ToolPreview, Vec3 } from "@octopoly/contracts";

import type { RenderPass } from "../core/pass";

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProjection;
uniform float uPointSize;
void main() {
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  outColor = uColor;
}`;

interface PreviewProgram {
  readonly handle: WebGLProgram;
  readonly viewProjection: WebGLUniformLocation;
  readonly pointSize: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
}

type PreparedPrimitive =
  | {
      readonly kind: "points";
      readonly positions: Float32Array;
      readonly color: readonly [number, number, number, number];
      readonly sizeCssPx: number;
    }
  | {
      readonly kind: "polyline";
      readonly positions: Float32Array;
      readonly color: readonly [number, number, number, number];
      readonly widthCssPx: number;
    }
  | {
      readonly kind: "triangles";
      readonly positions: Float32Array;
      readonly color: readonly [number, number, number, number];
    };

interface PreparedPreview {
  readonly id: string;
  readonly revision: number;
  readonly primitives: ReadonlyArray<PreparedPrimitive>;
}

interface GpuPrimitive {
  readonly descriptor: PreparedPrimitive;
  readonly buffer: WebGLBuffer;
}

function appendPosition(target: number[], position: Vec3): void {
  target.push(position.x, position.y, position.z);
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and greater than zero`);
  }
  return value;
}

function colorTuple(
  color: OverlayPrimitive["color"],
): readonly [number, number, number, number] {
  const values = [color.x, color.y, color.z, color.w] as const;
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("ToolPreview color components must be finite");
  }
  return values;
}

function preparePositions(positions: ReadonlyArray<Vec3>): Float32Array {
  const result: number[] = [];
  for (const position of positions) {
    if (![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new Error("ToolPreview positions must be finite");
    }
    appendPosition(result, position);
  }
  return new Float32Array(result);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported ToolPreview primitive: ${JSON.stringify(value)}`);
}

function preparePrimitive(primitive: OverlayPrimitive): PreparedPrimitive {
  switch (primitive.kind) {
    case "points":
      return {
        kind: "points",
        positions: preparePositions(primitive.positions),
        color: colorTuple(primitive.color),
        sizeCssPx: finitePositive(primitive.sizeCssPx, "ToolPreview point sizeCssPx"),
      };
    case "polyline":
      return {
        kind: "polyline",
        positions: preparePositions(primitive.positions),
        color: colorTuple(primitive.color),
        widthCssPx: finitePositive(primitive.widthCssPx, "ToolPreview polyline widthCssPx"),
      };
    case "triangles": {
      if (primitive.positions.length % 3 !== 0) {
        throw new Error("ToolPreview triangle positions must contain complete triangles");
      }
      return {
        kind: "triangles",
        positions: preparePositions(primitive.positions),
        color: colorTuple(primitive.color),
      };
    }
    default:
      return assertNever(primitive);
  }
}

function preparePreview(preview: ToolPreview): PreparedPreview {
  if (!Number.isSafeInteger(preview.revision) || preview.revision < 0) {
    throw new Error("ToolPreview revision must be a non-negative safe integer");
  }
  return {
    id: preview.id,
    revision: preview.revision,
    primitives: preview.primitives.map(preparePrimitive),
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("Unable to allocate preview shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) ?? "unknown shader compile failure";
    gl.deleteShader(shader);
    throw new Error(`Preview shader compilation failed: ${reason}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): PreviewProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  let fragment: WebGLShader | null = null;
  let handle: WebGLProgram | null = null;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    handle = gl.createProgram();
    if (handle === null) {
      throw new Error("Unable to allocate preview program");
    }
    gl.attachShader(handle, vertex);
    gl.attachShader(handle, fragment);
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      throw new Error(`Preview program link failed: ${gl.getProgramInfoLog(handle) ?? "unknown error"}`);
    }

    const viewProjection = gl.getUniformLocation(handle, "uViewProjection");
    const pointSize = gl.getUniformLocation(handle, "uPointSize");
    const color = gl.getUniformLocation(handle, "uColor");
    if (viewProjection === null || pointSize === null || color === null) {
      throw new Error("Preview program is missing a required uniform");
    }
    return { handle, viewProjection, pointSize, color };
  } catch (error) {
    if (handle !== null) {
      gl.deleteProgram(handle);
    }
    throw error;
  } finally {
    gl.deleteShader(vertex);
    if (fragment !== null) {
      gl.deleteShader(fragment);
    }
  }
}

function deletePrimitives(gl: WebGL2RenderingContext, primitives: ReadonlyArray<GpuPrimitive>): void {
  for (const primitive of primitives) {
    gl.deleteBuffer(primitive.buffer);
  }
}

/** WebGL2 pass for the exhaustive typed ToolPreview primitive union. */
export class PreviewRenderPass implements RenderPass {
  readonly phase = "overlay" as const;
  private gl: WebGL2RenderingContext | null = null;
  private program: PreviewProgram | null = null;
  private prepared: PreparedPreview | null = null;
  private gpuPrimitives: ReadonlyArray<GpuPrimitive> = [];
  private disposed = false;

  initialize(gl: WebGL2RenderingContext): void {
    this.assertAlive();
    if (this.gl !== null && this.program !== null) {
      this.releaseGpu(this.gl);
    }
    const program = createProgram(gl);
    this.gl = gl;
    this.program = program;
    try {
      this.gpuPrimitives = this.prepared === null ? [] : this.uploadPreview(gl, this.prepared);
    } catch (error) {
      gl.deleteProgram(program.handle);
      this.gl = null;
      this.program = null;
      throw error;
    }
  }

  render(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.assertAlive();
    if (gl !== this.gl || this.program === null) {
      throw new Error("PreviewRenderPass must be initialized with the active WebGL2 context");
    }
    finitePositive(devicePixelRatio, "PreviewRenderPass devicePixelRatio");

    if (scene.preview === undefined) {
      if (this.prepared !== null) {
        deletePrimitives(gl, this.gpuPrimitives);
        this.prepared = null;
        this.gpuPrimitives = [];
      }
      return;
    }

    if (
      this.prepared?.id !== scene.preview.id ||
      this.prepared.revision !== scene.preview.revision
    ) {
      const replacement = preparePreview(scene.preview);
      const uploaded = this.uploadPreview(gl, replacement);
      deletePrimitives(gl, this.gpuPrimitives);
      this.prepared = replacement;
      this.gpuPrimitives = uploaded;
    }

    this.draw(gl, scene, devicePixelRatio);
  }

  invalidate(): void {
    if (this.disposed) {
      return;
    }
    this.gl = null;
    this.program = null;
    this.gpuPrimitives = [];
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    if (this.gl !== null) {
      this.releaseGpu(this.gl);
    }
    this.prepared = null;
    this.disposed = true;
  }

  private uploadPreview(
    gl: WebGL2RenderingContext,
    preview: PreparedPreview,
  ): ReadonlyArray<GpuPrimitive> {
    const result: GpuPrimitive[] = [];
    try {
      for (const descriptor of preview.primitives) {
        const buffer = gl.createBuffer();
        if (buffer === null) {
          throw new Error("Unable to allocate ToolPreview buffer");
        }
        result.push({ descriptor, buffer });
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, descriptor.positions, gl.DYNAMIC_DRAW);
      }
      return result;
    } catch (error) {
      deletePrimitives(gl, result);
      throw error;
    }
  }

  private draw(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    const program = this.program;
    if (program === null) {
      throw new Error("PreviewRenderPass GPU program is unavailable");
    }

    // Tool feedback is an editing overlay. It must remain visible over both reference and retopo depth.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program.handle);
    gl.uniformMatrix4fv(program.viewProjection, false, scene.camera.viewProjection.elements);
    gl.enableVertexAttribArray(0);

    for (const primitive of this.gpuPrimitives) {
      const descriptor = primitive.descriptor;
      if (descriptor.positions.length === 0) {
        continue;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, primitive.buffer);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4f(
        program.color,
        descriptor.color[0],
        descriptor.color[1],
        descriptor.color[2],
        descriptor.color[3],
      );

      switch (descriptor.kind) {
        case "points":
          gl.uniform1f(program.pointSize, descriptor.sizeCssPx * devicePixelRatio);
          gl.drawArrays(gl.POINTS, 0, descriptor.positions.length / 3);
          break;
        case "polyline":
          gl.uniform1f(program.pointSize, 1);
          gl.lineWidth(descriptor.widthCssPx * devicePixelRatio);
          gl.drawArrays(gl.LINE_STRIP, 0, descriptor.positions.length / 3);
          break;
        case "triangles":
          gl.uniform1f(program.pointSize, 1);
          gl.drawArrays(gl.TRIANGLES, 0, descriptor.positions.length / 3);
          break;
        default:
          assertNever(descriptor);
      }
    }

    gl.lineWidth(1);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  private releaseGpu(gl: WebGL2RenderingContext): void {
    deletePrimitives(gl, this.gpuPrimitives);
    this.gpuPrimitives = [];
    if (this.program !== null) {
      gl.deleteProgram(this.program.handle);
    }
    this.gl = null;
    this.program = null;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("PreviewRenderPass is disposed");
    }
  }
}
