import type {
  AttributeKey,
  AttributeValue,
  ImageAssetRef,
  RendererCapabilities,
  ShadingFrameInput,
  ShadingProgramDescriptor,
  ShadingProvider,
  UniformValue,
} from "@octopoly/contracts";

import { UV0_ATTRIBUTE_KEY } from "../target";

export const TEXTURE_PREVIEW_PROVIDER_ID = "texture-paint.preview";

const PROGRAM: ShadingProgramDescriptor = Object.freeze({
  language: "glsl-es-300",
  vertexShader: `#version 300 es
precision highp float;
in vec3 aPosition;
in vec2 aTextureUv;
uniform mat4 uViewProjection;
out vec2 vTextureUv;
void main() {
  vTextureUv = aTextureUv;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}`,
  fragmentShader: `#version 300 es
precision highp float;
uniform sampler2D uPaintTexture;
in vec2 vTextureUv;
out vec4 outColor;
void main() {
  outColor = texture(uPaintTexture, vec2(vTextureUv.x, 1.0 - vTextureUv.y));
}`,
  attributes: Object.freeze([
    Object.freeze({ shaderName: "aPosition", source: "position" as const }),
    Object.freeze({
      shaderName: "aTextureUv",
      source: "meshAttribute" as const,
      key: UV0_ATTRIBUTE_KEY as AttributeKey<AttributeValue>,
    }),
  ]),
});

export class TexturePreviewShadingProvider implements ShadingProvider {
  readonly id = TEXTURE_PREVIEW_PROVIDER_ID;
  readonly label = "Texture Paint Preview";
  readonly #activeImage: () => ImageAssetRef | null;
  #disposed = false;

  constructor(activeImage: () => ImageAssetRef | null) {
    this.#activeImage = activeImage;
  }

  supports(capabilities: RendererCapabilities): boolean {
    this.#assertUsable();
    const image = this.#activeImage();
    if (capabilities.backend !== "webgl2" || image === null) {
      return false;
    }
    const bytes = image.width * image.height * 4;
    return image.width <= capabilities.maxTextureSize
      && image.height <= capabilities.maxTextureSize
      && Number.isSafeInteger(bytes)
      && bytes <= capabilities.applicationTextureBudgetBytes;
  }

  program(): ShadingProgramDescriptor {
    this.#assertUsable();
    return PROGRAM;
  }

  uniforms(input: ShadingFrameInput): Readonly<Record<string, UniformValue>> {
    this.#assertUsable();
    const image = this.#activeImage();
    if (image === null) {
      throw new Error("Texture paint preview image is unavailable");
    }
    return Object.freeze({
      uViewProjection: input.scene.camera.viewProjection,
      uPaintTexture: image,
    });
  }

  dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Texture preview shading provider is disposed");
    }
  }
}
