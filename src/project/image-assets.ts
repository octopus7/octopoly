import {
  incrementNonNegativeSafeInteger,
  type ImageAssetEvent,
  type ImageAssetRef,
  type ImageAssetService,
  type ImageEditSession,
  type ImageMutationResult,
  type ImageRect,
  type ImageRevisionChange,
  type ImageTileUpdate,
  type Unsubscribe,
} from "@octopoly/contracts";
import {
  browserImagePixelCodec,
  type DecodedImagePixels,
  type ImagePixelCodec,
} from "./image-codec";
import type { ProjectStorage, ProjectStoreMutation } from "./storage";

export const MAX_RETAINED_ASSET_BYTES = 768 * 1024 * 1024;

interface ImageRevisionRecord extends DecodedImagePixels {
  readonly ref: ImageAssetRef;
}

interface StoredImageMeta {
  readonly revisions: ReadonlyArray<number>;
}

interface ImageState {
  current: ImageAssetRef;
  nextRevision: number;
  readonly revisions: Map<number, ImageRevisionRecord>;
  readonly retained: Map<number, number>;
  editing: boolean;
}

export interface ImageAssetServiceOptions {
  readonly initialRefs?: ReadonlyArray<ImageAssetRef>;
  readonly codec?: ImagePixelCodec;
  readonly maximumRetainedBytes?: number;
  readonly createId?: () => string;
}

function imageKey(id: string, revision: number): string {
  return `revision:${id}:${revision}`;
}

function metaKey(id: string): string {
  return `meta:${id}`;
}

function cloneRef(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({ ...ref });
}

function sameRef(first: ImageAssetRef, second: ImageAssetRef): boolean {
  return first.id === second.id && first.revision === second.revision
    && first.width === second.width && first.height === second.height && first.colorSpace === second.colorSpace;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateRef(ref: ImageAssetRef): ImageAssetRef {
  if (ref.id.length === 0 || !Number.isSafeInteger(ref.revision) || ref.revision < 0
    || !Number.isSafeInteger(ref.width) || ref.width <= 0
    || !Number.isSafeInteger(ref.height) || ref.height <= 0
    || (ref.colorSpace !== "srgb" && ref.colorSpace !== "linear")) {
    throw new TypeError("Invalid image asset reference");
  }
  return cloneRef(ref);
}

export class IndexedDbImageAssetService implements ImageAssetService {
  readonly #codec: ImagePixelCodec;
  readonly #maximumRetainedBytes: number;
  readonly #createId: () => string;
  readonly #states = new Map<string, ImageState>();
  readonly #listeners = new Set<(event: ImageAssetEvent) => void>();
  readonly #lifetime = new AbortController();
  #disposed = false;

  constructor(
    private readonly storage: ProjectStorage,
    options: ImageAssetServiceOptions = {},
  ) {
    this.#codec = options.codec ?? browserImagePixelCodec;
    this.#maximumRetainedBytes = options.maximumRetainedBytes ?? MAX_RETAINED_ASSET_BYTES;
    this.#createId = options.createId ?? randomId;
    if (!Number.isSafeInteger(this.#maximumRetainedBytes) || this.#maximumRetainedBytes <= 0) {
      throw new RangeError("maximumRetainedBytes must be a positive safe integer");
    }
    for (const candidate of options.initialRefs ?? []) {
      const ref = validateRef(candidate);
      if (this.#states.has(ref.id)) throw new TypeError(`Duplicate image asset id ${ref.id}`);
      this.#states.set(ref.id, {
        current: ref,
        nextRevision: ref.revision,
        revisions: new Map(),
        retained: new Map(),
        editing: false,
      });
    }
  }

  async import(source: Blob): Promise<ImageAssetRef> {
    this.#assertUsable();
    const decoded = await this.#codec.decode(source);
    this.#assertUsable();
    this.#validatePixels(decoded);
    this.#assertBudget(decoded.rgba8Premultiplied.byteLength);
    const id = this.#createId();
    if (id.length === 0 || this.#states.has(id)) throw new TypeError("Image id factory returned an invalid or duplicate id");
    if (await this.storage.get<StoredImageMeta>("images", metaKey(id), this.#lifetime.signal) !== undefined) {
      throw new TypeError("Image id factory returned an id that already exists in durable storage");
    }
    this.#assertUsable();
    const ref = Object.freeze({ id, revision: 0, width: decoded.width, height: decoded.height, colorSpace: "srgb" as const });
    const record: ImageRevisionRecord = {
      ref,
      width: decoded.width,
      height: decoded.height,
      rgba8Premultiplied: new Uint8ClampedArray(decoded.rgba8Premultiplied),
    };
    this.#states.set(id, {
      current: ref,
      nextRevision: 0,
      revisions: new Map([[0, record]]),
      retained: new Map(),
      editing: false,
    });
    return ref;
  }

  current(id: string): ImageAssetRef | null {
    this.#assertUsable();
    return this.#states.get(id)?.current ?? null;
  }

  async resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    this.#assertUsable();
    const record = await this.#load(ref);
    const bitmap = await this.#codec.createBitmap({
      width: record.width,
      height: record.height,
      rgba8Premultiplied: new Uint8ClampedArray(record.rgba8Premultiplied),
    });
    if (this.#disposed) {
      bitmap.close();
      throw new Error("Image asset service is disposed");
    }
    return bitmap;
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  }

  async prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    this.#assertUsable();
    const state = this.#states.get(ref.id);
    if (!state || !sameRef(state.current, ref)) throw new Error("Image reference is stale or missing");
    if (state.editing) throw new Error("Image asset already has an active edit session");
    await this.#load(ref);
    this.#assertUsable();
    state.editing = true;
    return new SynchronousImageEditSession(this, state, ref);
  }

  async remove(id: string): Promise<void> {
    this.#assertUsable();
    const state = this.#states.get(id);
    if (!state) return;
    if (state.editing) throw new Error("Cannot remove an image with an active edit session");
    const meta = await this.storage.get<StoredImageMeta>("images", metaKey(id), this.#lifetime.signal);
    this.#assertUsable();
    const revisions = new Set(meta?.revisions ?? []);
    for (const revision of state.revisions.keys()) revisions.add(revision);
    const mutations: ProjectStoreMutation[] = [
      ...[...revisions].map((revision): ProjectStoreMutation => ({ kind: "delete", store: "images", key: imageKey(id, revision) })),
      { kind: "delete", store: "images", key: metaKey(id) },
    ];
    await this.storage.transact(mutations, this.#lifetime.signal);
    this.#assertUsable();
    this.#states.delete(id);
    this.#notify({ kind: "removed", id });
  }

  async flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void> {
    this.#assertUsable();
    const requested = refs ?? [...this.#states.values()].map((state) => state.current);
    const byAsset = new Map<string, Set<number>>();
    for (const candidate of requested) {
      const state = this.#states.get(candidate.id);
      if (!state) throw new Error(`Image asset ${candidate.id} is missing`);
      await this.#load(candidate);
      const revisions = byAsset.get(candidate.id) ?? new Set<number>();
      revisions.add(candidate.revision);
      byAsset.set(candidate.id, revisions);
    }
    this.#assertUsable();
    const mutations: ProjectStoreMutation[] = [];
    for (const [id, revisions] of byAsset) {
      const state = this.#states.get(id)!;
      const previousMeta = await this.storage.get<StoredImageMeta>("images", metaKey(id), this.#lifetime.signal);
      this.#assertUsable();
      const allRevisions = new Set(previousMeta?.revisions ?? []);
      for (const revision of revisions) {
        const record = state.revisions.get(revision);
        if (!record) throw new Error(`Image revision ${id}@${revision} is not loaded`);
        allRevisions.add(revision);
        mutations.push({ kind: "put", store: "images", key: imageKey(id, revision), value: record });
      }
      mutations.push({ kind: "put", store: "images", key: metaKey(id), value: { revisions: [...allRevisions].sort((a, b) => a - b) } satisfies StoredImageMeta });
    }
    await this.storage.transact(mutations, this.#lifetime.signal);
    this.#assertUsable();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifetime.abort();
    this.#listeners.clear();
    this.#states.clear();
  }

  write(state: ImageState, base: ImageAssetRef, update: ImageTileUpdate): ImageAssetRef {
    this.#assertEditing(state, base);
    const x = this.#dimension(update.x, "update.x", true);
    const y = this.#dimension(update.y, "update.y", true);
    const width = this.#dimension(update.width, "update.width", false);
    const height = this.#dimension(update.height, "update.height", false);
    if (x + width > state.current.width || y + height > state.current.height) throw new RangeError("Image update is out of bounds");
    if (update.rgba8Premultiplied.byteLength !== width * height * 4) throw new RangeError("Image update byte length does not match its rectangle");
    const previous = state.revisions.get(state.current.revision);
    if (!previous) throw new Error("Current image revision is not loaded");
    this.#assertBudget(previous.rgba8Premultiplied.byteLength);
    const pixels = new Uint8ClampedArray(previous.rgba8Premultiplied);
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = row * width * 4;
      const targetOffset = ((y + row) * state.current.width + x) * 4;
      pixels.set(update.rgba8Premultiplied.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
    }
    const oldTransient = state.current.revision === base.revision ? undefined : state.current.revision;
    const revision = incrementNonNegativeSafeInteger(state.nextRevision, "image revision");
    state.nextRevision = revision;
    const ref = Object.freeze({ ...state.current, revision });
    state.revisions.set(revision, { ref, width: ref.width, height: ref.height, rgba8Premultiplied: pixels });
    state.current = ref;
    if (oldTransient !== undefined && !state.retained.has(oldTransient)) state.revisions.delete(oldTransient);
    this.#notify({ kind: "updated", ref, dirty: [Object.freeze({ x, y, width, height })] });
    return ref;
  }

  commit(state: ImageState, base: ImageAssetRef, label: string): ImageMutationResult {
    this.#assertEditing(state, base);
    if (label.length === 0) throw new TypeError("Image edit label must not be empty");
    if (state.current.revision === base.revision) throw new Error("Cannot commit an image edit with no writes");
    const after = state.current;
    state.editing = false;
    this.#retain(state, base.revision);
    this.#retain(state, after.revision);
    const change = new ImageRevisionChangeImpl(this, state, label, base, after);
    return Object.freeze({ change, ref: after });
  }

  cancel(state: ImageState, base: ImageAssetRef): void {
    if (!state.editing) return;
    const discarded = state.current;
    state.current = base;
    state.editing = false;
    if (discarded.revision !== base.revision && !state.retained.has(discarded.revision)) state.revisions.delete(discarded.revision);
    if (discarded.revision !== base.revision) this.#notify({ kind: "updated", ref: base, dirty: [this.#fullRect(base)] });
  }

  transition(state: ImageState, expected: ImageAssetRef, target: ImageAssetRef): void {
    this.#assertUsable();
    if (state.editing) throw new Error("Cannot apply history during an active image edit");
    if (!sameRef(state.current, expected)) throw new Error("Image revision change is out of sequence");
    if (!state.revisions.has(target.revision)) throw new Error("Retained image revision is missing");
    state.current = target;
    this.#notify({ kind: "updated", ref: target, dirty: [this.#fullRect(target)] });
  }

  release(state: ImageState, revision: number): void {
    const count = state.retained.get(revision);
    if (count === undefined) return;
    if (count > 1) state.retained.set(revision, count - 1);
    else {
      state.retained.delete(revision);
      if (state.current.revision !== revision) state.revisions.delete(revision);
    }
  }

  async #load(ref: ImageAssetRef): Promise<ImageRevisionRecord> {
    const canonical = validateRef(ref);
    const state = this.#states.get(canonical.id);
    if (!state) throw new Error(`Image asset ${canonical.id} is missing`);
    const loaded = state.revisions.get(canonical.revision);
    if (loaded) {
      if (!sameRef(loaded.ref, canonical)) throw new Error("Image reference metadata does not match stored revision");
      return loaded;
    }
    const stored = await this.storage.get<ImageRevisionRecord>("images", imageKey(canonical.id, canonical.revision), this.#lifetime.signal);
    this.#assertUsable();
    if (!stored || !sameRef(stored.ref, canonical)) throw new Error(`Image revision ${canonical.id}@${canonical.revision} is unavailable`);
    this.#validatePixels(stored);
    this.#assertBudget(stored.rgba8Premultiplied.byteLength);
    const record = { ...stored, ref: canonical, rgba8Premultiplied: new Uint8ClampedArray(stored.rgba8Premultiplied) };
    state.revisions.set(canonical.revision, record);
    state.nextRevision = Math.max(state.nextRevision, canonical.revision);
    return record;
  }

  #validatePixels(image: DecodedImagePixels): void {
    if (!Number.isSafeInteger(image.width) || image.width <= 0 || !Number.isSafeInteger(image.height) || image.height <= 0
      || image.rgba8Premultiplied.byteLength !== image.width * image.height * 4) {
      throw new TypeError("Decoded image pixels are invalid");
    }
  }

  #assertBudget(additionalBytes: number): void {
    let retained = 0;
    for (const state of this.#states.values()) {
      for (const record of state.revisions.values()) retained += record.rgba8Premultiplied.byteLength;
    }
    if (retained + additionalBytes > this.#maximumRetainedBytes) throw new RangeError("Decoded image asset budget exceeded");
  }

  #dimension(value: number, label: string, allowZero: boolean): number {
    if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) throw new RangeError(`${label} is invalid`);
    return value;
  }

  #assertEditing(state: ImageState, base: ImageAssetRef): void {
    this.#assertUsable();
    if (!state.editing || !this.#states.has(base.id)) throw new Error("Image edit session is no longer active");
  }

  #retain(state: ImageState, revision: number): void {
    state.retained.set(revision, (state.retained.get(revision) ?? 0) + 1);
  }

  #fullRect(ref: ImageAssetRef): ImageRect {
    return Object.freeze({ x: 0, y: 0, width: ref.width, height: ref.height });
  }

  #notify(event: ImageAssetEvent): void {
    if (this.#disposed) return;
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // Subscriber failures must not turn an already-applied revision transition into a partial mutation.
      }
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Image asset service is disposed");
  }
}

class SynchronousImageEditSession implements ImageEditSession {
  #active = true;

  constructor(
    private readonly service: IndexedDbImageAssetService,
    private readonly state: ImageState,
    readonly base: ImageAssetRef,
  ) {}

  current(): ImageAssetRef {
    this.#assertActive();
    return this.state.current;
  }

  write(update: ImageTileUpdate): ImageAssetRef {
    this.#assertActive();
    return this.service.write(this.state, this.base, update);
  }

  commit(label: string): ImageMutationResult {
    this.#assertActive();
    const result = this.service.commit(this.state, this.base, label);
    this.#active = false;
    return result;
  }

  cancel(): void {
    if (!this.#active) return;
    this.service.cancel(this.state, this.base);
    this.#active = false;
  }

  dispose(): void {
    this.cancel();
  }

  #assertActive(): void {
    if (!this.#active) throw new Error("Image edit session is closed");
  }
}

class ImageRevisionChangeImpl implements ImageRevisionChange {
  readonly id: string;
  readonly assetId: string;
  #disposed = false;

  constructor(
    private readonly service: IndexedDbImageAssetService,
    private readonly state: ImageState,
    readonly label: string,
    readonly before: ImageAssetRef,
    readonly after: ImageAssetRef,
  ) {
    this.id = `image:${before.id}:${before.revision}->${after.revision}`;
    this.assetId = before.id;
  }

  apply(): void {
    this.#assertUsable();
    this.service.transition(this.state, this.before, this.after);
  }

  revert(): void {
    this.#assertUsable();
    this.service.transition(this.state, this.after, this.before);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.service.release(this.state, this.before.revision);
    this.service.release(this.state, this.after.revision);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Image revision change is disposed");
  }
}
