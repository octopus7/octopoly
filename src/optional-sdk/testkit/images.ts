import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  ImageMutationResult,
  ImageRevisionChange,
  ImageTileUpdate,
  Unsubscribe,
} from "@octopoly/contracts";

interface StoredRevision {
  readonly ref: ImageAssetRef;
  readonly bitmap: ImageBitmap;
}

function cloneRef(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({ ...ref });
}

function revisionKey(ref: ImageAssetRef): string {
  return `${ref.id}\u0000${ref.revision}`;
}

function sameRevision(first: ImageAssetRef, second: ImageAssetRef): boolean {
  return first.id === second.id && first.revision === second.revision;
}

function defaultBitmap(ref: ImageAssetRef): ImageBitmap {
  return {
    width: ref.width,
    height: ref.height,
    close: () => {},
  } as unknown as ImageBitmap;
}

class ContractTestImageRevisionChange implements ImageRevisionChange {
  readonly id: string;
  readonly label: string;
  readonly assetId: string;
  readonly before: ImageAssetRef;
  readonly after: ImageAssetRef;
  readonly #service: ContractTestImageAssetService;
  #disposed = false;

  constructor(
    service: ContractTestImageAssetService,
    label: string,
    before: ImageAssetRef,
    after: ImageAssetRef,
  ) {
    this.#service = service;
    this.id = `image:${after.id}:${before.revision}->${after.revision}`;
    this.label = label;
    this.assetId = after.id;
    this.before = before;
    this.after = after;
  }

  apply(): void {
    this.#assertUsable();
    this.#service.transition(this.before, this.after);
  }

  revert(): void {
    this.#assertUsable();
    this.#service.transition(this.after, this.before);
  }

  dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Contract test image revision change is disposed");
  }
}

class ContractTestImageEditSession implements ImageEditSession {
  readonly base: ImageAssetRef;
  readonly #service: ContractTestImageAssetService;
  #current: ImageAssetRef;
  #closed = false;

  constructor(service: ContractTestImageAssetService, base: ImageAssetRef) {
    this.#service = service;
    this.base = base;
    this.#current = base;
  }

  current(): ImageAssetRef {
    this.#assertOpen();
    return this.#current;
  }

  write(update: ImageTileUpdate): ImageAssetRef {
    this.#assertOpen();
    this.#current = this.#service.write(this.#current, update);
    return this.#current;
  }

  commit(label: string): ImageMutationResult {
    this.#assertOpen();
    if (label.trim().length === 0) throw new Error("Image edit label must not be empty");
    this.#closed = true;
    this.#service.closeSession(this);
    const change = new ContractTestImageRevisionChange(
      this.#service,
      label,
      this.base,
      this.#current,
    );
    return Object.freeze({ change, ref: this.#current });
  }

  cancel(): void {
    if (this.#closed) return;
    this.#service.transition(this.#current, this.base);
    this.#closed = true;
    this.#service.closeSession(this);
  }

  dispose(): void {
    this.cancel();
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Contract test image edit session is closed");
  }
}

export interface ContractTestImageAssetOptions {
  readonly importWidth?: number;
  readonly importHeight?: number;
  readonly colorSpace?: "srgb" | "linear";
  readonly bitmapFactory?: (ref: ImageAssetRef) => ImageBitmap;
}

export class ContractTestImageAssetService implements ImageAssetService {
  readonly #revisions = new Map<string, StoredRevision>();
  readonly #current = new Map<string, ImageAssetRef>();
  readonly #listeners = new Set<(event: ImageAssetEvent) => void>();
  readonly #sessions = new Set<ContractTestImageEditSession>();
  readonly #options: Required<Omit<ContractTestImageAssetOptions, "bitmapFactory">>;
  readonly #bitmapFactory: (ref: ImageAssetRef) => ImageBitmap;
  #nextId = 1;
  #disposed = false;
  #lastFlush: ReadonlyArray<ImageAssetRef> = Object.freeze([]);

  constructor(options: ContractTestImageAssetOptions = {}) {
    this.#options = {
      importWidth: options.importWidth ?? 1,
      importHeight: options.importHeight ?? 1,
      colorSpace: options.colorSpace ?? "srgb",
    };
    this.#bitmapFactory = options.bitmapFactory ?? defaultBitmap;
  }

  seed(ref: ImageAssetRef, bitmap: ImageBitmap = this.#bitmapFactory(ref)): ImageAssetRef {
    this.#assertUsable();
    this.#validateRef(ref);
    const immutable = cloneRef(ref);
    this.#revisions.set(revisionKey(immutable), { ref: immutable, bitmap });
    this.#current.set(immutable.id, immutable);
    return immutable;
  }

  async import(_source: Blob): Promise<ImageAssetRef> {
    this.#assertUsable();
    const ref: ImageAssetRef = Object.freeze({
      id: `contract-test-image-${this.#nextId}`,
      revision: 0,
      width: this.#options.importWidth,
      height: this.#options.importHeight,
      colorSpace: this.#options.colorSpace,
    });
    this.#nextId += 1;
    this.seed(ref);
    return ref;
  }

  current(id: string): ImageAssetRef | null {
    this.#assertUsable();
    return this.#current.get(id) ?? null;
  }

  async prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    this.#assertUsable();
    const current = this.#current.get(ref.id);
    if (current === undefined || !sameRevision(current, ref)) {
      throw new Error(`Image asset "${ref.id}" revision ${ref.revision} is not current`);
    }
    const session = new ContractTestImageEditSession(this, current);
    this.#sessions.add(session);
    return session;
  }

  async remove(id: string): Promise<void> {
    this.#assertUsable();
    this.#current.delete(id);
    for (const [key, stored] of [...this.#revisions]) {
      if (stored.ref.id === id) this.#revisions.delete(key);
    }
    this.#publish(Object.freeze({ kind: "removed", id }));
  }

  async flush(refs: ReadonlyArray<ImageAssetRef> = [...this.#current.values()]): Promise<void> {
    this.#assertUsable();
    const flushed: ImageAssetRef[] = [];
    for (const ref of refs) {
      if (!this.#revisions.has(revisionKey(ref))) {
        throw new Error(`Cannot flush missing image asset "${ref.id}" revision ${ref.revision}`);
      }
      flushed.push(cloneRef(ref));
    }
    this.#lastFlush = Object.freeze(flushed);
  }

  lastFlush(): ReadonlyArray<ImageAssetRef> {
    return this.#lastFlush;
  }

  async resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    this.#assertUsable();
    const stored = this.#revisions.get(revisionKey(ref));
    if (stored === undefined) {
      throw new Error(`Unknown image asset "${ref.id}" revision ${ref.revision}`);
    }
    return stored.bitmap;
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  write(ref: ImageAssetRef, update: ImageTileUpdate): ImageAssetRef {
    this.#assertUsable();
    const current = this.#current.get(ref.id);
    if (current === undefined || !sameRevision(current, ref)) {
      throw new Error("Image edit session is stale");
    }
    this.#validateUpdate(ref, update);
    if (ref.revision === Number.MAX_SAFE_INTEGER) {
      throw new Error("Image revision exceeds Number.MAX_SAFE_INTEGER");
    }
    const next = cloneRef({ ...ref, revision: ref.revision + 1 });
    this.#revisions.set(revisionKey(next), { ref: next, bitmap: this.#bitmapFactory(next) });
    this.#current.set(next.id, next);
    this.#publish(Object.freeze({
      kind: "updated",
      ref: next,
      dirty: Object.freeze([Object.freeze({
        x: update.x,
        y: update.y,
        width: update.width,
        height: update.height,
      })]),
    }));
    return next;
  }

  transition(expected: ImageAssetRef, next: ImageAssetRef): void {
    this.#assertUsable();
    const current = this.#current.get(expected.id);
    if (current === undefined || !sameRevision(current, expected)) {
      throw new Error(
        `Image asset "${expected.id}" is not at expected revision ${expected.revision}`,
      );
    }
    if (!this.#revisions.has(revisionKey(next))) {
      throw new Error(`Image asset revision ${next.revision} is not retained`);
    }
    this.#current.set(next.id, next);
    this.#publish(Object.freeze({
      kind: "updated",
      ref: next,
      dirty: Object.freeze([Object.freeze({ x: 0, y: 0, width: next.width, height: next.height })]),
    }));
  }

  closeSession(session: ContractTestImageEditSession): void {
    this.#sessions.delete(session);
  }

  dispose(): void {
    if (this.#disposed) return;
    for (const session of [...this.#sessions].reverse()) {
      session.dispose();
    }
    this.#disposed = true;
    this.#sessions.clear();
    this.#listeners.clear();
    this.#current.clear();
    for (const stored of this.#revisions.values()) {
      stored.bitmap.close();
    }
    this.#revisions.clear();
  }

  #publish(event: ImageAssetEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }

  #validateRef(ref: ImageAssetRef): void {
    if (ref.id.trim().length === 0) throw new Error("Image asset id must not be empty");
    for (const [label, value] of [
      ["revision", ref.revision],
      ["width", ref.width],
      ["height", ref.height],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Image asset ${label} must be a non-negative safe integer`);
      }
    }
  }

  #validateUpdate(ref: ImageAssetRef, update: ImageTileUpdate): void {
    for (const value of [update.x, update.y, update.width, update.height]) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("Image tile coordinates must be non-negative safe integers");
      }
    }
    if (update.x + update.width > ref.width || update.y + update.height > ref.height) {
      throw new Error("Image tile update exceeds image bounds");
    }
    if (update.rgba8Premultiplied.byteLength !== update.width * update.height * 4) {
      throw new Error("Image tile byte length does not match width * height * 4");
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Contract test image asset service is disposed");
  }
}
