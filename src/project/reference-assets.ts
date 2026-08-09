import type {
  Mat4,
  ReferenceAssetRef,
  ReferenceAssetService,
  TriangleMeshSnapshot,
  Vec3,
} from "@octopoly/contracts";
import { MAX_RETAINED_ASSET_BYTES } from "./image-assets";
import type { ProjectStorage } from "./storage";

interface StoredReference {
  readonly geometry: TriangleMeshSnapshot;
}

export interface ReferenceAssetServiceOptions {
  readonly maximumRetainedBytes?: number;
  readonly createId?: () => string;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `reference-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function finiteVec3(value: Vec3, label: string): Vec3 {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError(`${label} must be finite`);
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function cloneGeometry(value: TriangleMeshSnapshot): TriangleMeshSnapshot {
  if (!Number.isSafeInteger(value.version) || value.version < 0) throw new TypeError("Reference geometry version is invalid");
  const positions = value.positions.map((position, index) => finiteVec3(position, `position ${index}`));
  const indices = [...value.indices];
  if (positions.length === 0 || indices.length === 0 || indices.length % 3 !== 0) throw new TypeError("Reference geometry must contain triangles");
  for (const index of indices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= positions.length) throw new RangeError("Reference geometry index is out of range");
  }
  if (value.normals === undefined) {
    return Object.freeze({ version: value.version, positions: Object.freeze(positions), indices: Object.freeze(indices) });
  }
  if (value.normals.length !== positions.length) throw new TypeError("Reference normal count must match position count");
  const normals = value.normals.map((normal, index) => finiteVec3(normal, `normal ${index}`));
  return Object.freeze({
    version: value.version,
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    indices: Object.freeze(indices),
  });
}

function cloneMatrix(value: Mat4): Mat4 {
  if (value.elements.length !== 16 || !value.elements.every(Number.isFinite)) throw new TypeError("worldTransform must contain 16 finite values");
  return Object.freeze({ elements: Object.freeze([...value.elements]) });
}

function geometryBytes(geometry: TriangleMeshSnapshot): number {
  return geometry.positions.length * 3 * 8 + (geometry.normals?.length ?? 0) * 3 * 8 + geometry.indices.length * 8;
}

export class IndexedDbReferenceAssetService implements ReferenceAssetService {
  readonly #maximumRetainedBytes: number;
  readonly #createId: () => string;
  readonly #cache = new Map<string, TriangleMeshSnapshot>();
  readonly #lifetime = new AbortController();
  #disposed = false;

  constructor(
    private readonly storage: ProjectStorage,
    options: ReferenceAssetServiceOptions = {},
  ) {
    this.#maximumRetainedBytes = options.maximumRetainedBytes ?? MAX_RETAINED_ASSET_BYTES;
    this.#createId = options.createId ?? randomId;
    if (!Number.isSafeInteger(this.#maximumRetainedBytes) || this.#maximumRetainedBytes <= 0) {
      throw new RangeError("maximumRetainedBytes must be a positive safe integer");
    }
  }

  async create(geometry: TriangleMeshSnapshot, worldTransform: Mat4): Promise<ReferenceAssetRef> {
    this.#assertUsable();
    const copy = cloneGeometry(geometry);
    this.#assertBudget(geometryBytes(copy));
    const transform = cloneMatrix(worldTransform);
    const id = this.#createId();
    if (id.length === 0 || this.#cache.has(id)) throw new TypeError("Reference id factory returned an invalid or duplicate id");
    if (await this.storage.get<StoredReference>("references", id, this.#lifetime.signal) !== undefined) {
      throw new TypeError("Reference id factory returned an id that already exists in durable storage");
    }
    this.#assertUsable();
    await this.storage.transact([{ kind: "put", store: "references", key: id, value: { geometry: copy } satisfies StoredReference }], this.#lifetime.signal);
    this.#assertUsable();
    this.#cache.set(id, copy);
    return Object.freeze({ id, worldTransform: transform });
  }

  async resolve(ref: ReferenceAssetRef): Promise<TriangleMeshSnapshot> {
    this.#assertUsable();
    if (ref.id.length === 0) throw new TypeError("Reference id must not be empty");
    cloneMatrix(ref.worldTransform);
    const cached = this.#cache.get(ref.id);
    if (cached) return cached;
    const stored = await this.storage.get<StoredReference>("references", ref.id, this.#lifetime.signal);
    this.#assertUsable();
    if (!stored) throw new Error(`Reference asset ${ref.id} is missing`);
    const geometry = cloneGeometry(stored.geometry);
    this.#assertBudget(geometryBytes(geometry));
    this.#cache.set(ref.id, geometry);
    return geometry;
  }

  async remove(id: string): Promise<void> {
    this.#assertUsable();
    if (id.length === 0) throw new TypeError("Reference id must not be empty");
    await this.storage.transact([{ kind: "delete", store: "references", key: id }], this.#lifetime.signal);
    this.#assertUsable();
    this.#cache.delete(id);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifetime.abort();
    this.#cache.clear();
  }

  #assertBudget(additional: number): void {
    let retained = 0;
    for (const geometry of this.#cache.values()) retained += geometryBytes(geometry);
    if (retained + additional > this.#maximumRetainedBytes) throw new RangeError("Reference asset budget exceeded");
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Reference asset service is disposed");
  }
}
