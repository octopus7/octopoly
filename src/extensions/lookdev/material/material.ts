import type {
  ImageAssetRef,
  MaterialId,
  Vec3,
} from "@octopoly/contracts";

export const DEFAULT_LOOKDEV_MATERIAL_ID: MaterialId = "lookdev.default";

const DEFAULT_BASE_COLOR = Object.freeze<Vec3>({ x: 0.8, y: 0.8, z: 0.8 });
const DEFAULT_EMISSIVE = Object.freeze<Vec3>({ x: 0, y: 0, z: 0 });
const EMPTY_TEXTURES = Object.freeze<LookdevTextureSlots>({});

export interface LookdevTextureSlots {
  readonly baseColor?: ImageAssetRef;
  readonly metallic?: ImageAssetRef;
  readonly roughness?: ImageAssetRef;
  readonly normal?: ImageAssetRef;
  readonly emissive?: ImageAssetRef;
  readonly opacity?: ImageAssetRef;
}

export interface LookdevMaterialInput {
  readonly id?: MaterialId;
  readonly baseColor?: Vec3;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly normalScale?: number;
  readonly emissive?: Vec3;
  readonly opacity?: number;
  readonly textures?: LookdevTextureSlots;
}

/**
 * A normalized CPU-side material value that can be consumed directly when
 * constructing a ShadingProvider uniform record.
 */
export interface LookdevMaterial {
  readonly id: MaterialId;
  readonly baseColor: Vec3;
  readonly metallic: number;
  readonly roughness: number;
  readonly normalScale: number;
  readonly emissive: Vec3;
  readonly opacity: number;
  readonly textures: LookdevTextureSlots;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteOr(value, fallback)));
}

function normalizeVec3(
  value: Vec3 | undefined,
  fallback: Vec3,
  minimum: number,
  maximum: number,
): Vec3 {
  return Object.freeze({
    x: clamp(value?.x, fallback.x, minimum, maximum),
    y: clamp(value?.y, fallback.y, minimum, maximum),
    z: clamp(value?.z, fallback.z, minimum, maximum),
  });
}

function normalizeMaterialId(value: MaterialId | undefined): MaterialId {
  return typeof value === "string" && value.length > 0
    ? value
    : DEFAULT_LOOKDEV_MATERIAL_ID;
}

function normalizeImageRef(value: ImageAssetRef | undefined): ImageAssetRef | undefined {
  if (value === undefined || value === null || typeof value !== "object") return undefined;
  if (typeof value.id !== "string" || value.id.length === 0) return undefined;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return undefined;
  if (!Number.isSafeInteger(value.width) || value.width <= 0) return undefined;
  if (!Number.isSafeInteger(value.height) || value.height <= 0) return undefined;
  if (value.colorSpace !== "srgb" && value.colorSpace !== "linear") return undefined;

  return Object.freeze({
    id: value.id,
    revision: value.revision,
    width: value.width,
    height: value.height,
    colorSpace: value.colorSpace,
  });
}

function normalizeTextures(value: LookdevTextureSlots | undefined): LookdevTextureSlots {
  if (value === undefined || value === null || typeof value !== "object") return EMPTY_TEXTURES;

  const textures: {
    baseColor?: ImageAssetRef;
    metallic?: ImageAssetRef;
    roughness?: ImageAssetRef;
    normal?: ImageAssetRef;
    emissive?: ImageAssetRef;
    opacity?: ImageAssetRef;
  } = {};

  const baseColor = normalizeImageRef(value.baseColor);
  const metallic = normalizeImageRef(value.metallic);
  const roughness = normalizeImageRef(value.roughness);
  const normal = normalizeImageRef(value.normal);
  const emissive = normalizeImageRef(value.emissive);
  const opacity = normalizeImageRef(value.opacity);

  if (baseColor !== undefined) textures.baseColor = baseColor;
  if (metallic !== undefined) textures.metallic = metallic;
  if (roughness !== undefined) textures.roughness = roughness;
  if (normal !== undefined) textures.normal = normal;
  if (emissive !== undefined) textures.emissive = emissive;
  if (opacity !== undefined) textures.opacity = opacity;

  return Object.freeze(textures);
}

export function createLookdevMaterial(input: LookdevMaterialInput = {}): LookdevMaterial {
  return Object.freeze({
    id: normalizeMaterialId(input.id),
    baseColor: normalizeVec3(input.baseColor, DEFAULT_BASE_COLOR, 0, 1),
    metallic: clamp(input.metallic, 0, 0, 1),
    roughness: clamp(input.roughness, 0.5, 0.04, 1),
    normalScale: clamp(input.normalScale, 1, 0, 2),
    emissive: normalizeVec3(input.emissive, DEFAULT_EMISSIVE, 0, 64),
    opacity: clamp(input.opacity, 1, 0, 1),
    textures: normalizeTextures(input.textures),
  });
}

const DEFAULT_LOOKDEV_MATERIAL = createLookdevMaterial();

/** Stores only immutable, normalized material snapshots. */
export class LookdevMaterialStore {
  readonly #materials = new Map<MaterialId, LookdevMaterial>();

  constructor(initial: ReadonlyArray<LookdevMaterialInput> = []) {
    for (const material of initial) this.set(material);
  }

  set(input: LookdevMaterialInput): LookdevMaterial {
    const material = createLookdevMaterial(input);
    this.#materials.set(material.id, material);
    return material;
  }

  get(id: MaterialId): LookdevMaterial | null {
    return this.#materials.get(id) ?? null;
  }

  snapshot(id?: MaterialId): LookdevMaterial {
    if (id !== undefined) {
      const material = this.#materials.get(id);
      if (material !== undefined) return material;
    }
    return this.#materials.get(DEFAULT_LOOKDEV_MATERIAL_ID) ?? DEFAULT_LOOKDEV_MATERIAL;
  }

  list(): ReadonlyArray<LookdevMaterial> {
    return Object.freeze([...this.#materials.values()]);
  }

  remove(id: MaterialId): boolean {
    return this.#materials.delete(id);
  }

  clear(): void {
    this.#materials.clear();
  }
}
