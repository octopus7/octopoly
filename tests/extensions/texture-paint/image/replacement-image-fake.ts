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

import type { TextureImagePixelDecoder } from "../../../../src/extensions/texture-paint/image";

interface PixelBitmap extends ImageBitmap {
  readonly premultipliedPixels: Uint8ClampedArray;
}

function key(ref: ImageAssetRef): string { return `${ref.id}\u0000${ref.revision}`; }
function same(a: ImageAssetRef | null, b: ImageAssetRef): boolean {
  return a !== null && a.id === b.id && a.revision === b.revision;
}
function cloneRef(ref: ImageAssetRef): ImageAssetRef { return Object.freeze({ ...ref }); }

export class FakePremultipliedPixelDecoder implements TextureImagePixelDecoder {
  async decode(bitmap: ImageBitmap): Promise<Uint8ClampedArray> {
    return new Uint8ClampedArray((bitmap as PixelBitmap).premultipliedPixels);
  }
}

class StrictRevisionChange implements ImageRevisionChange {
  readonly id: string;
  readonly label: string;
  readonly assetId: string;
  readonly before: ImageAssetRef;
  readonly after: ImageAssetRef;
  readonly #service: ReplacementImageAssetService;
  #disposed = false;

  constructor(
    service: ReplacementImageAssetService,
    label: string,
    before: ImageAssetRef,
    after: ImageAssetRef,
  ) {
    this.#service = service;
    this.id = `strict:${before.revision}->${after.revision}`;
    this.label = label;
    this.assetId = before.id;
    this.before = before;
    this.after = after;
  }
  apply(): void { this.#assert(); this.#service.transition(this.before, this.after); }
  revert(): void { this.#assert(); this.#service.transition(this.after, this.before); }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#service.disposedChanges += 1;
  }
  #assert(): void { if (this.#disposed) throw new Error("strict change disposed"); }
}

class StrictEditSession implements ImageEditSession {
  readonly base: ImageAssetRef;
  readonly #service: ReplacementImageAssetService;
  #current: ImageAssetRef;
  #closed = false;
  #wrote = false;

  constructor(service: ReplacementImageAssetService, base: ImageAssetRef) {
    this.#service = service;
    this.base = base;
    this.#current = base;
  }
  current(): ImageAssetRef { this.#assertOpen(); return this.#current; }
  write(update: ImageTileUpdate): ImageAssetRef {
    this.#assertOpen();
    this.#current = this.#service.write(this.#current, update);
    this.#wrote = true;
    return this.#current;
  }
  commit(label: string): ImageMutationResult {
    this.#assertOpen();
    if (this.#service.failCommit) throw new Error("strict commit failed");
    if (!this.#wrote) throw new Error("Cannot commit an image edit with no writes");
    this.#closed = true;
    this.#service.close(this);
    const change = new StrictRevisionChange(this.#service, label, this.base, this.#current);
    return Object.freeze({ change, ref: this.#current });
  }
  cancel(): void {
    if (this.#closed) return;
    this.#service.cancel(this.#current, this.base);
    this.#closed = true;
    this.#service.close(this);
  }
  dispose(): void { this.cancel(); }
  #assertOpen(): void { if (this.#closed) throw new Error("strict edit closed"); }
}

export class ReplacementImageAssetService implements ImageAssetService {
  readonly #refs = new Map<string, ImageAssetRef>();
  readonly #pixels = new Map<string, Uint8ClampedArray>();
  readonly #current = new Map<string, ImageAssetRef>();
  readonly #listeners = new Set<(event: ImageAssetEvent) => void>();
  readonly #sessions = new Set<StrictEditSession>();
  readonly updates: ImageTileUpdate[] = [];
  failCommit = false;
  disposedChanges = 0;
  prepareGate: Promise<void> | null = null;
  prepareStarted = 0;
  #nextRevision = 1;
  #disposed = false;

  seed(ref: ImageAssetRef, pixels: Uint8ClampedArray): void {
    this.#refs.set(key(ref), cloneRef(ref));
    this.#pixels.set(key(ref), new Uint8ClampedArray(pixels));
    this.#current.set(ref.id, cloneRef(ref));
    this.#nextRevision = Math.max(this.#nextRevision, ref.revision + 1);
  }
  pixels(ref: ImageAssetRef): Uint8ClampedArray {
    const pixels = this.#pixels.get(key(ref));
    if (pixels === undefined) throw new Error("missing strict pixels");
    return new Uint8ClampedArray(pixels);
  }
  openSessions(): number { return this.#sessions.size; }
  import(): Promise<ImageAssetRef> { return Promise.reject(new Error("not configured")); }
  current(id: string): ImageAssetRef | null { return this.#current.get(id) ?? null; }
  async prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    if (this.#sessions.size > 0) throw new Error("strict image edit lock is already open");
    if (!same(this.current(ref.id), ref)) throw new Error("strict prepare revision is stale");
    this.prepareStarted += 1;
    if (this.prepareGate !== null) await this.prepareGate;
    // Deliberately mirrors current Core semantics: there is no current-ref
    // revalidation after the asynchronous load gate.
    const session = new StrictEditSession(this, ref);
    this.#sessions.add(session);
    return session;
  }
  async remove(id: string): Promise<void> {
    this.#current.delete(id);
    this.#publish({ kind: "removed", id });
  }
  async flush(): Promise<void> {}
  async resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    const pixels = this.pixels(ref);
    return {
      width: ref.width,
      height: ref.height,
      premultipliedPixels: pixels,
      close: () => {},
    } as PixelBitmap;
  }
  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
  write(ref: ImageAssetRef, update: ImageTileUpdate): ImageAssetRef {
    if (!same(this.current(ref.id), ref)) throw new Error("strict write revision is stale");
    const next = cloneRef({ ...ref, revision: this.#nextRevision++ });
    const pixels = this.pixels(ref);
    for (let row = 0; row < update.height; row += 1) {
      const source = row * update.width * 4;
      const target = ((update.y + row) * ref.width + update.x) * 4;
      pixels.set(update.rgba8Premultiplied.subarray(source, source + update.width * 4), target);
    }
    this.#refs.set(key(next), next);
    this.#pixels.set(key(next), pixels);
    this.#current.set(next.id, next);
    this.updates.push(Object.freeze({ ...update, rgba8Premultiplied: new Uint8ClampedArray(update.rgba8Premultiplied) }));
    this.#publish({
      kind: "updated",
      ref: next,
      dirty: Object.freeze([Object.freeze({ x: update.x, y: update.y, width: update.width, height: update.height })]),
    });
    return next;
  }
  cancel(expected: ImageAssetRef, base: ImageAssetRef): void {
    if (!same(this.current(expected.id), expected)) throw new Error("strict cancel would restore a stale base");
    this.#current.set(base.id, base);
    this.#publish({
      kind: "updated",
      ref: base,
      dirty: Object.freeze([Object.freeze({ x: 0, y: 0, width: base.width, height: base.height })]),
    });
  }
  transition(expected: ImageAssetRef, next: ImageAssetRef): void {
    if (this.#sessions.size > 0) throw new Error("strict history transition blocked by edit lock");
    if (!same(this.current(expected.id), expected)) throw new Error("strict transition revision mismatch");
    this.#current.set(next.id, next);
    this.#publish({
      kind: "updated",
      ref: next,
      dirty: Object.freeze([Object.freeze({ x: 0, y: 0, width: next.width, height: next.height })]),
    });
  }
  close(session: StrictEditSession): void { this.#sessions.delete(session); }
  dispose(): void {
    if (this.#disposed) return;
    for (const session of [...this.#sessions]) session.dispose();
    this.#disposed = true;
    this.#sessions.clear();
    this.#listeners.clear();
  }
  #publish(event: ImageAssetEvent): void {
    const immutable = Object.freeze(event);
    for (const listener of [...this.#listeners]) listener(immutable);
  }
}

export function solidPixels(
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set(color, index);
  return pixels;
}

export function pixelAt(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!];
}
