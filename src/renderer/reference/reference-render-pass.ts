import type { RenderSceneSnapshot, TriangleMeshSnapshot } from "@octopoly/contracts";
import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
} from "@octopoly/contracts";

import type { RenderPass } from "../core/pass";

const REFERENCE_COLOR = Object.freeze([0.58, 0.64, 0.72, 1] as const);

const VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uViewProjection;
uniform bool uHasNormals;

out vec3 vWorldPosition;
out vec3 vNormal;
flat out int vHasNormals;

void main() {
  vWorldPosition = aPosition;
  vNormal = aNormal;
  vHasNormals = uHasNormals ? 1 : 0;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec4 uColor;

in vec3 vWorldPosition;
in vec3 vNormal;
flat in int vHasNormals;

out vec4 outColor;

void main() {
  vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  float suppliedNormalLength = length(vNormal);
  vec3 normal = vHasNormals == 1 && suppliedNormalLength > 0.000001
    ? vNormal / suppliedNormalLength
    : faceNormal;
  if (!gl_FrontFacing) {
    normal = -normal;
  }

  vec3 lightDirection = normalize(vec3(0.35, 0.8, 0.45));
  float lighting = 0.3 + 0.7 * abs(dot(normal, lightDirection));
  outColor = vec4(uColor.rgb * lighting, uColor.a);
}
`;

interface CpuReferenceMesh {
  readonly version: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array | null;
  readonly indices: Uint32Array;
}

interface GpuReferenceMesh {
  readonly vertexArray: WebGLVertexArrayObject;
  readonly positionBuffer: WebGLBuffer;
  readonly normalBuffer: WebGLBuffer | null;
  readonly indexBuffer: WebGLBuffer;
  readonly indexCount: number;
}

interface ReferenceProgram {
  readonly program: WebGLProgram;
  readonly viewProjection: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
  readonly hasNormals: WebGLUniformLocation;
}

/**
 * Required WebGL2 reference-mesh pass.
 *
 * The policy is intentionally fixed for the Core renderer: opaque solid shading,
 * depth testing and depth writes enabled, and no x-ray/blended quality path.
 */
export class ReferenceRenderPass implements RenderPass {
  readonly #vertexShaderSource: string;
  readonly #fragmentShaderSource: string;

  #gl: WebGL2RenderingContext | null = null;
  #program: ReferenceProgram | null = null;
  #cpuMesh: CpuReferenceMesh | null = null;
  #gpuMesh: GpuReferenceMesh | null = null;
  #disposed = false;

  constructor(
    vertexShaderSource = VERTEX_SHADER_SOURCE,
    fragmentShaderSource = FRAGMENT_SHADER_SOURCE,
  ) {
    this.#vertexShaderSource = vertexShaderSource;
    this.#fragmentShaderSource = fragmentShaderSource;
  }

  initialize(gl: WebGL2RenderingContext): void {
    this.#assertNotDisposed();

    if (this.#gl !== null) {
      this.#releaseGpuResources(this.#gl);
    }

    let program: ReferenceProgram | null = null;
    let mesh: GpuReferenceMesh | null = null;
    try {
      program = createReferenceProgram(gl, this.#vertexShaderSource, this.#fragmentShaderSource);
      if (this.#cpuMesh !== null) {
        mesh = uploadReferenceMesh(gl, this.#cpuMesh);
      }
    } catch (error) {
      if (mesh !== null) {
        deleteReferenceMesh(gl, mesh);
      }
      if (program !== null) {
        gl.deleteProgram(program.program);
      }
      throw error;
    }

    this.#gl = gl;
    this.#program = program;
    this.#gpuMesh = mesh;
  }

  render(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.#assertNotDisposed();
    this.#assertInitializedWith(gl);
    void devicePixelRatio;

    const reference = scene.reference;
    if (reference === undefined) {
      this.#clearMesh(gl);
      return;
    }

    assertNonNegativeSafeInteger(reference.version, "reference.version");
    if (this.#cpuMesh?.version !== reference.version) {
      const nextCpuMesh = prepareReferenceMesh(reference);
      const nextGpuMesh = uploadReferenceMesh(gl, nextCpuMesh);
      const previousGpuMesh = this.#gpuMesh;

      this.#cpuMesh = nextCpuMesh;
      this.#gpuMesh = nextGpuMesh;
      if (previousGpuMesh !== null) {
        deleteReferenceMesh(gl, previousGpuMesh);
      }
    }

    const mesh = this.#gpuMesh;
    const program = this.#program;
    if (mesh === null || mesh.indexCount === 0 || program === null) {
      return;
    }

    // Core solid reference policy: opaque, depth-tested/writing, and not x-ray.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(program.program);
    gl.uniformMatrix4fv(program.viewProjection, false, scene.camera.viewProjection.elements);
    gl.uniform4f(program.color, ...REFERENCE_COLOR);
    gl.uniform1i(program.hasNormals, mesh.normalBuffer === null ? 0 : 1);
    gl.bindVertexArray(mesh.vertexArray);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  /** Discards context-owned handles while preserving the last valid CPU snapshot. */
  invalidate(): void {
    if (this.#disposed) {
      return;
    }

    this.#gl = null;
    this.#program = null;
    this.#gpuMesh = null;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    if (this.#gl !== null) {
      this.#releaseGpuResources(this.#gl);
    }
    this.#gl = null;
    this.#cpuMesh = null;
    this.#disposed = true;
  }

  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw new Error("ReferenceRenderPass is disposed");
    }
  }

  #assertInitializedWith(gl: WebGL2RenderingContext): void {
    if (this.#gl === null || this.#program === null) {
      throw new Error("ReferenceRenderPass is not initialized");
    }
    if (this.#gl !== gl) {
      throw new Error("ReferenceRenderPass received a different WebGL2 context");
    }
  }

  #clearMesh(gl: WebGL2RenderingContext): void {
    if (this.#gpuMesh !== null) {
      deleteReferenceMesh(gl, this.#gpuMesh);
    }
    this.#gpuMesh = null;
    this.#cpuMesh = null;
  }

  #releaseGpuResources(gl: WebGL2RenderingContext): void {
    if (this.#gpuMesh !== null) {
      deleteReferenceMesh(gl, this.#gpuMesh);
    }
    if (this.#program !== null) {
      gl.deleteProgram(this.#program.program);
    }
    this.#gpuMesh = null;
    this.#program = null;
  }
}

function prepareReferenceMesh(snapshot: TriangleMeshSnapshot): CpuReferenceMesh {
  assertNonNegativeSafeInteger(snapshot.version, "reference.version");

  const positions = new Float32Array(snapshot.positions.length * 3);
  for (let index = 0; index < snapshot.positions.length; index += 1) {
    const position = snapshot.positions[index];
    if (position === undefined) {
      throw new RangeError(`reference.positions[${index}] is missing`);
    }
    assertFiniteVector(position.x, position.y, position.z, `reference.positions[${index}]`);
    const offset = index * 3;
    positions[offset] = position.x;
    positions[offset + 1] = position.y;
    positions[offset + 2] = position.z;
    assertFiniteFloat32(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!, `reference.positions[${index}]`);
  }

  let normals: Float32Array | null = null;
  if (snapshot.normals !== undefined) {
    if (snapshot.normals.length !== snapshot.positions.length) {
      throw new RangeError("reference.normals length must match reference.positions length");
    }

    normals = new Float32Array(snapshot.normals.length * 3);
    for (let index = 0; index < snapshot.normals.length; index += 1) {
      const normal = snapshot.normals[index];
      if (normal === undefined) {
        throw new RangeError(`reference.normals[${index}] is missing`);
      }
      assertFiniteVector(normal.x, normal.y, normal.z, `reference.normals[${index}]`);
      const offset = index * 3;
      normals[offset] = normal.x;
      normals[offset + 1] = normal.y;
      normals[offset + 2] = normal.z;
      assertFiniteFloat32(normals[offset]!, normals[offset + 1]!, normals[offset + 2]!, `reference.normals[${index}]`);
    }
  }

  if (snapshot.indices.length % 3 !== 0) {
    throw new RangeError("reference.indices length must be divisible by three");
  }

  const validIndices: number[] = [];
  for (let index = 0; index < snapshot.indices.length; index += 3) {
    const a = assertReferenceIndex(snapshot.indices[index], snapshot.positions.length, index);
    const b = assertReferenceIndex(snapshot.indices[index + 1], snapshot.positions.length, index + 1);
    const c = assertReferenceIndex(snapshot.indices[index + 2], snapshot.positions.length, index + 2);

    if (!isDegenerateTriangle(positions, a, b, c)) {
      validIndices.push(a, b, c);
    }
  }

  return {
    version: snapshot.version,
    positions,
    normals,
    indices: Uint32Array.from(validIndices),
  };
}

function assertFiniteVector(x: number, y: number, z: number, label: string): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new RangeError(`${label} must contain finite coordinates`);
  }
}

function assertFiniteFloat32(x: number, y: number, z: number, label: string): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new RangeError(`${label} exceeds the WebGL2 float range`);
  }
}

function assertReferenceIndex(
  value: number | undefined,
  vertexCount: number,
  offset: number,
): number {
  if (!Number.isSafeInteger(value) || value === undefined || value < 0 || value >= vertexCount) {
    throw new RangeError(`reference.indices[${offset}] must address an existing vertex`);
  }
  if (value > 0xffff_ffff) {
    throw new RangeError(`reference.indices[${offset}] exceeds WebGL2 UNSIGNED_INT range`);
  }
  return value;
}

function isDegenerateTriangle(
  positions: Float32Array,
  a: number,
  b: number,
  c: number,
): boolean {
  const aOffset = a * 3;
  const bOffset = b * 3;
  const cOffset = c * 3;

  const abX = positions[bOffset]! - positions[aOffset]!;
  const abY = positions[bOffset + 1]! - positions[aOffset + 1]!;
  const abZ = positions[bOffset + 2]! - positions[aOffset + 2]!;
  const acX = positions[cOffset]! - positions[aOffset]!;
  const acY = positions[cOffset + 1]! - positions[aOffset + 1]!;
  const acZ = positions[cOffset + 2]! - positions[aOffset + 2]!;
  const bcX = positions[cOffset]! - positions[bOffset]!;
  const bcY = positions[cOffset + 1]! - positions[bOffset + 1]!;
  const bcZ = positions[cOffset + 2]! - positions[bOffset + 2]!;

  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  const crossLengthSquared = crossX * crossX + crossY * crossY + crossZ * crossZ;
  const maximumEdgeLengthSquared = Math.max(
    abX * abX + abY * abY + abZ * abZ,
    acX * acX + acY * acY + acZ * acZ,
    bcX * bcX + bcY * bcY + bcZ * bcZ,
  );

  if (maximumEdgeLengthSquared === 0) {
    return true;
  }

  return (
    crossLengthSquared <=
    maximumEdgeLengthSquared * maximumEdgeLengthSquared * NUMERIC_TOLERANCE_POLICY.areaScaleFactor
  );
}

function uploadReferenceMesh(
  gl: WebGL2RenderingContext,
  mesh: CpuReferenceMesh,
): GpuReferenceMesh {
  let vertexArray: WebGLVertexArrayObject | null = null;
  let positionBuffer: WebGLBuffer | null = null;
  let normalBuffer: WebGLBuffer | null = null;
  let indexBuffer: WebGLBuffer | null = null;

  try {
    vertexArray = gl.createVertexArray();
    positionBuffer = gl.createBuffer();
    normalBuffer = mesh.normals === null ? null : gl.createBuffer();
    indexBuffer = gl.createBuffer();

    if (
      vertexArray === null ||
      positionBuffer === null ||
      (mesh.normals !== null && normalBuffer === null) ||
      indexBuffer === null
    ) {
      throw new Error("Unable to allocate reference mesh GPU resources");
    }

    gl.bindVertexArray(vertexArray);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    if (normalBuffer !== null && mesh.normals !== null) {
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(1);
      gl.vertexAttrib3f(1, 0, 1, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  } catch (error) {
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (vertexArray !== null) gl.deleteVertexArray(vertexArray);
    if (positionBuffer !== null) gl.deleteBuffer(positionBuffer);
    if (normalBuffer !== null) gl.deleteBuffer(normalBuffer);
    if (indexBuffer !== null) gl.deleteBuffer(indexBuffer);
    throw error;
  }

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return {
    vertexArray,
    positionBuffer,
    normalBuffer,
    indexBuffer,
    indexCount: mesh.indices.length,
  };
}

function deleteReferenceMesh(gl: WebGL2RenderingContext, mesh: GpuReferenceMesh): void {
  gl.deleteVertexArray(mesh.vertexArray);
  gl.deleteBuffer(mesh.positionBuffer);
  if (mesh.normalBuffer !== null) {
    gl.deleteBuffer(mesh.normalBuffer);
  }
  gl.deleteBuffer(mesh.indexBuffer);
}

function createReferenceProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): ReferenceProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (program === null) {
      throw new Error("Unable to allocate reference shader program");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Reference shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
    }

    const viewProjection = requireUniform(gl, program, "uViewProjection");
    const color = requireUniform(gl, program, "uColor");
    const hasNormals = requireUniform(gl, program, "uHasNormals");
    return { program, viewProjection, color, hasNormals };
  } catch (error) {
    if (program !== null) {
      gl.deleteProgram(program);
    }
    throw error;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader !== null) {
      gl.deleteShader(fragmentShader);
    }
  }
}

function compileShader(
  gl: WebGL2RenderingContext,
  kind: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) {
    throw new Error("Unable to allocate reference shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`Reference shader compile failed: ${reason}`);
  }
  return shader;
}

function requireUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) {
    throw new Error(`Reference shader uniform ${name} is unavailable`);
  }
  return location;
}
