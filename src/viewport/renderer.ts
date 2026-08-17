import { OrbitCamera } from "./camera";
import { attachCameraControls } from "./controls";
import {
  interleavePositionsAndNormals,
  pickVertex as pickProjectedVertex,
  projectPosition,
  type ProjectedPosition,
} from "./mesh-utils";

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uViewProjection;
uniform float uPointSize;
out vec3 vNormal;

void main() {
  vNormal = aNormal;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
uniform vec3 uColor;
uniform float uLighting;
uniform float uPointMode;
out vec4 outColor;

void main() {
  if (uPointMode > 0.5 && distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;
  if (uLighting < 0.5) {
    outColor = vec4(uColor, 1.0);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(0.6, 0.9, 0.7));
  float diffuse = max(dot(normal, light), 0.0);
  float intensity = 0.32 + diffuse * 0.68;
  outColor = vec4(uColor * intensity, 1.0);
}`;

const DEFAULT_COLOR: readonly [number, number, number] = [0.23, 0.57, 0.92];
const EDGE_COLOR: readonly [number, number, number] = [0.055, 0.09, 0.14];
const VERTEX_COLOR: readonly [number, number, number] = [0.88, 0.94, 1];
const SELECTED_VERTEX_COLOR: readonly [number, number, number] = [1, 0.38, 0.12];
const DEFAULT_PICK_RADIUS = 12;

const CUBE_POSITIONS = [
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
  1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1,
  -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1,
  -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
  1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1,
  -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1,
] as const;

const CUBE_INDICES = [
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
] as const;

export interface ViewportMeshGeometry {
  readonly positions: readonly number[];
  readonly indices: readonly number[];
}

export interface ViewportScene {
  readonly geometry: ViewportMeshGeometry;
  readonly editable: boolean;
  readonly color?: readonly [number, number, number];
}

export type ViewportDragPlane = "view" | "xy" | "yz" | "xz";

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

interface PreparedScene {
  readonly positions: readonly number[];
  readonly renderPositions: readonly number[];
  readonly renderScale: number;
  readonly editable: boolean;
  readonly color: readonly [number, number, number];
  readonly vertices: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly edgeIndices: Uint16Array | Uint32Array;
  readonly indexType: number;
}

interface ProgramInputs {
  readonly position: number;
  readonly normal: number;
  readonly viewProjection: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
  readonly lighting: WebGLUniformLocation;
  readonly pointSize: WebGLUniformLocation;
  readonly pointMode: WebGLUniformLocation;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("셰이더를 생성하지 못했습니다.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "알 수 없는 셰이더 오류";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("WebGL 프로그램을 생성하지 못했습니다.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "WebGL 프로그램 연결에 실패했습니다.");
    }
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function requireUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`WebGL uniform ${name}을 찾지 못했습니다.`);
  return location;
}

function getProgramInputs(gl: WebGL2RenderingContext, program: WebGLProgram): ProgramInputs {
  const position = gl.getAttribLocation(program, "aPosition");
  const normal = gl.getAttribLocation(program, "aNormal");
  if (position < 0 || normal < 0) throw new Error("메시 렌더링 vertex attribute를 찾지 못했습니다.");
  return {
    position,
    normal,
    viewProjection: requireUniform(gl, program, "uViewProjection"),
    color: requireUniform(gl, program, "uColor"),
    lighting: requireUniform(gl, program, "uLighting"),
    pointSize: requireUniform(gl, program, "uPointSize"),
    pointMode: requireUniform(gl, program, "uPointMode"),
  };
}

function validateGeometry(geometry: ViewportMeshGeometry): void {
  const { positions, indices } = geometry;
  if (positions.length === 0 || positions.length % 3 !== 0) {
    throw new Error("Viewport geometry positions length must be a non-zero multiple of 3.");
  }
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]!;
    if (!Number.isFinite(position)) {
      throw new Error(`Viewport geometry position at index ${index} must be finite.`);
    }
    if (!Number.isFinite(Math.fround(position))) {
      throw new Error(`Viewport geometry position at index ${index} must fit in a WebGL 32-bit float.`);
    }
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error("Viewport geometry indices length must be a non-zero multiple of 3.");
  }
  const vertexCount = positions.length / 3;
  for (let index = 0; index < indices.length; index += 1) {
    const vertexIndex = indices[index];
    if (!Number.isInteger(vertexIndex) || vertexIndex === undefined || vertexIndex < 0 || vertexIndex >= vertexCount) {
      throw new Error(`Viewport geometry index ${String(vertexIndex)} at offset ${index} is outside the vertex range.`);
    }
  }
}

function createEdgeIndices(indices: readonly number[]): number[] {
  const edgeKeys = new Set<string>();
  const edges: number[] = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!] as const;
    const pairs: readonly (readonly [number, number])[] = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];
    for (const [first, second] of pairs) {
      const low = Math.min(first, second);
      const high = Math.max(first, second);
      const key = `${low}:${high}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push(low, high);
    }
  }
  return edges;
}

function prepareScene(gl: WebGL2RenderingContext, scene: ViewportScene): PreparedScene {
  validateGeometry(scene.geometry);
  const positions = [...scene.geometry.positions];
  const indices = [...scene.geometry.indices];
  const bounds = sceneBounds(positions);
  const renderScale = bounds.radius > 0 ? bounds.radius : 1;
  const renderPositions = positions.map(
    (position, index) => (position - bounds.center[index % 3]!) / renderScale,
  );
  const vertexCount = positions.length / 3;
  let maximumIndex = 0;
  for (const index of indices) maximumIndex = Math.max(maximumIndex, index);
  const useUint32 = vertexCount > 65_535 || maximumIndex > 65_535;
  const IndexArray = useUint32 ? Uint32Array : Uint16Array;
  const color = scene.color ? [...scene.color] as [number, number, number] : DEFAULT_COLOR;
  if (color.some((component) => !Number.isFinite(component))) {
    throw new Error("Viewport scene color components must be finite.");
  }
  const vertices = interleavePositionsAndNormals(renderPositions, indices);
  for (let index = 0; index < vertices.length; index += 1) {
    if (!Number.isFinite(vertices[index]!)) {
      throw new Error(`Viewport prepared vertex data at index ${index} must be finite.`);
    }
  }
  return {
    positions,
    renderPositions,
    renderScale,
    editable: scene.editable,
    color,
    vertices,
    triangleIndices: new IndexArray(indices),
    edgeIndices: new IndexArray(createEdgeIndices(indices)),
    indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
}

interface SceneBounds {
  readonly center: readonly [number, number, number];
  readonly halfExtents: readonly [number, number, number];
  readonly radius: number;
}

function sceneBounds(positions: readonly number[]): SceneBounds {
  const minimum = [positions[0]!, positions[1]!, positions[2]!];
  const maximum = [...minimum];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[offset + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, positions[offset + axis]!);
    }
  }
  const center = minimum.map((value, axis) => (value + maximum[axis]!) / 2) as [number, number, number];
  let radius = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    radius = Math.max(radius, Math.hypot(
      positions[offset]! - center[0],
      positions[offset + 1]! - center[1],
      positions[offset + 2]! - center[2],
    ));
  }
  return {
    center,
    halfExtents: [
      (maximum[0]! - minimum[0]!) / 2,
      (maximum[1]! - minimum[1]!) / 2,
      (maximum[2]! - minimum[2]!) / 2,
    ],
    radius,
  };
}

function shouldReframe(previous: SceneBounds, next: SceneBounds): boolean {
  const centerShift = Math.hypot(
    previous.center[0] - next.center[0],
    previous.center[1] - next.center[1],
    previous.center[2] - next.center[2],
  );
  const previousScale = previous.radius > 0 ? previous.radius : 1;
  const nextScale = next.radius > 0 ? next.radius : 1;
  const scaleRatio = nextScale / previousScale;
  return centerShift > Math.max(previous.radius, next.radius, Number.EPSILON) * 0.25
    || scaleRatio > 1.5
    || scaleRatio < 2 / 3;
}

type Vec3 = readonly [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function intersectPlane(
  origin: Vec3,
  direction: Vec3,
  planePoint: Vec3,
  planeNormal: Vec3,
): Vec3 | null {
  const denominator = dot(direction, planeNormal);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-6) return null;
  const distance = dot([
    planePoint[0] - origin[0],
    planePoint[1] - origin[1],
    planePoint[2] - origin[2],
  ], planeNormal) / denominator;
  if (!Number.isFinite(distance) || distance < 0) return null;
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ];
}

export class MeshViewportController {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #inputs: ProgramInputs;
  readonly #vertexArray: WebGLVertexArrayObject;
  readonly #vertexBuffer: WebGLBuffer;
  readonly #triangleBuffer: WebGLBuffer;
  readonly #edgeBuffer: WebGLBuffer;
  readonly #camera = new OrbitCamera();
  readonly #resizeObserver: ResizeObserver;
  readonly #detachControls: () => void;
  #scene: PreparedScene;
  #bounds: SceneBounds;
  #selectedVertex: number | null = null;
  readonly #viewChangeListeners = new Set<() => void>();
  #frame = 0;
  #disposed = false;
  #awaitingInitialLayout = false;

  constructor(canvas: HTMLCanvasElement, initialScene: ViewportScene) {
    validateGeometry(initialScene.geometry);
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!gl) throw new Error("이 브라우저에서는 WebGL2를 사용할 수 없습니다.");

    const program = createProgram(gl);
    let vertexArray: WebGLVertexArrayObject | null = null;
    let vertexBuffer: WebGLBuffer | null = null;
    let triangleBuffer: WebGLBuffer | null = null;
    let edgeBuffer: WebGLBuffer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let detachControls: (() => void) | null = null;
    try {
      const inputs = getProgramInputs(gl, program);
      vertexArray = gl.createVertexArray();
      vertexBuffer = gl.createBuffer();
      triangleBuffer = gl.createBuffer();
      edgeBuffer = gl.createBuffer();
      if (!vertexArray || !vertexBuffer || !triangleBuffer || !edgeBuffer) {
        throw new Error("메시 렌더링 버퍼를 생성하지 못했습니다.");
      }

      this.#canvas = canvas;
      this.#gl = gl;
      this.#program = program;
      this.#inputs = inputs;
      this.#vertexArray = vertexArray;
      this.#vertexBuffer = vertexBuffer;
      this.#triangleBuffer = triangleBuffer;
      this.#edgeBuffer = edgeBuffer;
      this.#scene = prepareScene(gl, initialScene);
      this.#bounds = sceneBounds(this.#scene.positions);
      const initialBounds = canvas.getBoundingClientRect();
      const initialRenderBounds = sceneBounds(this.#scene.renderPositions);
      const hasInitialLayout = Number.isFinite(initialBounds.width)
        && Number.isFinite(initialBounds.height)
        && initialBounds.width > 0
        && initialBounds.height > 0;
      this.#awaitingInitialLayout = !hasInitialLayout;
      this.#camera.frameBox(
        initialRenderBounds.center,
        initialRenderBounds.halfExtents,
        hasInitialLayout ? initialBounds.width / initialBounds.height : 1,
      );

      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(inputs.position);
      gl.vertexAttribPointer(inputs.position, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(inputs.normal);
      gl.vertexAttribPointer(inputs.normal, 3, gl.FLOAT, false, 24, 12);
      this.#uploadScene();

      detachControls = attachCameraControls(canvas, this.#camera, () => this.#notifyViewChange());
      resizeObserver = new ResizeObserver(() => {
        const bounds = canvas.getBoundingClientRect();
        const hasLayout = Number.isFinite(bounds.width)
          && Number.isFinite(bounds.height)
          && bounds.width > 0
          && bounds.height > 0;
        if (hasLayout) {
          const aspect = bounds.width / bounds.height;
          if (this.#awaitingInitialLayout) {
            const renderBounds = sceneBounds(this.#scene.renderPositions);
            this.#camera.frameBox(renderBounds.center, renderBounds.halfExtents, aspect);
            this.#awaitingInitialLayout = false;
          } else {
            this.#camera.fitAspect(aspect);
          }
        }
        this.#notifyViewChange();
      });
      resizeObserver.observe(canvas);
      this.#detachControls = detachControls;
      this.#resizeObserver = resizeObserver;
      this.invalidate();
    } catch (error) {
      if (this.#frame) cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      resizeObserver?.disconnect();
      detachControls?.();
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (triangleBuffer) gl.deleteBuffer(triangleBuffer);
      if (edgeBuffer) gl.deleteBuffer(edgeBuffer);
      if (vertexArray) gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
      throw error;
    }
  }

  setScene(scene: ViewportScene): void {
    this.#assertActive();
    const prepared = prepareScene(this.#gl, scene);
    const bounds = sceneBounds(prepared.positions);
    const reframe = shouldReframe(this.#bounds, bounds);
    this.#scene = prepared;
    this.#bounds = bounds;
    const canvasBounds = this.#canvas.getBoundingClientRect();
    const renderBounds = sceneBounds(prepared.renderPositions);
    const hasLayout = Number.isFinite(canvasBounds.width)
      && Number.isFinite(canvasBounds.height)
      && canvasBounds.width > 0
      && canvasBounds.height > 0;
    const aspect = hasLayout ? canvasBounds.width / canvasBounds.height : 1;
    if (reframe) {
      this.#awaitingInitialLayout = !hasLayout;
      this.#camera.frameBox(renderBounds.center, renderBounds.halfExtents, aspect);
    } else {
      if (!hasLayout) this.#awaitingInitialLayout = true;
      this.#camera.updateBoxFraming(renderBounds.halfExtents, aspect);
    }
    if (this.#selectedVertex !== null && this.#selectedVertex >= prepared.positions.length / 3) {
      this.#selectedVertex = null;
    }
    this.#uploadScene();
    this.invalidate();
  }

  setSelectedVertex(index: number | null): void {
    this.#assertActive();
    if (index !== null && (!Number.isInteger(index) || index < 0 || index >= this.#scene.positions.length / 3)) {
      throw new RangeError(`Selected vertex index ${String(index)} is outside the mesh.`);
    }
    if (this.#selectedVertex === index) return;
    this.#selectedVertex = index;
    this.invalidate();
  }

  pickVertex(clientX: number, clientY: number, radius = DEFAULT_PICK_RADIUS): number | null {
    this.#assertActive();
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError("Pick radius must be a finite non-negative number.");
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return pickProjectedVertex(
      this.#scene.renderPositions,
      this.#camera.viewProjection(bounds.width / bounds.height),
      bounds.width,
      bounds.height,
      clientX - bounds.left,
      clientY - bounds.top,
      radius,
    );
  }

  projectVertex(index: number): ProjectedPosition | null {
    this.#assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.#scene.positions.length / 3) {
      throw new RangeError(`Vertex index ${String(index)} is outside the mesh.`);
    }
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const offset = index * 3;
    const projected = projectPosition(
      [
        this.#scene.renderPositions[offset]!,
        this.#scene.renderPositions[offset + 1]!,
        this.#scene.renderPositions[offset + 2]!,
      ],
      this.#camera.viewProjection(bounds.width / bounds.height),
      bounds.width,
      bounds.height,
    );
    return projected ? { x: projected.x + bounds.left, y: projected.y + bounds.top, depth: projected.depth } : null;
  }

  focusVertex(index: number): void {
    this.#assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.#scene.positions.length / 3) {
      throw new RangeError(`Vertex index ${String(index)} is outside the mesh.`);
    }
    const offset = index * 3;
    this.#camera.focus([
      this.#scene.renderPositions[offset]!,
      this.#scene.renderPositions[offset + 1]!,
      this.#scene.renderPositions[offset + 2]!,
    ]);
    this.#notifyViewChange();
  }

  modelDeltaForPlaneDrag(
    index: number,
    plane: ViewportDragPlane,
    from: ViewportPoint,
    to: ViewportPoint,
  ): Vec3 | null {
    this.#assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.#scene.positions.length / 3) {
      throw new RangeError(`Vertex index ${String(index)} is outside the mesh.`);
    }
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return null;
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const fromRay = this.#camera.ray(from.x - bounds.left, from.y - bounds.top, bounds.width, bounds.height);
    const toRay = this.#camera.ray(to.x - bounds.left, to.y - bounds.top, bounds.width, bounds.height);
    if (!fromRay || !toRay) return null;
    const offset = index * 3;
    const planePoint: Vec3 = [
      this.#scene.renderPositions[offset]!,
      this.#scene.renderPositions[offset + 1]!,
      this.#scene.renderPositions[offset + 2]!,
    ];
    const planeNormal: Vec3 = plane === "view"
      ? this.#camera.viewDirection()
      : plane === "xy" ? [0, 0, 1]
      : plane === "yz" ? [1, 0, 0]
      : [0, 1, 0];
    const fromPoint = intersectPlane(fromRay.origin, fromRay.direction, planePoint, planeNormal);
    const toPoint = intersectPlane(toRay.origin, toRay.direction, planePoint, planeNormal);
    if (!fromPoint || !toPoint) return null;
    return [
      (toPoint[0] - fromPoint[0]) * this.#scene.renderScale,
      (toPoint[1] - fromPoint[1]) * this.#scene.renderScale,
      (toPoint[2] - fromPoint[2]) * this.#scene.renderScale,
    ];
  }

  projectAxis(index: number, axis: "x" | "y" | "z"): ProjectedPosition | null {
    this.#assertActive();
    const origin = this.projectVertex(index);
    if (!origin) return null;
    const bounds = this.#canvas.getBoundingClientRect();
    const offset = index * 3;
    const axisOffset = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const endpoint: [number, number, number] = [
      this.#scene.renderPositions[offset]!,
      this.#scene.renderPositions[offset + 1]!,
      this.#scene.renderPositions[offset + 2]!,
    ];
    endpoint[axisOffset] += 0.1;
    const projected = projectPosition(
      endpoint,
      this.#camera.viewProjection(bounds.width / bounds.height),
      bounds.width,
      bounds.height,
    );
    return projected ? {
      x: projected.x + bounds.left - origin.x,
      y: projected.y + bounds.top - origin.y,
      depth: projected.depth - origin.depth,
    } : null;
  }

  subscribeViewChange(listener: () => void): () => void {
    this.#assertActive();
    this.#viewChangeListeners.add(listener);
    return () => this.#viewChangeListeners.delete(listener);
  }

  invalidate(): void {
    if (this.#disposed || this.#frame) return;
    this.#frame = requestAnimationFrame(() => this.#draw());
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#resizeObserver.disconnect();
    this.#detachControls();
    this.#viewChangeListeners.clear();
    this.#gl.deleteBuffer(this.#vertexBuffer);
    this.#gl.deleteBuffer(this.#triangleBuffer);
    this.#gl.deleteBuffer(this.#edgeBuffer);
    this.#gl.deleteVertexArray(this.#vertexArray);
    this.#gl.useProgram(null);
    this.#gl.deleteProgram(this.#program);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Mesh viewport controller has been disposed.");
  }

  #notifyViewChange(): void {
    this.invalidate();
    for (const listener of this.#viewChangeListeners) listener();
  }

  #uploadScene(): void {
    const gl = this.#gl;
    gl.bindVertexArray(this.#vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.#scene.vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#triangleBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.#scene.triangleIndices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#edgeBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.#scene.edgeIndices, gl.DYNAMIC_DRAW);
  }

  #draw(): void {
    this.#frame = 0;
    if (this.#disposed) return;
    const gl = this.#gl;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.#canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(this.#canvas.clientHeight * devicePixelRatio));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(this.#program);
    try {
      gl.bindVertexArray(this.#vertexArray);
      gl.uniformMatrix4fv(this.#inputs.viewProjection, false, this.#camera.viewProjection(width / height));

      this.#setStyle(this.#scene.color, 1, 1, false);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#triangleBuffer);
      gl.drawElements(gl.TRIANGLES, this.#scene.triangleIndices.length, this.#scene.indexType, 0);

      if (!this.#scene.editable) return;
      gl.disable(gl.CULL_FACE);
      try {
        gl.depthFunc(gl.LEQUAL);
        try {
          this.#setStyle(EDGE_COLOR, 0, 1, false);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#edgeBuffer);
          gl.drawElements(gl.LINES, this.#scene.edgeIndices.length, this.#scene.indexType, 0);

          this.#setStyle(VERTEX_COLOR, 0, 5 * devicePixelRatio, false);
          gl.drawArrays(gl.POINTS, 0, this.#scene.positions.length / 3);
          if (this.#selectedVertex !== null) {
            this.#setStyle(SELECTED_VERTEX_COLOR, 0, 8 * devicePixelRatio, false);
            gl.drawArrays(gl.POINTS, this.#selectedVertex, 1);
          }
        } finally {
          gl.depthFunc(gl.LESS);
        }
      } finally {
        gl.enable(gl.CULL_FACE);
      }
    } finally {
      gl.useProgram(null);
    }
  }

  #setStyle(color: readonly [number, number, number], lighting: number, pointSize: number, pointMode: boolean): void {
    const gl = this.#gl;
    gl.uniform3fv(this.#inputs.color, color);
    gl.uniform1f(this.#inputs.lighting, lighting);
    gl.uniform1f(this.#inputs.pointSize, pointSize);
    gl.uniform1f(this.#inputs.pointMode, pointMode ? 1 : 0);
  }
}

export function startMeshViewport(canvas: HTMLCanvasElement, initialScene: ViewportScene): MeshViewportController {
  return new MeshViewportController(canvas, initialScene);
}

export function startCubeViewport(canvas: HTMLCanvasElement): () => void {
  const controller = startMeshViewport(canvas, {
    geometry: { positions: CUBE_POSITIONS, indices: CUBE_INDICES },
    editable: false,
  });
  return () => controller.dispose();
}
