import { OrbitCamera, type CameraState } from "./camera";
import { attachCameraControls } from "./controls";
import {
  interleavePositionsAndNormals,
  pickVertex as pickProjectedVertex,
  projectPosition,
  type ProjectedPosition,
} from "./mesh-utils";

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uViewProjection;
out vec3 vNormal;
out vec2 vUv;

void main() {
  vNormal = aNormal;
  vUv = aUv;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
uniform vec3 uColor;
uniform sampler2D uTexture;
uniform float uUseTexture;
uniform float uLighting;
out vec4 outColor;

void main() {
  if (uLighting < 0.5) {
    outColor = vec4(uColor, 1.0);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(0.6, 0.9, 0.7));
  float diffuse = max(dot(normal, light), 0.0);
  float intensity = 0.32 + diffuse * 0.68;
  vec4 surface = uUseTexture > 0.5 ? texture(uTexture, vUv) : vec4(uColor, 1.0);
  outColor = vec4(surface.rgb * intensity, surface.a);
}`;

const HANDLE_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uViewProjection;
uniform sampler2D uMeshDepth;
uniform float uPointSize;

void main() {
  vec4 clip = uViewProjection * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
  bool visible = false;
  if (clip.w > 0.0
    && abs(clip.x) <= clip.w
    && abs(clip.y) <= clip.w
    && abs(clip.z) <= clip.w) {
    vec3 ndc = clip.xyz / clip.w;
    ivec2 size = textureSize(uMeshDepth, 0);
    ivec2 pixel = clamp(
      ivec2(floor((ndc.xy * 0.5 + 0.5) * vec2(size))),
      ivec2(0),
      size - ivec2(1)
    );
    float centerDepth = ndc.z * 0.5 + 0.5;
    float meshDepth = texelFetch(uMeshDepth, pixel, 0).r;
    visible = centerDepth <= meshDepth;
  }
  gl_Position = visible ? clip : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const HANDLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor, 1.0);
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
  readonly uvs?: readonly number[];
}

export interface ViewportScene {
  readonly geometry: ViewportMeshGeometry;
  readonly editable: boolean;
  readonly color?: readonly [number, number, number];
  readonly textureKey?: string;
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
  readonly uvs: Float32Array | null;
  readonly textureKey: string | null;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly edgeIndices: Uint16Array | Uint32Array;
  readonly indexType: number;
}

interface SceneResources {
  readonly vertexArray: WebGLVertexArrayObject;
  readonly vertexBuffer: WebGLBuffer;
  readonly uvBuffer: WebGLBuffer;
  readonly triangleBuffer: WebGLBuffer;
  readonly edgeBuffer: WebGLBuffer;
}

interface ProgramInputs {
  readonly position: number;
  readonly normal: number;
  readonly uv: number;
  readonly viewProjection: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
  readonly lighting: WebGLUniformLocation;
  readonly texture: WebGLUniformLocation;
  readonly useTexture: WebGLUniformLocation;
}

interface HandleProgramInputs {
  readonly viewProjection: WebGLUniformLocation;
  readonly meshDepth: WebGLUniformLocation;
  readonly pointSize: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
}

interface VisibilityDepthTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
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

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource = VERTEX_SHADER,
  fragmentSource = FRAGMENT_SHADER,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
  const uv = gl.getAttribLocation(program, "aUv");
  if (position < 0 || normal < 0 || uv < 0) throw new Error("메시 렌더링 vertex attribute를 찾지 못했습니다.");
  return {
    position,
    normal,
    uv,
    viewProjection: requireUniform(gl, program, "uViewProjection"),
    color: requireUniform(gl, program, "uColor"),
    lighting: requireUniform(gl, program, "uLighting"),
    texture: requireUniform(gl, program, "uTexture"),
    useTexture: requireUniform(gl, program, "uUseTexture"),
  };
}

function getHandleProgramInputs(gl: WebGL2RenderingContext, program: WebGLProgram): HandleProgramInputs {
  return {
    viewProjection: requireUniform(gl, program, "uViewProjection"),
    meshDepth: requireUniform(gl, program, "uMeshDepth"),
    pointSize: requireUniform(gl, program, "uPointSize"),
    color: requireUniform(gl, program, "uColor"),
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
  if (geometry.uvs !== undefined) {
    if (geometry.uvs.length !== vertexCount * 2) {
      throw new Error("Viewport geometry UV length must provide two coordinates per vertex.");
    }
    for (let index = 0; index < geometry.uvs.length; index += 1) {
      const coordinate = geometry.uvs[index];
      if (coordinate === undefined || !Number.isFinite(coordinate) || !Number.isFinite(Math.fround(coordinate))) {
        throw new Error(`Viewport geometry UV at index ${index} must be a finite 32-bit float.`);
      }
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
    uvs: scene.geometry.uvs ? new Float32Array(scene.geometry.uvs) : null,
    textureKey: scene.textureKey ?? null,
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
  readonly #handleProgram: WebGLProgram;
  readonly #handleInputs: HandleProgramInputs;
  #vertexArray: WebGLVertexArrayObject;
  #vertexBuffer: WebGLBuffer;
  #uvBuffer: WebGLBuffer;
  #triangleBuffer: WebGLBuffer;
  #edgeBuffer: WebGLBuffer;
  #textures = new Map<string, WebGLTexture>();
  #visibilityDepthTarget: VisibilityDepthTarget | null = null;
  readonly #camera = new OrbitCamera();
  readonly #initialFrameCenter: readonly [number, number, number];
  readonly #initialFrameHalfExtents: readonly [number, number, number];
  readonly #resizeObserver: ResizeObserver;
  readonly #detachControls: () => void;
  #scene: PreparedScene;
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
    let handleProgram: WebGLProgram | null = null;
    let vertexArray: WebGLVertexArrayObject | null = null;
    let vertexBuffer: WebGLBuffer | null = null;
    let uvBuffer: WebGLBuffer | null = null;
    let triangleBuffer: WebGLBuffer | null = null;
    let edgeBuffer: WebGLBuffer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let detachControls: (() => void) | null = null;
    try {
      const inputs = getProgramInputs(gl, program);
      handleProgram = createProgram(gl, HANDLE_VERTEX_SHADER, HANDLE_FRAGMENT_SHADER);
      const handleInputs = getHandleProgramInputs(gl, handleProgram);
      vertexArray = gl.createVertexArray();
      vertexBuffer = gl.createBuffer();
      uvBuffer = gl.createBuffer();
      triangleBuffer = gl.createBuffer();
      edgeBuffer = gl.createBuffer();
      if (!vertexArray || !vertexBuffer || !uvBuffer || !triangleBuffer || !edgeBuffer) {
        throw new Error("메시 렌더링 버퍼를 생성하지 못했습니다.");
      }

      this.#canvas = canvas;
      this.#gl = gl;
      this.#program = program;
      this.#inputs = inputs;
      this.#handleProgram = handleProgram;
      this.#handleInputs = handleInputs;
      this.#vertexArray = vertexArray;
      this.#vertexBuffer = vertexBuffer;
      this.#uvBuffer = uvBuffer;
      this.#triangleBuffer = triangleBuffer;
      this.#edgeBuffer = edgeBuffer;
      this.#scene = prepareScene(gl, initialScene);
      const initialBounds = canvas.getBoundingClientRect();
      const initialRenderBounds = sceneBounds(this.#scene.renderPositions);
      this.#initialFrameCenter = initialRenderBounds.center;
      this.#initialFrameHalfExtents = initialRenderBounds.halfExtents;
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
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.enableVertexAttribArray(inputs.uv);
      gl.vertexAttribPointer(inputs.uv, 2, gl.FLOAT, false, 8, 0);
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
            this.#camera.frameBox(this.#initialFrameCenter, this.#initialFrameHalfExtents, aspect);
            this.#awaitingInitialLayout = false;
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
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      if (triangleBuffer) gl.deleteBuffer(triangleBuffer);
      if (edgeBuffer) gl.deleteBuffer(edgeBuffer);
      if (vertexArray) gl.deleteVertexArray(vertexArray);
      if (handleProgram) gl.deleteProgram(handleProgram);
      gl.deleteProgram(program);
      throw error;
    }
  }

  setScene(scene: ViewportScene): void {
    const transaction = this.prepareScene(scene);
    try {
      transaction.commit();
      transaction.finalize();
    } catch (error) {
      transaction.dispose();
      throw error;
    }
  }

  cameraState(): CameraState {
    this.#assertActive();
    return this.#camera.state();
  }

  restoreCameraState(state: CameraState): void {
    this.#assertActive();
    this.#camera.restoreState(state);
    this.#notifyViewChange();
  }

  prepareScene(scene: ViewportScene): { commit(): void; dispose(): void; finalize(): void } {
    this.#assertActive();
    const prepared = prepareScene(this.#gl, scene);
    const candidate = this.#createSceneResources(prepared);
    const previous: SceneResources = {
      vertexArray: this.#vertexArray,
      vertexBuffer: this.#vertexBuffer,
      uvBuffer: this.#uvBuffer,
      triangleBuffer: this.#triangleBuffer,
      edgeBuffer: this.#edgeBuffer,
    };
    const previousScene = this.#scene;
    const previousSelectedVertex = this.#selectedVertex;
    let state: "pending" | "committed" | "finished" = "pending";
    return {
      commit: () => {
        if (state !== "pending") return;
        this.invalidate();
        this.#setSceneResources(candidate);
        state = "committed";
        this.#applyPreparedScene(prepared);
      },
      dispose: () => {
        if (state === "finished") return;
        const wasCommitted = state === "committed";
        if (wasCommitted) {
          this.#setSceneResources(previous);
          this.#scene = previousScene;
          this.#selectedVertex = previousSelectedVertex;
        }
        state = "finished";
        this.#deleteSceneResources(candidate);
        if (wasCommitted) {
          try { this.invalidate(); } catch { /* restored state remains authoritative */ }
        }
      },
      finalize: () => {
        if (state !== "committed") return;
        state = "finished";
        this.#deleteSceneResources(previous);
      },
    };
  }

  #uploadTexture(source: TexImageSource): WebGLTexture {
    const gl = this.#gl;
    if (gl.getError() !== gl.NO_ERROR) {
      throw new Error("기존 WebGL 오류 때문에 텍스처를 안전하게 업로드하지 못했습니다.");
    }
    const candidate = gl.createTexture();
    if (!candidate) throw new Error("WebGL 텍스처를 생성하지 못했습니다.");
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, candidate);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const uploadError = gl.getError();
      if (uploadError !== gl.NO_ERROR) {
        throw new Error(`WebGL 텍스처 업로드 오류 (0x${uploadError.toString(16)})`);
      }
      return candidate;
    } catch (error) {
      try { gl.deleteTexture(candidate); } catch { /* preserve the upload failure */ }
      throw error;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  setTexture(textureKey: string, source: TexImageSource): void {
    this.#assertActive();
    if (!textureKey) {
      throw new Error("텍스처 모델 키가 비어 있습니다.");
    }
    const candidate = this.#uploadTexture(source);
    const previous = this.#textures.get(textureKey);
    let next: Map<string, WebGLTexture>;
    try {
      next = new Map(this.#textures);
      next.set(textureKey, candidate);
      this.invalidate();
    } catch (error) {
      try { this.#gl.deleteTexture(candidate); } catch { /* best-effort candidate cleanup */ }
      throw error;
    }
    this.#textures = next;
    if (previous) {
      try { this.#gl.deleteTexture(previous); } catch { /* no-throw prior cleanup after publication */ }
    }
  }

  prepareTextures(entries: readonly {
    readonly textureKey: string;
    readonly source: TexImageSource;
  }[]): { commit(): void; dispose(): void; finalize(): void } {
    this.#assertActive();
    const candidates = new Map<string, WebGLTexture>();
    const previous = this.#textures;
    try {
      for (const entry of entries) {
        if (!entry.textureKey || candidates.has(entry.textureKey)) {
          throw new Error("텍스처 모델 키가 비어 있거나 중복되었습니다.");
        }
        const candidate = this.#uploadTexture(entry.source);
        try {
          candidates.set(entry.textureKey, candidate);
        } catch (error) {
          try { this.#gl.deleteTexture(candidate); } catch { /* preserve insertion failure */ }
          throw error;
        }
      }
    } catch (error) {
      for (const texture of candidates.values()) {
        try { this.#gl.deleteTexture(texture); } catch { /* continue cleaning every candidate */ }
      }
      throw error;
    }
    let state: "pending" | "committed" | "finished" = "pending";
    return {
      commit: () => {
        if (state !== "pending") return;
        this.invalidate();
        this.#textures = candidates;
        state = "committed";
      },
      dispose: () => {
        if (state === "finished") return;
        const shouldInvalidate = state === "committed";
        if (shouldInvalidate) {
          this.#textures = previous;
        }
        state = "finished";
        for (const texture of candidates.values()) {
          try {
            this.#gl.deleteTexture(texture);
          } catch {
            // GL cleanup failure must not undo the restored texture-map state.
          }
        }
        if (shouldInvalidate) {
          try {
            this.invalidate();
          } catch {
            // The prior texture map is already restored; a queued repaint is best-effort cleanup.
          }
        }
      },
      finalize: () => {
        if (state !== "committed") return;
        state = "finished";
        for (const texture of previous.values()) {
          try {
            this.#gl.deleteTexture(texture);
          } catch {
            // Prior-resource cleanup must not split an already committed project publication.
          }
        }
      },
    };
  }

  replaceTextures(entries: readonly {
    readonly textureKey: string;
    readonly source: TexImageSource;
  }[]): void {
    const transaction = this.prepareTextures(entries);
    transaction.commit();
    transaction.finalize();
  }

  deleteTexture(textureKey: string): void {
    this.#assertActive();
    const texture = this.#textures.get(textureKey);
    if (!texture) return;
    this.#textures.delete(textureKey);
    this.#gl.deleteTexture(texture);
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

  projectRadius(index: number, modelRadius: number): number | null {
    this.#assertActive();
    if (!Number.isFinite(modelRadius) || modelRadius <= 0) return null;
    const origin = this.projectVertex(index);
    if (!origin) return null;
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const normalizedRadius = modelRadius / this.#scene.renderScale;
    if (!Number.isFinite(normalizedRadius) || normalizedRadius <= 0) return null;
    const offset = index * 3;
    const center = [
      this.#scene.renderPositions[offset]!,
      this.#scene.renderPositions[offset + 1]!,
      this.#scene.renderPositions[offset + 2]!,
    ] as const;
    let radiusPixels = 0;
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          const length = Math.hypot(x, y, z);
          if (length === 0) continue;
          const projected = projectPosition(
            [
              center[0] + x / length * normalizedRadius,
              center[1] + y / length * normalizedRadius,
              center[2] + z / length * normalizedRadius,
            ],
            this.#camera.viewProjection(bounds.width / bounds.height),
            bounds.width,
            bounds.height,
          );
          if (!projected) continue;
          radiusPixels = Math.max(radiusPixels, Math.hypot(
            projected.x + bounds.left - origin.x,
            projected.y + bounds.top - origin.y,
          ));
        }
      }
    }
    return radiusPixels > 0 && Number.isFinite(radiusPixels) ? radiusPixels : null;
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
    for (const texture of this.#textures.values()) this.#gl.deleteTexture(texture);
    this.#textures.clear();
    this.#gl.deleteBuffer(this.#vertexBuffer);
    this.#gl.deleteBuffer(this.#uvBuffer);
    this.#gl.deleteBuffer(this.#triangleBuffer);
    this.#gl.deleteBuffer(this.#edgeBuffer);
    this.#gl.deleteVertexArray(this.#vertexArray);
    if (this.#visibilityDepthTarget) {
      this.#gl.deleteFramebuffer(this.#visibilityDepthTarget.framebuffer);
      this.#gl.deleteTexture(this.#visibilityDepthTarget.texture);
      this.#visibilityDepthTarget = null;
    }
    this.#gl.useProgram(null);
    this.#gl.deleteProgram(this.#handleProgram);
    this.#gl.deleteProgram(this.#program);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Mesh viewport controller has been disposed.");
  }

  #notifyViewChange(): void {
    this.invalidate();
    for (const listener of this.#viewChangeListeners) listener();
  }

  #setSceneResources(resources: SceneResources): void {
    this.#vertexArray = resources.vertexArray;
    this.#vertexBuffer = resources.vertexBuffer;
    this.#uvBuffer = resources.uvBuffer;
    this.#triangleBuffer = resources.triangleBuffer;
    this.#edgeBuffer = resources.edgeBuffer;
  }

  #deleteSceneResources(resources: SceneResources): void {
    const deletions = [
      () => this.#gl.deleteBuffer(resources.vertexBuffer),
      () => this.#gl.deleteBuffer(resources.uvBuffer),
      () => this.#gl.deleteBuffer(resources.triangleBuffer),
      () => this.#gl.deleteBuffer(resources.edgeBuffer),
      () => this.#gl.deleteVertexArray(resources.vertexArray),
    ];
    for (const remove of deletions) {
      try { remove(); } catch { /* best-effort GL resource cleanup */ }
    }
  }

  #createSceneResources(scene: PreparedScene): SceneResources {
    const gl = this.#gl;
    if (gl.getError() !== gl.NO_ERROR) {
      throw new Error("기존 WebGL 오류 때문에 메시를 안전하게 업로드하지 못했습니다.");
    }
    const vertexArray = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    const triangleBuffer = gl.createBuffer();
    const edgeBuffer = gl.createBuffer();
    if (!vertexArray || !vertexBuffer || !uvBuffer || !triangleBuffer || !edgeBuffer) {
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      if (triangleBuffer) gl.deleteBuffer(triangleBuffer);
      if (edgeBuffer) gl.deleteBuffer(edgeBuffer);
      if (vertexArray) gl.deleteVertexArray(vertexArray);
      throw new Error("메시 렌더링 버퍼를 생성하지 못했습니다.");
    }
    const resources = { vertexArray, vertexBuffer, uvBuffer, triangleBuffer, edgeBuffer };
    try {
      this.#uploadPreparedScene(resources, scene);
      return resources;
    } catch (error) {
      this.#deleteSceneResources(resources);
      throw error;
    }
  }

  #uploadPreparedScene(resources: SceneResources, scene: PreparedScene): void {
    const gl = this.#gl;
    gl.bindVertexArray(resources.vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.vertexBuffer);
    gl.enableVertexAttribArray(this.#inputs.position);
    gl.vertexAttribPointer(this.#inputs.position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.#inputs.normal);
    gl.vertexAttribPointer(this.#inputs.normal, 3, gl.FLOAT, false, 24, 12);
    gl.bufferData(gl.ARRAY_BUFFER, scene.vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.uvBuffer);
    gl.enableVertexAttribArray(this.#inputs.uv);
    gl.vertexAttribPointer(this.#inputs.uv, 2, gl.FLOAT, false, 8, 0);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      scene.uvs ?? new Float32Array(scene.positions.length / 3 * 2),
      gl.DYNAMIC_DRAW,
    );
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.triangleBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scene.triangleIndices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.edgeBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scene.edgeIndices, gl.DYNAMIC_DRAW);
    const uploadError = gl.getError();
    if (uploadError !== gl.NO_ERROR) {
      throw new Error(`WebGL 메시 업로드 오류 (0x${uploadError.toString(16)})`);
    }
  }

  #applyPreparedScene(scene: PreparedScene): void {
    this.#scene = scene;
    if (this.#selectedVertex !== null && this.#selectedVertex >= scene.positions.length / 3) {
      this.#selectedVertex = null;
    }
  }

  #uploadScene(): void {
    this.#uploadPreparedScene({
      vertexArray: this.#vertexArray,
      vertexBuffer: this.#vertexBuffer,
      uvBuffer: this.#uvBuffer,
      triangleBuffer: this.#triangleBuffer,
      edgeBuffer: this.#edgeBuffer,
    }, this.#scene);
  }

  #ensureVisibilityDepthTarget(width: number, height: number): VisibilityDepthTarget {
    const current = this.#visibilityDepthTarget;
    if (current?.width === width && current.height === height) return current;
    const gl = this.#gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new Error("정점 가시성 depth target을 생성하지 못했습니다.");
    }
    let published = false;
    try {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("정점 가시성 framebuffer가 완전하지 않습니다.");
      }
      const allocationError = gl.getError();
      if (allocationError !== gl.NO_ERROR) {
        throw new Error(`정점 가시성 depth target 오류 (0x${allocationError.toString(16)})`);
      }
      const candidate = { texture, framebuffer, width, height };
      this.#visibilityDepthTarget = candidate;
      published = true;
      if (current) {
        try { gl.deleteFramebuffer(current.framebuffer); } catch { /* candidate remains authoritative */ }
        try { gl.deleteTexture(current.texture); } catch { /* candidate remains authoritative */ }
      }
      return candidate;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      if (!published) {
        try { gl.deleteFramebuffer(framebuffer); } catch { /* preserve allocation failure */ }
        try { gl.deleteTexture(texture); } catch { /* preserve allocation failure */ }
      }
    }
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
    const viewProjection = this.#camera.viewProjection(width / height);

    try {
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.depthRange(0, 1);
      gl.enable(gl.CULL_FACE);

      let visibilityTarget: VisibilityDepthTarget | null = null;
      if (this.#scene.editable) {
        visibilityTarget = this.#ensureVisibilityDepthTarget(width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, visibilityTarget.framebuffer);
        gl.viewport(0, 0, width, height);
        gl.colorMask(false, false, false, false);
        try {
          gl.clear(gl.DEPTH_BUFFER_BIT);
          gl.useProgram(this.#program);
          gl.bindVertexArray(this.#vertexArray);
          gl.uniformMatrix4fv(this.#inputs.viewProjection, false, viewProjection);
          this.#setStyle(this.#scene.color, 1);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#triangleBuffer);
          gl.drawElements(gl.TRIANGLES, this.#scene.triangleIndices.length, this.#scene.indexType, 0);
        } finally {
          gl.colorMask(true, true, true, true);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, width, height);
        }
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.#program);
      gl.bindVertexArray(this.#vertexArray);
      gl.uniformMatrix4fv(this.#inputs.viewProjection, false, viewProjection);

      const texture = this.#scene.uvs && this.#scene.textureKey
        ? this.#textures.get(this.#scene.textureKey)
        : undefined;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture ?? null);
      gl.uniform1i(this.#inputs.texture, 0);
      this.#setStyle(this.#scene.color, 1, Boolean(texture));
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#triangleBuffer);
      gl.drawElements(gl.TRIANGLES, this.#scene.triangleIndices.length, this.#scene.indexType, 0);

      if (!this.#scene.editable || !visibilityTarget) return;
      gl.disable(gl.CULL_FACE);
      gl.depthFunc(gl.LEQUAL);
      this.#setStyle(EDGE_COLOR, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#edgeBuffer);
      gl.drawElements(gl.LINES, this.#scene.edgeIndices.length, this.#scene.indexType, 0);

      gl.useProgram(this.#handleProgram);
      gl.uniformMatrix4fv(this.#handleInputs.viewProjection, false, viewProjection);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, visibilityTarget.texture);
      gl.uniform1i(this.#handleInputs.meshDepth, 1);
      gl.depthMask(false);
      gl.depthRange(0, 0);
      gl.uniform3fv(this.#handleInputs.color, VERTEX_COLOR);
      gl.uniform1f(this.#handleInputs.pointSize, 5 * devicePixelRatio);
      gl.drawArrays(gl.POINTS, 0, this.#scene.positions.length / 3);
      if (this.#selectedVertex !== null) {
        gl.uniform3fv(this.#handleInputs.color, SELECTED_VERTEX_COLOR);
        gl.uniform1f(this.#handleInputs.pointSize, 8 * devicePixelRatio);
        gl.drawArrays(gl.POINTS, this.#selectedVertex, 1);
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.depthRange(0, 1);
      gl.depthFunc(gl.LESS);
      gl.enable(gl.CULL_FACE);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.useProgram(null);
    }
  }

  #setStyle(
    color: readonly [number, number, number],
    lighting: number,
    useTexture = false,
  ): void {
    const gl = this.#gl;
    gl.uniform3fv(this.#inputs.color, color);
    gl.uniform1f(this.#inputs.lighting, lighting);
    gl.uniform1f(this.#inputs.useTexture, useTexture ? 1 : 0);
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
