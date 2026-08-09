import type {
  ImageAssetRef,
  Mat4,
  RendererCapabilities,
  ShadingFrameInput,
  ShadingProgramDescriptor,
  ShadingProvider,
  UniformValue,
  Vec3,
  Vec4,
} from "@octopoly/contracts";

import type { LookdevMaterial, LookdevMaterialStore } from "../../material";
import { supportsLookdevQuality } from "./budget";
import { LOOKDEV_QUALITY_PROGRAM } from "./shaders";

export const LOOKDEV_QUALITY_PROVIDER_ID = "octopoly.lookdev.quality";

const IDENTITY_MATRIX: Mat4 = Object.freeze({
  elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
});

const CAMERA_POSITION: Vec3 = Object.freeze({ x: 0, y: 0, z: 5 });
const BASE_COLOR: Vec4 = Object.freeze({ x: 0.8, y: 0.8, z: 0.8, w: 1 });
const EMISSIVE: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const ENVIRONMENT_UPPER: Vec3 = Object.freeze({ x: 0.7, y: 0.8, z: 1 });
const ENVIRONMENT_LOWER: Vec3 = Object.freeze({ x: 0.055, y: 0.06, z: 0.075 });
const KEY_DIRECTION: Vec3 = Object.freeze({ x: 0.4, y: -0.82, z: -0.42 });
const KEY_COLOR: Vec3 = Object.freeze({ x: 1, y: 0.94, z: 0.86 });
const FILL_DIRECTION: Vec3 = Object.freeze({ x: -0.75, y: -0.35, z: -0.4 });
const FILL_COLOR: Vec3 = Object.freeze({ x: 0.55, y: 0.68, z: 1 });
const RIM_DIRECTION: Vec3 = Object.freeze({ x: 0.2, y: 0.25, z: 0.94 });
const RIM_COLOR: Vec3 = Object.freeze({ x: 0.76, y: 0.86, z: 1 });

export class WebGL2QualityShadingProvider implements ShadingProvider {
  readonly id = LOOKDEV_QUALITY_PROVIDER_ID;
  readonly label = "Quality PBR";

  constructor(readonly materials: LookdevMaterialStore) {}

  supports(capabilities: RendererCapabilities): boolean {
    return supportsLookdevQuality(capabilities);
  }

  program(): ShadingProgramDescriptor {
    return LOOKDEV_QUALITY_PROGRAM;
  }

  uniforms(input: ShadingFrameInput): Readonly<Record<string, UniformValue>> {
    const material = this.materials.snapshot(input.material);
    const uniforms: Record<string, UniformValue> = {
      uViewProjection: finiteMatrix(input.scene.camera.viewProjection, IDENTITY_MATRIX),
      uCameraPosition: finiteVec3(input.scene.camera.position, CAMERA_POSITION),
      uBaseColor: finiteBaseColor(material),
      uMetallic: finiteRange(material.metallic, 0, 1, 0),
      uRoughness: finiteRange(material.roughness, 0.04, 1, 0.5),
      uNormalScale: finiteRange(material.normalScale, 0, 2, 1),
      uEmissive: finiteVec3(material.emissive, EMISSIVE),
      uOpacity: finiteRange(material.opacity, 0, 1, 1),
      uEnvironmentUpper: ENVIRONMENT_UPPER,
      uEnvironmentLower: ENVIRONMENT_LOWER,
      uEnvironmentIntensity: 0.48,
      uKeyLightDirection: KEY_DIRECTION,
      uKeyLightColor: KEY_COLOR,
      uKeyLightIntensity: 3.4,
      uFillLightDirection: FILL_DIRECTION,
      uFillLightColor: FILL_COLOR,
      uFillLightIntensity: 1.05,
      uRimLightDirection: RIM_DIRECTION,
      uRimLightColor: RIM_COLOR,
      uRimLightIntensity: 0.8,
      uExposure: 1,
      uHasBaseColorMap: mapFlag(material.textures.baseColor),
      uHasMetallicMap: mapFlag(material.textures.metallic),
      uHasRoughnessMap: mapFlag(material.textures.roughness),
      uHasNormalMap: mapFlag(material.textures.normal),
      uHasEmissiveMap: mapFlag(material.textures.emissive),
      uHasOpacityMap: mapFlag(material.textures.opacity),
    };
    addMap(uniforms, "uBaseColorMap", material.textures.baseColor);
    addMap(uniforms, "uMetallicMap", material.textures.metallic);
    addMap(uniforms, "uRoughnessMap", material.textures.roughness);
    addMap(uniforms, "uNormalMap", material.textures.normal);
    addMap(uniforms, "uEmissiveMap", material.textures.emissive);
    addMap(uniforms, "uOpacityMap", material.textures.opacity);
    return Object.freeze(uniforms);
  }

  dispose(): void {
    // Immutable CPU descriptors only; Renderer owns programs, textures, and context recovery.
  }
}

function addMap(
  target: Record<string, UniformValue>,
  name: string,
  ref: ImageAssetRef | undefined,
): void {
  if (ref !== undefined) {
    target[name] = ref;
  }
}

function mapFlag(ref: ImageAssetRef | undefined): number {
  return ref === undefined ? 0 : 1;
}

function finiteBaseColor(material: LookdevMaterial): Vec4 {
  const color = finiteVec3(material.baseColor, BASE_COLOR);
  return Object.freeze({ x: color.x, y: color.y, z: color.z, w: 1 });
}

function finiteVec3(value: Vec3, fallback: Vec3): Vec3 {
  return Object.freeze({
    x: finiteNumber(value.x, fallback.x),
    y: finiteNumber(value.y, fallback.y),
    z: finiteNumber(value.z, fallback.z),
  });
}

function finiteMatrix(value: Mat4, fallback: Mat4): Mat4 {
  if (value.elements.length !== 16 || value.elements.some((entry) => !Number.isFinite(entry))) {
    return fallback;
  }
  return value;
}

function finiteRange(value: number, minimum: number, maximum: number, fallback: number): number {
  const finite = finiteNumber(value, fallback);
  return Math.min(maximum, Math.max(minimum, finite));
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
