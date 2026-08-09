import type {
  ImageAssetRef,
  Mat4,
  RendererCapabilities,
  ShadingFrameInput,
  ShadingProgramDescriptor,
  ShadingProvider,
  UniformValue,
} from "@octopoly/contracts";

export const MATCAP_SHADING_PROVIDER_ID = "octopoly.matcap.shading";

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 uViewMatrix;
uniform mat4 uViewProjectionMatrix;

out vec3 vViewNormal;

void main() {
  vViewNormal = normalize(mat3(uViewMatrix) * normal);
  gl_Position = uViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vViewNormal;

uniform sampler2D uMatcapImage;

out vec4 outColor;

void main() {
  float normalLengthSquared = dot(vViewNormal, vViewNormal);
  vec3 viewNormal = normalLengthSquared > 0.0
    ? vViewNormal * inversesqrt(normalLengthSquared)
    : vec3(0.0, 0.0, 1.0);
  vec2 matcapUv = viewNormal.xy * vec2(0.5, -0.5) + vec2(0.5);
  outColor = texture(uMatcapImage, clamp(matcapUv, vec2(0.0), vec2(1.0)));
}`;

const MATCAP_ATTRIBUTES = Object.freeze([
  Object.freeze({ shaderName: "position", source: "position" as const }),
  Object.freeze({ shaderName: "normal", source: "normal" as const }),
]);

const MATCAP_PROGRAM: ShadingProgramDescriptor = Object.freeze({
  language: "glsl-es-300",
  vertexShader: VERTEX_SHADER,
  fragmentShader: FRAGMENT_SHADER,
  attributes: MATCAP_ATTRIBUTES,
});

/**
 * Contract-only MatCap provider. Image decode, GPU upload and context restore stay
 * owned by the renderer's injected ImageAssetResolver.
 */
export class WebGL2MatcapShadingProvider implements ShadingProvider {
  readonly id = MATCAP_SHADING_PROVIDER_ID;
  readonly label = "MatCap";

  #image: ImageAssetRef;
  #disposed = false;

  constructor(initialImage: ImageAssetRef) {
    this.#image = immutableImageRef(initialImage);
  }

  setImage(ref: ImageAssetRef): void {
    this.#assertReady("setImage");
    this.#image = immutableImageRef(ref);
  }

  image(): ImageAssetRef {
    this.#assertReady("image");
    return this.#image;
  }

  supports(capabilities: RendererCapabilities): boolean {
    if (this.#disposed || capabilities.backend !== "webgl2") {
      return false;
    }
    if (
      !isPositiveFinite(capabilities.maxTextureSize) ||
      !isNonNegativeFinite(capabilities.applicationTextureBudgetBytes) ||
      !isNonNegativeFinite(capabilities.applicationGpuBudgetBytes)
    ) {
      return false;
    }

    const imageBytes = rgba8ByteLength(this.#image);
    return (
      this.#image.width <= capabilities.maxTextureSize &&
      this.#image.height <= capabilities.maxTextureSize &&
      imageBytes <= capabilities.applicationTextureBudgetBytes &&
      imageBytes <= capabilities.applicationGpuBudgetBytes
    );
  }

  program(): ShadingProgramDescriptor {
    this.#assertReady("program");
    return MATCAP_PROGRAM;
  }

  uniforms(input: ShadingFrameInput): Readonly<Record<string, UniformValue>> {
    this.#assertReady("uniforms");
    assertFiniteMat4(input.scene.camera.view, "camera view");
    assertFiniteMat4(input.scene.camera.viewProjection, "camera view-projection");

    return Object.freeze({
      uViewMatrix: input.scene.camera.view,
      uViewProjectionMatrix: input.scene.camera.viewProjection,
      uMatcapImage: this.#image,
    });
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
  }

  #assertReady(operation: string): void {
    if (this.#disposed) {
      throw new Error(`MatCap provider is disposed; cannot ${operation}`);
    }
  }
}

function immutableImageRef(ref: ImageAssetRef): ImageAssetRef {
  if (typeof ref.id !== "string" || ref.id.trim().length === 0) {
    throw new Error("MatCap image id must be a non-empty string");
  }
  assertNonNegativeSafeInteger(ref.revision, "MatCap image revision");
  assertPositiveSafeInteger(ref.width, "MatCap image width");
  assertPositiveSafeInteger(ref.height, "MatCap image height");
  if (ref.colorSpace !== "srgb" && ref.colorSpace !== "linear") {
    throw new Error("MatCap image color space must be 'srgb' or 'linear'");
  }
  rgba8ByteLength(ref);
  return Object.freeze({
    id: ref.id,
    revision: ref.revision,
    width: ref.width,
    height: ref.height,
    colorSpace: ref.colorSpace,
  });
}

function rgba8ByteLength(ref: Pick<ImageAssetRef, "width" | "height">): number {
  const pixels = ref.width * ref.height;
  const bytes = pixels * 4;
  if (!Number.isSafeInteger(pixels) || !Number.isSafeInteger(bytes)) {
    throw new Error("MatCap image RGBA8 byte length exceeds the safe integer range");
  }
  return bytes;
}

function assertFiniteMat4(value: Mat4, label: string): void {
  if (
    value.elements.length !== 16 ||
    value.elements.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`MatCap ${label} uniform must contain 16 finite values`);
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
