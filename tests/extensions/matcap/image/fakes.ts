import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  Unsubscribe,
} from "@octopoly/contracts";

export interface TrackedBitmap extends ImageBitmap {
  readonly closeCount: number;
}

interface MutableTrackedBitmap extends ImageBitmap {
  closeCount: number;
}

export function trackedBitmap(width: number, height: number): TrackedBitmap {
  const bitmap: MutableTrackedBitmap = {
    width,
    height,
    closeCount: 0,
    close(): void {
      this.closeCount += 1;
    },
  } as MutableTrackedBitmap;
  return bitmap;
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

type ImportOutcome = ImageAssetRef | Error;
type ResolveOutcome = ImageBitmap | Error | Promise<ImageBitmap> | (() => ImageBitmap | Promise<ImageBitmap>);

export class ScriptedImageAssetService implements ImageAssetService {
  readonly importedBlobs: Blob[] = [];
  readonly resolvedRefs: ImageAssetRef[] = [];
  readonly removedIds: string[] = [];
  readonly flushedRefs: ReadonlyArray<ImageAssetRef>[] = [];
  readonly #imports: ImportOutcome[] = [];
  readonly #resolves = new Map<string, ResolveOutcome>();
  readonly #current = new Map<string, ImageAssetRef>();
  readonly #listeners = new Set<(event: ImageAssetEvent) => void>();
  #disposed = false;

  queueImport(outcome: ImportOutcome): void {
    this.#imports.push(outcome);
  }

  seed(ref: ImageAssetRef): void {
    this.#current.set(ref.id, ref);
  }

  resolveWith(id: string, outcome: ResolveOutcome): void {
    this.#resolves.set(id, outcome);
  }

  async import(source: Blob): Promise<ImageAssetRef> {
    this.#assertUsable();
    this.importedBlobs.push(source);
    const outcome = this.#imports.shift();
    if (outcome === undefined) throw new Error("No scripted import result");
    if (outcome instanceof Error) throw outcome;
    this.#current.set(outcome.id, outcome);
    return outcome;
  }

  current(id: string): ImageAssetRef | null {
    this.#assertUsable();
    return this.#current.get(id) ?? null;
  }

  async prepareEdit(_ref: ImageAssetRef): Promise<ImageEditSession> {
    this.#assertUsable();
    throw new Error("Image editing is outside the MatCap image test fake");
  }

  async remove(id: string): Promise<void> {
    this.#assertUsable();
    this.removedIds.push(id);
    this.#current.delete(id);
    for (const listener of this.#listeners) listener({ kind: "removed", id });
  }

  async flush(refs: ReadonlyArray<ImageAssetRef> = []): Promise<void> {
    this.#assertUsable();
    this.flushedRefs.push(refs);
  }

  async resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    this.#assertUsable();
    this.resolvedRefs.push(ref);
    const outcome = this.#resolves.get(ref.id);
    if (outcome === undefined) throw new Error(`No scripted resolve result for ${ref.id}`);
    if (outcome instanceof Error) throw outcome;
    return typeof outcome === "function" ? outcome() : outcome;
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Scripted image asset service is disposed");
  }
}

export function imageRef(
  id: string,
  width = 256,
  height = width,
  colorSpace: ImageAssetRef["colorSpace"] = "srgb",
): ImageAssetRef {
  return Object.freeze({ id, revision: 0, width, height, colorSpace });
}
