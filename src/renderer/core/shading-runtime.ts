import type {
  AttributeValue,
  ImageAssetRef,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangulationService,
  RenderSceneSnapshot,
  RendererCapabilities,
  ShadingCandidateFailure,
  ShadingProgramDescriptor,
  ShadingProvider,
  UniformValue,
} from "@octopoly/contracts";

import { WebGL2RenderExtensionRegistry } from "./extension-registry";
import { WebGlImageTextureCache } from "./image-texture-cache";

interface CachedProgram {
  readonly fingerprint: string;
  readonly program: WebGLProgram;
}

interface CachedGeometry {
  readonly fingerprint: string;
  readonly meshVersion: number;
  readonly vertexArray: WebGLVertexArrayObject;
  readonly buffers: ReadonlyArray<WebGLBuffer>;
  readonly vertexCount: number;
}

export class WebGlShadingRuntime {
  readonly #registry: WebGL2RenderExtensionRegistry;
  readonly #images: WebGlImageTextureCache;
  readonly #triangulation: MeshTriangulationService | undefined;
  readonly #programs = new Map<string, CachedProgram>();
  readonly #geometry = new Map<string, CachedGeometry>();
  #gl: WebGL2RenderingContext | null;
  #disposed = false;

  constructor(
    gl: WebGL2RenderingContext,
    registry: WebGL2RenderExtensionRegistry,
    images: WebGlImageTextureCache,
    triangulation?: MeshTriangulationService,
  ) {
    this.#gl = gl;
    this.#registry = registry;
    this.#images = images;
    this.#triangulation = triangulation;
  }

  renderFrame(scene: RenderSceneSnapshot, capabilities: RendererCapabilities): boolean {
    this.#assertReady();
    const snapshot = this.#registry.evaluateActive(
      (provider) => this.#evaluateProvider(provider, scene, capabilities),
    );
    return snapshot.effectiveProviderId !== null;
  }

  invalidateContext(): void {
    if (this.#disposed) {
      return;
    }
    this.#programs.clear();
    this.#geometry.clear();
    this.#gl = null;
  }

  restoreContext(gl: WebGL2RenderingContext): void {
    if (this.#disposed) {
      throw new Error("Shading runtime is disposed");
    }
    this.#programs.clear();
    this.#geometry.clear();
    this.#gl = gl;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const gl = this.#gl;
    if (gl !== null) {
      for (const cached of this.#programs.values()) {
        try {
          gl.deleteProgram(cached.program);
        } catch {
          // Continue releasing the remaining independently compiled programs.
        }
      }
      for (const geometry of this.#geometry.values()) {
        disposeGeometry(gl, geometry);
      }
    }
    this.#programs.clear();
    this.#geometry.clear();
    this.#gl = null;
  }

  #evaluateProvider(
    provider: ShadingProvider,
    scene: RenderSceneSnapshot,
    capabilities: RendererCapabilities,
  ): ShadingCandidateFailure | null {
    let supported: boolean;
    try {
      supported = provider.supports(capabilities);
    } catch (error) {
      return rejected(provider.id, "unsupported", `supports() failed: ${reasonFrom(error)}`);
    }
    if (!supported) {
      return rejected(provider.id, "unsupported", "Provider does not support WebGL2 capabilities");
    }

    let descriptor: ShadingProgramDescriptor;
    try {
      descriptor = provider.program();
    } catch (error) {
      return rejected(provider.id, "compile-failed", `program() failed: ${reasonFrom(error)}`);
    }
    if (descriptor.language !== "glsl-es-300") {
      return rejected(provider.id, "unsupported", `Shader language '${descriptor.language}' is not supported by WebGL2`);
    }

    for (const attribute of descriptor.attributes ?? []) {
      if (attribute.source !== "meshAttribute") {
        continue;
      }
      if (attribute.key === undefined) {
        return rejected(provider.id, "unsupported", `meshAttribute '${attribute.shaderName}' has no key`);
      }
      if (!scene.retopo.attributes.has(attribute.key)) {
        return rejected(
          provider.id,
          "unsupported",
          `Mesh attribute '${attribute.key.domain}:${attribute.key.name}' is unavailable`,
        );
      }
    }

    let program: WebGLProgram;
    try {
      program = this.#programFor(provider.id, descriptor);
    } catch (error) {
      return rejected(provider.id, "compile-failed", reasonFrom(error));
    }

    let uniforms: Readonly<Record<string, UniformValue>>;
    try {
      uniforms = provider.uniforms({ scene });
    } catch (error) {
      return rejected(provider.id, "uniforms-failed", reasonFrom(error));
    }

    try {
      const imageFailure = bindUniforms(this.#requireGl(), program, uniforms, this.#images);
      if (imageFailure !== null) {
        return rejected(provider.id, "image-unavailable", imageFailure);
      }
    } catch (error) {
      return rejected(provider.id, "uniforms-failed", reasonFrom(error));
    }

    if (this.#triangulation === undefined) {
      return rejected(
        provider.id,
        "unsupported",
        "MeshTriangulationService is required to execute a shading provider",
      );
    }
    try {
      const geometry = this.#geometryFor(provider.id, program, descriptor, scene.retopo);
      const gl = this.#requireGl();
      gl.useProgram(program);
      gl.bindVertexArray(geometry.vertexArray);
      try {
        gl.drawArrays(gl.TRIANGLES, 0, geometry.vertexCount);
      } finally {
        gl.bindVertexArray(null);
      }
    } catch (error) {
      return rejected(provider.id, "unsupported", reasonFrom(error));
    }
    return null;
  }

  #programFor(providerId: string, descriptor: ShadingProgramDescriptor): WebGLProgram {
    const gl = this.#requireGl();
    const fingerprint = descriptorFingerprint(descriptor);
    const cached = this.#programs.get(providerId);
    if (cached?.fingerprint === fingerprint) {
      return cached.program;
    }
    if (cached !== undefined) {
      gl.deleteProgram(cached.program);
      this.#programs.delete(providerId);
    }

    const program = compileProgram(gl, descriptor);
    this.#programs.set(providerId, { fingerprint, program });
    return program;
  }

  #geometryFor(
    providerId: string,
    program: WebGLProgram,
    descriptor: ShadingProgramDescriptor,
    mesh: MeshSnapshot,
  ): CachedGeometry {
    const gl = this.#requireGl();
    const fingerprint = geometryFingerprint(descriptor);
    const cached = this.#geometry.get(providerId);
    if (
      cached !== undefined &&
      cached.fingerprint === fingerprint &&
      cached.meshVersion === mesh.version
    ) {
      return cached;
    }
    if (cached !== undefined) {
      disposeGeometry(gl, cached);
      this.#geometry.delete(providerId);
    }

    const triangles = this.#triangulation?.triangles(mesh);
    if (triangles === undefined) {
      throw new Error("MeshTriangulationService is unavailable");
    }
    const geometry = createGeometry(gl, program, descriptor, mesh, triangles, fingerprint);
    this.#geometry.set(providerId, geometry);
    return geometry;
  }

  #requireGl(): WebGL2RenderingContext {
    this.#assertReady();
    return this.#gl as WebGL2RenderingContext;
  }

  #assertReady(): void {
    if (this.#disposed) {
      throw new Error("Shading runtime is disposed");
    }
    if (this.#gl === null) {
      throw new Error("Shading runtime has no WebGL2 context");
    }
  }
}

function compileProgram(
  gl: WebGL2RenderingContext,
  descriptor: ShadingProgramDescriptor,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, applyDefines(descriptor.vertexShader, descriptor.defines));
  let fragment: WebGLShader;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, applyDefines(descriptor.fragmentShader, descriptor.defines));
  } catch (error) {
    gl.deleteShader(vertex);
    throw error;
  }

  const program = gl.createProgram();
  if (program === null) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("WebGL2 program allocation failed");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const info = gl.getProgramInfoLog(program) ?? "Unknown WebGL2 link failure";
  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!linked) {
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("WebGL2 shader allocation failed");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown WebGL2 shader compile failure";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function bindUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  uniforms: Readonly<Record<string, UniformValue>>,
  images: WebGlImageTextureCache,
): string | null {
  gl.useProgram(program);
  let textureUnit = 0;

  for (const [name, value] of Object.entries(uniforms)) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) {
      continue;
    }
    if (isImageAssetRef(value)) {
      const lookup = images.use(value);
      if (lookup.status === "pending") {
        return `Image '${value.id}' revision ${value.revision} is resolving`;
      }
      if (lookup.status === "unavailable") {
        return lookup.reason;
      }
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, lookup.texture);
      gl.uniform1i(location, textureUnit);
      textureUnit += 1;
      continue;
    }
    if (typeof value === "number") {
      gl.uniform1f(location, value);
      continue;
    }
    if (isNumberArray(value)) {
      bindNumericArray(gl, location, value);
      continue;
    }
    if ("elements" in value) {
      if (value.elements.length !== 16) {
        throw new Error(`Uniform '${name}' matrix must contain 16 values`);
      }
      gl.uniformMatrix4fv(location, false, value.elements);
      continue;
    }
    if ("w" in value) {
      gl.uniform4f(location, value.x, value.y, value.z, value.w);
      continue;
    }
    if ("z" in value) {
      gl.uniform3f(location, value.x, value.y, value.z);
      continue;
    }
    gl.uniform2f(location, value.x, value.y);
  }
  return null;
}

function bindNumericArray(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  values: ReadonlyArray<number>,
): void {
  switch (values.length) {
    case 1:
      gl.uniform1fv(location, values);
      return;
    case 2:
      gl.uniform2fv(location, values);
      return;
    case 3:
      gl.uniform3fv(location, values);
      return;
    case 4:
      gl.uniform4fv(location, values);
      return;
    case 16:
      gl.uniformMatrix4fv(location, false, values);
      return;
    default:
      gl.uniform1fv(location, values);
  }
}

function createGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  descriptor: ShadingProgramDescriptor,
  mesh: MeshSnapshot,
  triangles: ReadonlyArray<MeshTriangle>,
  fingerprint: string,
): CachedGeometry {
  const vertexArray = gl.createVertexArray();
  if (vertexArray === null) {
    throw new Error("WebGL2 vertex array allocation failed");
  }
  const buffers: WebGLBuffer[] = [];
  const vertexCount = triangles.length * 3;

  try {
    gl.bindVertexArray(vertexArray);
    const shaderNames = new Set<string>();
    for (const attribute of descriptor.attributes ?? []) {
      if (shaderNames.has(attribute.shaderName)) {
        throw new Error(`Duplicate shader attribute '${attribute.shaderName}'`);
      }
      shaderNames.add(attribute.shaderName);
      const location = gl.getAttribLocation(program, attribute.shaderName);
      if (location < 0) {
        continue;
      }

      const expanded = expandAttribute(attribute, mesh, triangles);
      const buffer = gl.createBuffer();
      if (buffer === null) {
        throw new Error(`WebGL2 buffer allocation failed for '${attribute.shaderName}'`);
      }
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(expanded.values), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, expanded.components, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  } catch (error) {
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
    for (const buffer of buffers) {
      gl.deleteBuffer(buffer);
    }
    gl.deleteVertexArray(vertexArray);
    throw error;
  }

  return {
    fingerprint,
    meshVersion: mesh.version,
    vertexArray,
    buffers: Object.freeze(buffers),
    vertexCount,
  };
}

function expandAttribute(
  attribute: NonNullable<ShadingProgramDescriptor["attributes"]>[number],
  mesh: MeshSnapshot,
  triangles: ReadonlyArray<MeshTriangle>,
): { readonly values: ReadonlyArray<number>; readonly components: number } {
  if (attribute.source === "position") {
    return {
      values: triangles.flatMap((triangle) => triangle.positions.flatMap(vector3Values)),
      components: 3,
    };
  }
  if (attribute.source === "normal") {
    const values: number[] = [];
    for (const triangle of triangles) {
      const normal = triangleNormal(triangle);
      values.push(...normal, ...normal, ...normal);
    }
    return { values, components: 3 };
  }

  const key = attribute.key;
  if (key === undefined) {
    throw new Error(`meshAttribute '${attribute.shaderName}' has no key`);
  }
  const values: number[] = [];
  let components: number | null = null;
  for (const triangle of triangles) {
    for (let cornerIndex = 0; cornerIndex < 3; cornerIndex += 1) {
      const elementId = key.domain === "vertex"
        ? triangle.vertices[cornerIndex]
        : key.domain === "corner"
          ? triangle.corners[cornerIndex]
          : triangle.face;
      if (elementId === undefined) {
        throw new Error(`Triangle is missing ${key.domain} mapping for '${key.name}'`);
      }
      const value = mesh.attributes.get(key, elementId);
      if (value === undefined) {
        throw new Error(`Mesh attribute '${key.domain}:${key.name}' is missing element ${elementId}`);
      }
      const numeric = numericAttribute(value, key.domain, key.name);
      if (components === null) {
        components = numeric.length;
      } else if (components !== numeric.length) {
        throw new Error(`Mesh attribute '${key.domain}:${key.name}' has inconsistent component counts`);
      }
      values.push(...numeric);
    }
  }
  return { values, components: components ?? 1 };
}

function numericAttribute(
  value: AttributeValue,
  domain: string,
  name: string,
): ReadonlyArray<number> {
  let values: ReadonlyArray<number>;
  if (typeof value === "number") {
    values = [value];
  } else if (typeof value === "boolean") {
    values = [value ? 1 : 0];
  } else if (typeof value === "string") {
    throw new Error(`Mesh attribute '${domain}:${name}' is not numeric`);
  } else if (isAttributeNumberArray(value)) {
    values = value;
  } else if ("w" in value) {
    values = [value.x, value.y, value.z, value.w];
  } else if ("z" in value) {
    values = [value.x, value.y, value.z];
  } else {
    values = [value.x, value.y];
  }
  if (values.length < 1 || values.length > 4 || values.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`Mesh attribute '${domain}:${name}' must contain 1 to 4 finite numeric components`);
  }
  return values;
}

function triangleNormal(triangle: MeshTriangle): readonly [number, number, number] {
  const [a, b, c] = triangle.positions;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error(`Triangulation returned a degenerate triangle for face ${triangle.face}`);
  }
  return [x / length, y / length, z / length];
}

function vector3Values(value: { readonly x: number; readonly y: number; readonly z: number }): number[] {
  return [value.x, value.y, value.z];
}

function disposeGeometry(gl: WebGL2RenderingContext, geometry: CachedGeometry): void {
  for (const buffer of geometry.buffers) {
    try {
      gl.deleteBuffer(buffer);
    } catch {
      // Continue releasing the remaining geometry resources.
    }
  }
  try {
    gl.deleteVertexArray(geometry.vertexArray);
  } catch {
    // Context teardown continues even if the driver rejects this handle.
  }
}

function descriptorFingerprint(descriptor: ShadingProgramDescriptor): string {
  const defines = Object.entries(descriptor.defines ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([
    descriptor.language,
    descriptor.vertexShader,
    descriptor.fragmentShader,
    defines,
  ]);
}

function geometryFingerprint(descriptor: ShadingProgramDescriptor): string {
  return JSON.stringify([
    descriptorFingerprint(descriptor),
    (descriptor.attributes ?? []).map((attribute) => [
      attribute.shaderName,
      attribute.source,
      attribute.key?.domain ?? null,
      attribute.key?.name ?? null,
    ]),
  ]);
}

function applyDefines(
  source: string,
  defines: ShadingProgramDescriptor["defines"],
): string {
  const lines = Object.entries(defines ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `#define ${name} ${value === true ? 1 : value === false ? 0 : value}`);
  if (lines.length === 0) {
    return source;
  }
  if (source.startsWith("#version")) {
    const newline = source.indexOf("\n");
    if (newline >= 0) {
      return `${source.slice(0, newline + 1)}${lines.join("\n")}\n${source.slice(newline + 1)}`;
    }
  }
  return `${lines.join("\n")}\n${source}`;
}

function isImageAssetRef(value: UniformValue): value is ImageAssetRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "revision" in value &&
    "width" in value &&
    "height" in value &&
    "colorSpace" in value
  );
}

function isNumberArray(value: UniformValue): value is ReadonlyArray<number> {
  return Array.isArray(value);
}

function isAttributeNumberArray(value: AttributeValue): value is ReadonlyArray<number> {
  return Array.isArray(value);
}

function rejected(
  providerId: string,
  code: ShadingCandidateFailure["code"],
  reason: string,
): ShadingCandidateFailure {
  return Object.freeze({ providerId, code, reason });
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
