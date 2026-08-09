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

import type {
  LookdevMaterial,
  LookdevMaterialStore,
} from "../../material";
import { supportsLookdevRealtime } from "./budget";
import { LOOKDEV_REALTIME_PROGRAM } from "./shaders";

export const LOOKDEV_REALTIME_PROVIDER_ID = "octopoly.lookdev.realtime";

const IDENTITY_MATRIX: Mat4 = Object.freeze({
  elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
});

const CAMERA_POSITION: Vec3 = Object.freeze({ x: 0, y: 0, z: 5 });
const BASE_COLOR: Vec4 = Object.freeze({ x: 0.72, y: 0.72, z: 0.72, w: 1 });
const EMISSIVE: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const ENVIRONMENT_UPPER: Vec3 = Object.freeze({ x: 0.62, y: 0.72, z: 0.9 });
const ENVIRONMENT_LOWER: Vec3 = Object.freeze({ x: 0.08, y: 0.09, z: 0.12 });
const LIGHT_DIRECTION: Vec3 = Object.freeze({ x: 0.45, y: -0.8, z: -0.4 });
const LIGHT_COLOR: Vec3 = Object.freeze({ x: 1, y: 0.96, z: 0.9 });

export class WebGL2PbrShadingProvider implements ShadingProvider {
  readonly id = LOOKDEV_REALTIME_PROVIDER_ID;
  readonly label = "Realtime PBR";

  constructor(readonly materials: LookdevMaterialStore) {}

  supports(capabilities: RendererCapabilities): boolean {
    return supportsLookdevRealtime(capabilities);
  }

  program(): ShadingProgramDescriptor {
    return LOOKDEV_REALTIME_PROGRAM;
  }

  uniforms(input: ShadingFrameInput): Readonly<Record<string, UniformValue>> {
    const material = this.materials.snapshot(input.material);
    const uniforms: Record<string, UniformValue> = {
      uViewProjection: finiteMatrix(input.scene.camera.viewProjection, IDENTITY_MATRIX),
      uCameraPosition: finiteVec3(input.scene.camera.position, CAMERA_POSITION),
      uBaseColor: finiteBaseColor(material),
      uMetallic: finiteUnit(material.metallic, 0),
      uRoughness: finiteRange(material.roughness, 0.045, 1, 0.5),
      uNormalScale: finiteRange(material.normalScale, 0, 2, 1),
      uEmissive: finiteVec3(material.emissive, EMISSIVE),
      uOpacity: finiteUnit(material.opacity, 1),
      uEnvironmentUpper: ENVIRONMENT_UPPER,
      uEnvironmentLower: ENVIRONMENT_LOWER,
      uEnvironmentIntensity: 0.32,
      uLightDirection: LIGHT_DIRECTION,
      uLightColor: LIGHT_COLOR,
      uLightIntensity: 3.1,
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
    // The provider owns immutable CPU descriptors only. Renderer owns every GPU resource.
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

function finiteUnit(value: number, fallback: number): number {
  return finiteRange(value, 0, 1, fallback);
}

function finiteRange(value: number, minimum: number, maximum: number, fallback: number): number {
  const finite = finiteNumber(value, fallback);
  return Math.min(maximum, Math.max(minimum, finite));
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
