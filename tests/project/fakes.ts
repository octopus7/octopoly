import type {
  DecodedImagePixels,
  ImagePixelCodec,
} from "../../src/project/image-codec";
import type {
  ProjectStorage,
  ProjectStoreMutation,
  ProjectStoreName,
} from "../../src/project/storage";

export class MemoryProjectStorage implements ProjectStorage {
  readonly values = new Map<string, unknown>();
  failNextTransaction: unknown;
  #disposed = false;

  async get<T>(store: ProjectStoreName, key: string, signal?: AbortSignal): Promise<T | undefined> {
    this.#assertUsable();
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return structuredClone(this.values.get(`${store}:${key}`)) as T | undefined;
  }

  async transact(mutations: ReadonlyArray<ProjectStoreMutation>, signal?: AbortSignal): Promise<void> {
    this.#assertUsable();
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (this.failNextTransaction !== undefined) {
      const failure = this.failNextTransaction;
      this.failNextTransaction = undefined;
      throw failure;
    }
    const next = new Map(this.values);
    for (const mutation of mutations) {
      const key = `${mutation.store}:${mutation.key}`;
      if (mutation.kind === "put") next.set(key, structuredClone(mutation.value));
      else next.delete(key);
    }
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    this.values.clear();
    for (const [key, value] of next) this.values.set(key, value);
  }

  dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("disposed");
  }
}

export class FakeImageCodec implements ImagePixelCodec {
  readonly closed: boolean[] = [];
  constructor(private readonly decoded: DecodedImagePixels) {}

  async decode(): Promise<DecodedImagePixels> {
    return {
      width: this.decoded.width,
      height: this.decoded.height,
      rgba8Premultiplied: new Uint8ClampedArray(this.decoded.rgba8Premultiplied),
    };
  }

  async createBitmap(image: DecodedImagePixels): Promise<ImageBitmap> {
    const marker = this.closed.length;
    this.closed.push(false);
    return {
      width: image.width,
      height: image.height,
      close: () => { this.closed[marker] = true; },
    } as ImageBitmap;
  }
}
