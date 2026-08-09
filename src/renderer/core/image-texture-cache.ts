import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetResolver,
  Unsubscribe,
} from "@octopoly/contracts";

export type ImageTextureLookup =
  | { readonly status: "ready"; readonly texture: WebGLTexture }
  | { readonly status: "pending" }
  | { readonly status: "unavailable"; readonly reason: string };

interface CacheEntry {
  readonly ref: ImageAssetRef;
  readonly generation: number;
  status: "pending" | "ready" | "failed";
  texture: WebGLTexture | null;
  bytes: number;
  reason: string;
}

export class WebGlImageTextureCache {
  readonly #resolver: ImageAssetResolver | undefined;
  readonly #maxTextureSize: number;
  readonly #budgetBytes: number;
  readonly #onInvalidate: () => void;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #activeRevisionById = new Map<string, number>();
  #unsubscribe: Unsubscribe | null = null;
  #gl: WebGL2RenderingContext | null;
  #generation = 0;
  #allocatedBytes = 0;
  #disposed = false;

  constructor(
    gl: WebGL2RenderingContext,
    resolver: ImageAssetResolver | undefined,
    maxTextureSize: number,
    budgetBytes: number,
    onInvalidate: () => void,
  ) {
    this.#gl = gl;
    this.#resolver = resolver;
    this.#maxTextureSize = maxTextureSize;
    this.#budgetBytes = budgetBytes;
    this.#onInvalidate = onInvalidate;
    if (resolver !== undefined) {
      this.#unsubscribe = resolver.subscribe((event) => this.#handleEvent(event));
    }
  }

  use(ref: ImageAssetRef): ImageTextureLookup {
    this.#assertAlive();
    const validationFailure = this.#validateRef(ref);
    if (validationFailure !== null) {
      return { status: "unavailable", reason: validationFailure };
    }
    if (this.#resolver === undefined) {
      return { status: "unavailable", reason: "No ImageAssetResolver was provided" };
    }
    const gl = this.#gl;
    if (gl === null) {
      return { status: "unavailable", reason: "WebGL2 context is not ready" };
    }

    const previousRevision = this.#activeRevisionById.get(ref.id);
    if (previousRevision !== undefined && previousRevision !== ref.revision) {
      this.#invalidateKey(keyFor(ref.id, previousRevision), true);
    }
    this.#activeRevisionById.set(ref.id, ref.revision);

    const key = keyFor(ref.id, ref.revision);
    const existing = this.#entries.get(key);
    if (existing?.status === "ready" && existing.texture !== null) {
      return { status: "ready", texture: existing.texture };
    }
    if (existing?.status === "failed") {
      return { status: "unavailable", reason: existing.reason };
    }
    if (existing?.status === "pending") {
      return { status: "pending" };
    }

    const entry: CacheEntry = {
      ref,
      generation: this.#generation,
      status: "pending",
      texture: null,
      bytes: 0,
      reason: "",
    };
    this.#entries.set(key, entry);
    void this.#resolver.resolve(ref).then(
      (bitmap) => this.#completeResolve(key, entry, bitmap),
      (error: unknown) => this.#failResolve(key, entry, reasonFrom(error)),
    );
    return { status: "pending" };
  }

  invalidateContext(): void {
    if (this.#disposed) {
      return;
    }
    this.#generation += 1;
    this.#clearEntries(false);
    this.#gl = null;
  }

  restoreContext(gl: WebGL2RenderingContext): void {
    this.#assertAlive();
    this.#generation += 1;
    this.#clearEntries(false);
    this.#gl = gl;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#generation += 1;
    try {
      this.#unsubscribe?.();
    } catch {
      // Resolver teardown cannot prevent GPU resource cleanup.
    }
    this.#unsubscribe = null;
    this.#clearEntries(this.#gl !== null);
    this.#activeRevisionById.clear();
    this.#gl = null;
  }

  #completeResolve(key: string, entry: CacheEntry, bitmap: ImageBitmap): void {
    const gl = this.#gl;
    if (
      this.#disposed ||
      gl === null ||
      entry.generation !== this.#generation ||
      this.#entries.get(key) !== entry ||
      this.#activeRevisionById.get(entry.ref.id) !== entry.ref.revision
    ) {
      closeBitmap(bitmap);
      return;
    }

    const bytes = entry.ref.width * entry.ref.height * 4;
    if (this.#allocatedBytes + bytes > this.#budgetBytes) {
      closeBitmap(bitmap);
      this.#failResolve(key, entry, "Application texture budget exceeded");
      return;
    }

    const texture = gl.createTexture();
    if (texture === null) {
      closeBitmap(bitmap);
      this.#failResolve(key, entry, "WebGL2 texture allocation failed");
      return;
    }

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bitmap,
      );
    } catch (error) {
      gl.deleteTexture(texture);
      closeBitmap(bitmap);
      this.#failResolve(key, entry, reasonFrom(error));
      return;
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    closeBitmap(bitmap);
    entry.status = "ready";
    entry.texture = texture;
    entry.bytes = bytes;
    entry.reason = "";
    this.#allocatedBytes += bytes;
    this.#onInvalidate();
  }

  #failResolve(key: string, entry: CacheEntry, reason: string): void {
    if (
      this.#disposed ||
      entry.generation !== this.#generation ||
      this.#entries.get(key) !== entry
    ) {
      return;
    }
    entry.status = "failed";
    entry.reason = reason;
    this.#onInvalidate();
  }

  #handleEvent(event: ImageAssetEvent): void {
    if (this.#disposed) {
      return;
    }
    if (event.kind === "updated") {
      this.#invalidateKey(keyFor(event.ref.id, event.ref.revision), this.#gl !== null);
    } else {
      for (const [key, entry] of [...this.#entries]) {
        if (entry.ref.id === event.id) {
          this.#invalidateKey(key, this.#gl !== null);
        }
      }
      this.#activeRevisionById.delete(event.id);
    }
    this.#onInvalidate();
  }

  #invalidateKey(key: string, deleteTexture: boolean): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return;
    }
    this.#entries.delete(key);
    if (entry.texture !== null) {
      if (deleteTexture) {
        try {
          this.#gl?.deleteTexture(entry.texture);
        } catch {
          // Continue accounting cleanup even if a lost driver rejects deletion.
        }
      }
      this.#allocatedBytes -= entry.bytes;
    }
  }

  #clearEntries(deleteTextures: boolean): void {
    for (const key of [...this.#entries.keys()]) {
      this.#invalidateKey(key, deleteTextures);
    }
    this.#entries.clear();
    this.#allocatedBytes = 0;
  }

  #validateRef(ref: ImageAssetRef): string | null {
    if (!Number.isSafeInteger(ref.revision) || ref.revision < 0) {
      return "Image revision must be a non-negative safe integer";
    }
    if (
      !Number.isSafeInteger(ref.width) ||
      !Number.isSafeInteger(ref.height) ||
      ref.width <= 0 ||
      ref.height <= 0
    ) {
      return "Image dimensions must be positive safe integers";
    }
    if (ref.width > this.#maxTextureSize || ref.height > this.#maxTextureSize) {
      return `Image exceeds WebGL2 max texture size ${this.#maxTextureSize}`;
    }
    return null;
  }

  #assertAlive(): void {
    if (this.#disposed) {
      throw new Error("Image texture cache is disposed");
    }
  }
}

function keyFor(id: string, revision: number): string {
  return `${id}\u0000${revision}`;
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // ImageBitmap ownership has still ended even if a host shim throws on close.
  }
}
