import type {
  MeshSnapshot,
  MeshTriangulationService,
  RenderSceneSnapshot,
  SelectionSnapshot,
  Vec3,
} from "@octopoly/contracts";

import type { RenderPass, RenderPassPhase } from "../core/pass";

const SOLID_COLOR = Object.freeze([0.19, 0.43, 0.64, 1] as const);
const WIRE_COLOR = Object.freeze([0.04, 0.08, 0.11, 1] as const);
const VERTEX_COLOR = Object.freeze([0.75, 0.87, 0.96, 1] as const);
const SELECTED_FACE_COLOR = Object.freeze([1, 0.46, 0.08, 0.28] as const);
const SELECTED_EDGE_COLOR = Object.freeze([1, 0.55, 0.08, 1] as const);
const SELECTED_VERTEX_COLOR = Object.freeze([1, 0.76, 0.2, 1] as const);
const VERTEX_SIZE_CSS_PX = 5;
const SELECTED_VERTEX_SIZE_CSS_PX = 8;

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

interface RetopoCpuGeometry {
  readonly meshVersion: number;
  readonly facePositions: Float32Array;
  readonly triangleFaceIds: Float64Array;
  readonly triangleCornerIds: Float64Array;
  readonly edgePositions: Float32Array;
  readonly vertexPositions: Float32Array;
}

interface RetopoSelectionGeometry {
  readonly meshVersion: number;
  readonly selectionVersion: number;
  readonly facePositions: Float32Array;
  readonly edgePositions: Float32Array;
  readonly vertexPositions: Float32Array;
}

interface RetopoProgram {
  readonly handle: WebGLProgram;
  readonly viewProjection: WebGLUniformLocation;
  readonly pointSize: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
}

interface RetopoBuffers {
  readonly faces: WebGLBuffer;
  readonly edges: WebGLBuffer;
  readonly vertices: WebGLBuffer;
  readonly selectedFaces: WebGLBuffer;
  readonly selectedEdges: WebGLBuffer;
  readonly selectedVertices: WebGLBuffer;
}

function appendPosition(target: number[], position: Vec3): void {
  target.push(position.x, position.y, position.z);
}

function vertexPositionsById(mesh: MeshSnapshot): ReadonlyMap<number, Vec3> {
  const result = new Map<number, Vec3>();
  for (const vertex of mesh.vertices) {
    result.set(vertex.id, vertex.position);
  }
  return result;
}

function requirePosition(positions: ReadonlyMap<number, Vec3>, vertexId: number): Vec3 {
  const position = positions.get(vertexId);
  if (position === undefined) {
    throw new Error(`Retopo edge references missing vertex ${vertexId}`);
  }
  return position;
}

function buildMeshGeometry(
  mesh: MeshSnapshot,
  triangulation: MeshTriangulationService,
): RetopoCpuGeometry {
  const triangles = [...triangulation.triangles(mesh)];
  const facePositions: number[] = [];
  const triangleFaceIds: number[] = [];
  const triangleCornerIds: number[] = [];
  for (const triangle of triangles) {
    triangleFaceIds.push(triangle.face);
    triangleCornerIds.push(...triangle.corners);
    for (const position of triangle.positions) {
      appendPosition(facePositions, position);
    }
  }

  const positions = vertexPositionsById(mesh);
  const edgePositions: number[] = [];
  for (const edge of mesh.edges) {
    appendPosition(edgePositions, requirePosition(positions, edge.vertices[0]));
    appendPosition(edgePositions, requirePosition(positions, edge.vertices[1]));
  }

  const vertexPositions: number[] = [];
  for (const vertex of mesh.vertices) {
    appendPosition(vertexPositions, vertex.position);
  }

  return {
    meshVersion: mesh.version,
    facePositions: new Float32Array(facePositions),
    triangleFaceIds: new Float64Array(triangleFaceIds),
    triangleCornerIds: new Float64Array(triangleCornerIds),
    edgePositions: new Float32Array(edgePositions),
    vertexPositions: new Float32Array(vertexPositions),
  };
}

function buildSelectionGeometry(
  mesh: MeshSnapshot,
  selection: SelectionSnapshot,
  geometry: RetopoCpuGeometry,
): RetopoSelectionGeometry {
  const facePositions: number[] = [];
  for (let triangleIndex = 0; triangleIndex < geometry.triangleFaceIds.length; triangleIndex += 1) {
    const faceId = geometry.triangleFaceIds[triangleIndex];
    if (faceId === undefined || !selection.faces.has(faceId)) {
      continue;
    }
    const firstComponent = triangleIndex * 9;
    for (let component = firstComponent; component < firstComponent + 9; component += 1) {
      const value = geometry.facePositions[component];
      if (value === undefined) {
        throw new Error("Canonical triangulation produced incomplete face positions");
      }
      facePositions.push(value);
    }
  }

  const positions = vertexPositionsById(mesh);
  const edgePositions: number[] = [];
  for (const edge of mesh.edges) {
    if (!selection.edges.has(edge.id)) {
      continue;
    }
    appendPosition(edgePositions, requirePosition(positions, edge.vertices[0]));
    appendPosition(edgePositions, requirePosition(positions, edge.vertices[1]));
  }

  const selectedVertexPositions: number[] = [];
  for (const vertex of mesh.vertices) {
    if (selection.vertices.has(vertex.id)) {
      appendPosition(selectedVertexPositions, vertex.position);
    }
  }

  return {
    meshVersion: mesh.version,
    selectionVersion: selection.version,
    facePositions: new Float32Array(facePositions),
    edgePositions: new Float32Array(edgePositions),
    vertexPositions: new Float32Array(selectedVertexPositions),
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("Unable to allocate retopo shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) ?? "unknown shader compile failure";
    gl.deleteShader(shader);
    throw new Error(`Retopo shader compilation failed: ${reason}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): RetopoProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  let fragment: WebGLShader | null = null;
  let handle: WebGLProgram | null = null;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    handle = gl.createProgram();
    if (handle === null) {
      throw new Error("Unable to allocate retopo program");
    }
    gl.attachShader(handle, vertex);
    gl.attachShader(handle, fragment);
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      throw new Error(`Retopo program link failed: ${gl.getProgramInfoLog(handle) ?? "unknown error"}`);
    }

    const viewProjection = gl.getUniformLocation(handle, "uViewProjection");
    const pointSize = gl.getUniformLocation(handle, "uPointSize");
    const color = gl.getUniformLocation(handle, "uColor");
    if (viewProjection === null || pointSize === null || color === null) {
      throw new Error("Retopo program is missing a required uniform");
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

function requireBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (buffer === null) {
    throw new Error("Unable to allocate retopo buffer");
  }
  return buffer;
}

function createBuffers(gl: WebGL2RenderingContext): RetopoBuffers {
  const created: WebGLBuffer[] = [];
  const next = (): WebGLBuffer => {
    const buffer = requireBuffer(gl);
    created.push(buffer);
    return buffer;
  };
  try {
    return {
      faces: next(),
      edges: next(),
      vertices: next(),
      selectedFaces: next(),
      selectedEdges: next(),
      selectedVertices: next(),
    };
  } catch (error) {
    for (const buffer of created) {
      gl.deleteBuffer(buffer);
    }
    throw error;
  }
}

function deleteBuffers(gl: WebGL2RenderingContext, buffers: RetopoBuffers): void {
  gl.deleteBuffer(buffers.faces);
  gl.deleteBuffer(buffers.edges);
  gl.deleteBuffer(buffers.vertices);
  gl.deleteBuffer(buffers.selectedFaces);
  gl.deleteBuffer(buffers.selectedEdges);
  gl.deleteBuffer(buffers.selectedVertices);
}

function upload(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  positions: Float32Array,
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
}

function setColor(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  color: readonly [number, number, number, number],
): void {
  gl.uniform4f(location, color[0], color[1], color[2], color[3]);
}

class RetopoPassResources {
  private readonly triangulation: MeshTriangulationService;
  private readonly owners = new Set<object>();
  private gl: WebGL2RenderingContext | null = null;
  private program: RetopoProgram | null = null;
  private buffers: RetopoBuffers | null = null;
  private geometry: RetopoCpuGeometry | null = null;
  private selectionGeometry: RetopoSelectionGeometry | null = null;
  private uploadedFaceMeshVersion: number | null = null;
  private uploadedOverlayMeshVersion: number | null = null;
  private uploadedSelectionMeshVersion: number | null = null;
  private uploadedSelectionVersion: number | null = null;
  private disposed = false;

  constructor(triangulation: MeshTriangulationService) {
    this.triangulation = triangulation;
  }

  attach(): object {
    this.assertAlive();
    const owner = {};
    this.owners.add(owner);
    return owner;
  }

  initialize(gl: WebGL2RenderingContext): void {
    this.assertAlive();
    if (this.gl === gl && this.program !== null && this.buffers !== null) {
      return;
    }
    if (this.gl !== null && this.program !== null && this.buffers !== null) {
      this.releaseGpu(this.gl);
    }

    const program = createProgram(gl);
    let buffers: RetopoBuffers | null = null;
    try {
      buffers = createBuffers(gl);
      this.gl = gl;
      this.program = program;
      this.buffers = buffers;
      this.uploadedFaceMeshVersion = null;
      this.uploadedOverlayMeshVersion = null;
      this.uploadedSelectionMeshVersion = null;
      this.uploadedSelectionVersion = null;
      if (this.geometry !== null) {
        upload(gl, buffers.faces, this.geometry.facePositions);
        upload(gl, buffers.edges, this.geometry.edgePositions);
        upload(gl, buffers.vertices, this.geometry.vertexPositions);
        this.uploadedFaceMeshVersion = this.geometry.meshVersion;
        this.uploadedOverlayMeshVersion = this.geometry.meshVersion;
      }
      if (this.selectionGeometry !== null) {
        upload(gl, buffers.selectedFaces, this.selectionGeometry.facePositions);
        upload(gl, buffers.selectedEdges, this.selectionGeometry.edgePositions);
        upload(gl, buffers.selectedVertices, this.selectionGeometry.vertexPositions);
        this.uploadedSelectionMeshVersion = this.selectionGeometry.meshVersion;
        this.uploadedSelectionVersion = this.selectionGeometry.selectionVersion;
      }
    } catch (error) {
      if (this.gl === gl) {
        this.releaseGpu(gl);
      } else {
        gl.deleteProgram(program.handle);
        if (buffers !== null) {
          deleteBuffers(gl, buffers);
        }
      }
      throw error;
    }
  }

  renderSolid(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.assertReady(gl, devicePixelRatio);
    const geometry = this.ensureGeometry(scene);
    const buffers = this.requireBuffers();
    if (this.uploadedFaceMeshVersion !== geometry.meshVersion) {
      upload(gl, buffers.faces, geometry.facePositions);
      this.uploadedFaceMeshVersion = geometry.meshVersion;
    }
    this.drawSolid(gl, scene, geometry, buffers);
  }

  renderOverlay(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.assertReady(gl, devicePixelRatio);
    const geometry = this.ensureGeometry(scene);
    const selection = this.ensureSelection(scene, geometry);
    const buffers = this.requireBuffers();
    if (this.uploadedOverlayMeshVersion !== geometry.meshVersion) {
      upload(gl, buffers.edges, geometry.edgePositions);
      upload(gl, buffers.vertices, geometry.vertexPositions);
      this.uploadedOverlayMeshVersion = geometry.meshVersion;
    }
    if (
      this.uploadedSelectionMeshVersion !== selection.meshVersion ||
      this.uploadedSelectionVersion !== selection.selectionVersion
    ) {
      upload(gl, buffers.selectedFaces, selection.facePositions);
      upload(gl, buffers.selectedEdges, selection.edgePositions);
      upload(gl, buffers.selectedVertices, selection.vertexPositions);
      this.uploadedSelectionMeshVersion = selection.meshVersion;
      this.uploadedSelectionVersion = selection.selectionVersion;
    }
    this.drawOverlay(gl, scene, devicePixelRatio, geometry, selection, buffers);
  }

  invalidate(): void {
    if (this.disposed) {
      return;
    }
    this.gl = null;
    this.program = null;
    this.buffers = null;
    this.uploadedFaceMeshVersion = null;
    this.uploadedOverlayMeshVersion = null;
    this.uploadedSelectionMeshVersion = null;
    this.uploadedSelectionVersion = null;
  }

  release(owner: object): void {
    if (!this.owners.delete(owner) || this.owners.size > 0 || this.disposed) {
      return;
    }
    if (this.gl !== null) {
      this.releaseGpu(this.gl);
    }
    this.geometry = null;
    this.selectionGeometry = null;
    this.disposed = true;
  }

  private ensureGeometry(scene: RenderSceneSnapshot): RetopoCpuGeometry {
    if (this.geometry?.meshVersion !== scene.retopo.version) {
      this.geometry = buildMeshGeometry(scene.retopo, this.triangulation);
      this.selectionGeometry = null;
    }
    return this.geometry;
  }

  private ensureSelection(
    scene: RenderSceneSnapshot,
    geometry: RetopoCpuGeometry,
  ): RetopoSelectionGeometry {
    if (
      this.selectionGeometry?.meshVersion !== scene.retopo.version ||
      this.selectionGeometry.selectionVersion !== scene.selection.version
    ) {
      this.selectionGeometry = buildSelectionGeometry(scene.retopo, scene.selection, geometry);
    }
    return this.selectionGeometry;
  }

  private drawSolid(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    geometry: RetopoCpuGeometry,
    buffers: RetopoBuffers,
  ): void {
    const program = this.program;
    if (program === null) {
      throw new Error("Retopo solid GPU program is unavailable");
    }

    gl.useProgram(program.handle);
    gl.uniformMatrix4fv(program.viewProjection, false, scene.camera.viewProjection.elements);
    gl.enableVertexAttribArray(0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawBuffer(gl, program, buffers.faces, geometry.facePositions, gl.TRIANGLES, SOLID_COLOR, 1);
  }

  private drawOverlay(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
    geometry: RetopoCpuGeometry,
    selection: RetopoSelectionGeometry,
    buffers: RetopoBuffers,
  ): void {
    const program = this.program;
    if (program === null) {
      throw new Error("Retopo overlay GPU program is unavailable");
    }

    gl.useProgram(program.handle);
    gl.uniformMatrix4fv(program.viewProjection, false, scene.camera.viewProjection.elements);
    gl.enableVertexAttribArray(0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.lineWidth(1);
    this.drawBuffer(gl, program, buffers.edges, geometry.edgePositions, gl.LINES, WIRE_COLOR, 1);
    this.drawBuffer(
      gl,
      program,
      buffers.vertices,
      geometry.vertexPositions,
      gl.POINTS,
      VERTEX_COLOR,
      VERTEX_SIZE_CSS_PX * devicePixelRatio,
    );

    // Selection is an editing affordance: keep it visible even when the solid pass has written depth.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawBuffer(
      gl,
      program,
      buffers.selectedFaces,
      selection.facePositions,
      gl.TRIANGLES,
      SELECTED_FACE_COLOR,
      1,
    );
    gl.disable(gl.BLEND);
    this.drawBuffer(
      gl,
      program,
      buffers.selectedEdges,
      selection.edgePositions,
      gl.LINES,
      SELECTED_EDGE_COLOR,
      1,
    );
    this.drawBuffer(
      gl,
      program,
      buffers.selectedVertices,
      selection.vertexPositions,
      gl.POINTS,
      SELECTED_VERTEX_COLOR,
      SELECTED_VERTEX_SIZE_CSS_PX * devicePixelRatio,
    );

    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.lineWidth(1);
    gl.enable(gl.DEPTH_TEST);
  }

  private assertReady(gl: WebGL2RenderingContext, devicePixelRatio: number): void {
    this.assertAlive();
    if (gl !== this.gl || this.program === null || this.buffers === null) {
      throw new Error("Retopo pass must be initialized with the active WebGL2 context");
    }
    if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
      throw new Error("Retopo pass requires a finite positive devicePixelRatio");
    }
  }

  private requireBuffers(): RetopoBuffers {
    if (this.buffers === null) {
      throw new Error("Retopo GPU buffers are unavailable");
    }
    return this.buffers;
  }

  private drawBuffer(
    gl: WebGL2RenderingContext,
    program: RetopoProgram,
    buffer: WebGLBuffer,
    positions: Float32Array,
    primitive: number,
    color: readonly [number, number, number, number],
    pointSize: number,
  ): void {
    if (positions.length === 0) {
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    setColor(gl, program.color, color);
    gl.uniform1f(program.pointSize, pointSize);
    gl.drawArrays(primitive, 0, positions.length / 3);
  }

  private releaseGpu(gl: WebGL2RenderingContext): void {
    if (this.buffers !== null) {
      deleteBuffers(gl, this.buffers);
    }
    if (this.program !== null) {
      gl.deleteProgram(this.program.handle);
    }
    this.gl = null;
    this.program = null;
    this.buffers = null;
    this.uploadedFaceMeshVersion = null;
    this.uploadedOverlayMeshVersion = null;
    this.uploadedSelectionMeshVersion = null;
    this.uploadedSelectionVersion = null;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("RetopoRenderPass is disposed");
    }
  }
}

class PhasedRetopoRenderPass implements RenderPass {
  readonly phase: RenderPassPhase;
  private readonly resources: RetopoPassResources;
  private readonly owner: object;
  private disposed = false;

  constructor(resources: RetopoPassResources, phase: "fallback" | "overlay") {
    this.resources = resources;
    this.phase = phase;
    this.owner = resources.attach();
  }

  initialize(gl: WebGL2RenderingContext): void {
    this.assertAlive();
    this.resources.initialize(gl);
  }

  render(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.assertAlive();
    if (this.phase === "fallback") {
      this.resources.renderSolid(gl, scene, devicePixelRatio);
    } else {
      this.resources.renderOverlay(gl, scene, devicePixelRatio);
    }
  }

  invalidate(): void {
    if (!this.disposed) {
      this.resources.invalidate();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resources.release(this.owner);
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error(`Retopo ${this.phase} pass is disposed`);
    }
  }
}

export interface RetopoRenderPassPair {
  readonly solid: RenderPass;
  readonly overlay: RenderPass;
}

/** Creates the provider-skippable solid fallback and always-on topology overlay with one shared cache. */
export function createRetopoRenderPasses(
  triangulation: MeshTriangulationService,
): RetopoRenderPassPair {
  const resources = new RetopoPassResources(triangulation);
  return {
    solid: new PhasedRetopoRenderPass(resources, "fallback"),
    overlay: new PhasedRetopoRenderPass(resources, "overlay"),
  };
}

/**
 * Backwards-compatible all-in-one pass. New renderer composition should use
 * createRetopoRenderPasses() so a usable shading provider can skip only the solid fallback.
 */
export class RetopoRenderPass implements RenderPass {
  private readonly resources: RetopoPassResources;
  private readonly owner: object;
  private disposed = false;

  constructor(triangulation: MeshTriangulationService) {
    this.resources = new RetopoPassResources(triangulation);
    this.owner = this.resources.attach();
  }

  initialize(gl: WebGL2RenderingContext): void {
    this.assertAlive();
    this.resources.initialize(gl);
  }

  render(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void {
    this.assertAlive();
    this.resources.renderSolid(gl, scene, devicePixelRatio);
    this.resources.renderOverlay(gl, scene, devicePixelRatio);
  }

  invalidate(): void {
    if (!this.disposed) {
      this.resources.invalidate();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resources.release(this.owner);
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("RetopoRenderPass is disposed");
    }
  }
}
