import type {
  ExtensionStateContribution,
  ExtensionStateProvider,
  ImageAssetRef,
  JsonValue,
  Vec3,
} from "@octopoly/contracts";

import {
  createLookdevMaterial,
  type LookdevMaterial,
  type LookdevMaterialInput,
  type LookdevMaterialStore,
  type LookdevTextureSlots,
} from "../material";
import type { LookdevPreset } from "./controller";
import { LookdevController } from "./controller";

export const LOOKDEV_STATE_ID = "octopoly.lookdev";
export const LOOKDEV_STATE_SCHEMA_VERSION = 2;

interface DecodedState {
  readonly preset: LookdevPreset;
  readonly materials: ReadonlyArray<LookdevMaterial>;
}

export class LookdevStateProvider implements ExtensionStateProvider {
  readonly id = LOOKDEV_STATE_ID;
  readonly #materials: LookdevMaterialStore;
  readonly #controller: LookdevController;
  readonly #onLoaded: (() => void) | undefined;
  #passthrough: ExtensionStateContribution | undefined;
  #disposed = false;

  constructor(
    materials: LookdevMaterialStore,
    controller: LookdevController,
    onLoaded?: () => void,
  ) {
    this.#materials = materials;
    this.#controller = controller;
    this.#onLoaded = onLoaded;
  }

  load(value: ExtensionStateContribution | undefined): void {
    this.#assertUsable();
    if (value === undefined) {
      this.#passthrough = undefined;
      this.#apply({ preset: "realtime", materials: Object.freeze([]) });
      return;
    }

    const decoded = decodeState(value);
    if (decoded === null) {
      // Preserve unsupported future or malformed state instead of overwriting project data.
      this.#passthrough = value;
      return;
    }

    this.#passthrough = undefined;
    this.#apply(decoded);
  }

  save(): ExtensionStateContribution {
    this.#assertUsable();
    if (this.#passthrough !== undefined) return this.#passthrough;

    const materials = [...this.#materials.list()].sort(compareMaterials);
    const imageAssets = collectImageAssets(materials);
    const data: JsonValue = Object.freeze({
      preset: this.#controller.preset(),
      materials: Object.freeze(materials.map(serializeMaterial)),
    });
    return Object.freeze({
      schemaVersion: LOOKDEV_STATE_SCHEMA_VERSION,
      data,
      imageAssets,
    });
  }

  dispose(): void {
    this.#disposed = true;
  }

  #apply(state: DecodedState): void {
    const beforeMaterials = this.#materials.list();
    const beforePreset = this.#controller.preset();
    try {
      this.#materials.clear();
      for (const material of state.materials) this.#materials.set(material);
      this.#controller.setPreset(state.preset);
      this.#controller.requestRender();
      this.#onLoaded?.();
    } catch (error) {
      this.#materials.clear();
      for (const material of beforeMaterials) this.#materials.set(material);
      this.#controller.setPreset(beforePreset);
      throw error;
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Lookdev state provider is disposed");
  }
}

function decodeState(value: ExtensionStateContribution): DecodedState | null {
  if (
    !Number.isSafeInteger(value.schemaVersion) ||
    value.schemaVersion < 1 ||
    value.schemaVersion > LOOKDEV_STATE_SCHEMA_VERSION ||
    !isObject(value.data)
  ) {
    return null;
  }

  const presetValue = value.schemaVersion === 1
    ? value.data.activePreset ?? value.data.preset
    : value.data.preset;
  const preset = presetValue === "quality" || presetValue === "realtime"
    ? presetValue
    : "realtime";
  const rawMaterials = Array.isArray(value.data.materials)
    ? value.data.materials
    : value.schemaVersion === 1 && value.data.material !== undefined
      ? [value.data.material]
      : [];
  const materials: LookdevMaterial[] = [];
  for (const rawMaterial of rawMaterials) {
    const material = parseMaterial(rawMaterial);
    if (material !== null) materials.push(material);
  }
  materials.sort(compareMaterials);
  return Object.freeze({ preset, materials: Object.freeze(materials) });
}

function parseMaterial(value: JsonValue): LookdevMaterial | null {
  if (!isObject(value) || typeof value.id !== "string" || value.id.length === 0) return null;
  const input: {
    id: string;
    baseColor?: Vec3;
    metallic?: number;
    roughness?: number;
    normalScale?: number;
    emissive?: Vec3;
    opacity?: number;
    textures?: LookdevTextureSlots;
  } = { id: value.id };
  const baseColor = parseVec3(value.baseColor);
  const emissive = parseVec3(value.emissive);
  const metallic = finiteNumber(value.metallic);
  const roughness = finiteNumber(value.roughness);
  const normalScale = finiteNumber(value.normalScale);
  const opacity = finiteNumber(value.opacity);
  const textures = parseTextures(value.textures);
  if (baseColor !== undefined) input.baseColor = baseColor;
  if (emissive !== undefined) input.emissive = emissive;
  if (metallic !== undefined) input.metallic = metallic;
  if (roughness !== undefined) input.roughness = roughness;
  if (normalScale !== undefined) input.normalScale = normalScale;
  if (opacity !== undefined) input.opacity = opacity;
  if (textures !== undefined) input.textures = textures;
  return createLookdevMaterial(input satisfies LookdevMaterialInput);
}

function parseTextures(value: JsonValue | undefined): LookdevTextureSlots | undefined {
  if (!isObject(value)) return undefined;
  const textures: {
    baseColor?: ImageAssetRef;
    metallic?: ImageAssetRef;
    roughness?: ImageAssetRef;
    normal?: ImageAssetRef;
    emissive?: ImageAssetRef;
    opacity?: ImageAssetRef;
  } = {};
  for (const key of TEXTURE_KEYS) {
    const ref = parseImageRef(value[key]);
    if (ref !== undefined) textures[key] = ref;
  }
  return Object.freeze(textures);
}

function parseImageRef(value: JsonValue | undefined): ImageAssetRef | undefined {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !nonNegativeSafeInteger(value.revision) ||
    !positiveSafeInteger(value.width) ||
    !positiveSafeInteger(value.height) ||
    (value.colorSpace !== "srgb" && value.colorSpace !== "linear")
  ) {
    return undefined;
  }
  return Object.freeze({
    id: value.id,
    revision: value.revision,
    width: value.width,
    height: value.height,
    colorSpace: value.colorSpace,
  });
}

function serializeMaterial(material: LookdevMaterial): JsonValue {
  const textures: Record<string, JsonValue> = {};
  for (const key of TEXTURE_KEYS) {
    const ref = material.textures[key];
    if (ref !== undefined) textures[key] = serializeImageRef(ref);
  }
  return Object.freeze({
    id: material.id,
    baseColor: serializeVec3(material.baseColor),
    metallic: material.metallic,
    roughness: material.roughness,
    normalScale: material.normalScale,
    emissive: serializeVec3(material.emissive),
    opacity: material.opacity,
    textures: Object.freeze(textures),
  });
}

function serializeImageRef(ref: ImageAssetRef): JsonValue {
  return Object.freeze({
    id: ref.id,
    revision: ref.revision,
    width: ref.width,
    height: ref.height,
    colorSpace: ref.colorSpace,
  });
}

function serializeVec3(value: Vec3): JsonValue {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function collectImageAssets(materials: ReadonlyArray<LookdevMaterial>): ReadonlyArray<ImageAssetRef> {
  const refs = new Map<string, ImageAssetRef>();
  for (const material of materials) {
    for (const key of TEXTURE_KEYS) {
      const ref = material.textures[key];
      if (ref === undefined) continue;
      const revisionKey = `${ref.id}\u0000${ref.revision}`;
      const existing = refs.get(revisionKey);
      if (existing !== undefined && !sameImageRef(existing, ref)) {
        throw new Error(`Conflicting metadata for image asset "${ref.id}" revision ${ref.revision}`);
      }
      refs.set(revisionKey, ref);
    }
  }
  return Object.freeze([...refs.values()].sort(compareImageRefs));
}

function sameImageRef(first: ImageAssetRef, second: ImageAssetRef): boolean {
  return (
    first.id === second.id &&
    first.revision === second.revision &&
    first.width === second.width &&
    first.height === second.height &&
    first.colorSpace === second.colorSpace
  );
}

function compareMaterials(first: LookdevMaterial, second: LookdevMaterial): number {
  return compareStrings(first.id, second.id);
}

function compareImageRefs(first: ImageAssetRef, second: ImageAssetRef): number {
  return compareStrings(first.id, second.id) || first.revision - second.revision;
}

function compareStrings(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function parseVec3(value: JsonValue | undefined): Vec3 | undefined {
  if (!isObject(value)) return undefined;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  return x === undefined || y === undefined || z === undefined
    ? undefined
    : Object.freeze({ x, y, z });
}

function finiteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeSafeInteger(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveSafeInteger(value: JsonValue | undefined): value is number {
  return nonNegativeSafeInteger(value) && value > 0;
}

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const TEXTURE_KEYS = Object.freeze([
  "baseColor",
  "metallic",
  "roughness",
  "normal",
  "emissive",
  "opacity",
] as const);
