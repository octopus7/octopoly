import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  ImageTileUpdate,
  Unsubscribe,
} from "@octopoly/contracts";
import {
  BrowserTextureImagePixelDecoder,
  type TextureImagePixelDecoder,
} from "./image-pixel-decoder";

export type TextureImageDisabledReason =
  | "missing-image"
  | "image-preparing"
  | "image-unavailable"
  | "image-over-budget";

export interface TextureImageLimits {
  readonly maxTextureSize: number;
  readonly maxBytes: number;
}

export interface TextureImageStatus {
  readonly active: ImageAssetRef | null;
  readonly ready: boolean;
  readonly reason: TextureImageDisabledReason | null;
}

export type TextureImageOperationResult =
  | { readonly status: "ready"; readonly ref: ImageAssetRef }
  | {
      readonly status: "failed";
      readonly reason: Exclude<TextureImageDisabledReason, "missing-image" | "image-preparing">;
      readonly error?: unknown;
    }
  | { readonly status: "cancelled" };

const UNBOUNDED_LIMITS: TextureImageLimits = Object.freeze({
  maxTextureSize: Number.MAX_SAFE_INTEGER,
  maxBytes: Number.MAX_SAFE_INTEGER,
});

function sameRevision(first: ImageAssetRef | null, second: ImageAssetRef | null): boolean {
  return first !== null
    && second !== null
    && first.id === second.id
    && first.revision === second.revision;
}

function cloneRef(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({ ...ref });
}

function validateLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

/**
 * Keeps a decoded edit session ready before a pointer gesture begins. Async
 * selection never replaces the previous usable image until preparation has
 * completed, so import/decode failures cannot disturb the current texture.
 */
export class TexturePaintImageController {
  readonly #images: ImageAssetService;
  readonly #limits: TextureImageLimits;
  readonly #decoder: TextureImagePixelDecoder;
  readonly #listeners = new Set<(status: TextureImageStatus) => void>();
  readonly #unsubscribeImages: Unsubscribe;
  #active: ImageAssetRef | null = null;
  #prepared: ImageEditSession | null = null;
  #pixels: Uint8ClampedArray | null = null;
  #pixelRevision: ImageAssetRef | null = null;
  #reason: TextureImageDisabledReason | null = "missing-image";
  #operation = 0;
  #editing = false;
  #suppressEvents = 0;
  readonly #pendingCleanup = new Map<string, ImageAssetRef>();
  readonly #preparationTimers = new Set<ReturnType<typeof setTimeout>>();
  #disposed = false;

  constructor(
    images: ImageAssetService,
    limits: TextureImageLimits = UNBOUNDED_LIMITS,
    decoder: TextureImagePixelDecoder = new BrowserTextureImagePixelDecoder(),
  ) {
    validateLimit(limits.maxTextureSize, "Texture size limit");
    validateLimit(limits.maxBytes, "Texture byte limit");
    this.#images = images;
    this.#limits = Object.freeze({ ...limits });
    this.#decoder = decoder;
    this.#unsubscribeImages = images.subscribe((event) => { this.#handleAssetEvent(event); });
  }

  activeImage(): ImageAssetRef | null {
    this.#assertUsable();
    return this.#active;
  }

  status(): TextureImageStatus {
    this.#assertUsable();
    return this.#snapshot();
  }

  subscribe(listener: (status: TextureImageStatus) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  pixelAt(x: number, y: number): readonly [number, number, number, number] {
    this.#assertUsable();
    const active = this.#active;
    if (
      active === null
      || this.#pixels === null
      || !sameRevision(active, this.#pixelRevision)
      || !Number.isSafeInteger(x)
      || !Number.isSafeInteger(y)
      || x < 0
      || y < 0
      || x >= active.width
      || y >= active.height
    ) {
      throw new Error("Texture paint CPU pixels are not ready for the requested location");
    }
    const offset = (y * active.width + x) * 4;
    return Object.freeze([
      this.#pixels[offset] ?? 0,
      this.#pixels[offset + 1] ?? 0,
      this.#pixels[offset + 2] ?? 0,
      this.#pixels[offset + 3] ?? 0,
    ] as const);
  }

  applyWrittenUpdate(ref: ImageAssetRef, update: ImageTileUpdate): void {
    this.#assertUsable();
    if (this.#pixels === null || this.#active === null || ref.id !== this.#active.id) {
      throw new Error("Texture paint CPU pixels are unavailable during image write");
    }
    this.#validateUpdate(ref, update);
    for (let row = 0; row < update.height; row += 1) {
      const sourceStart = row * update.width * 4;
      const targetStart = ((update.y + row) * ref.width + update.x) * 4;
      this.#pixels.set(
        update.rgba8Premultiplied.subarray(sourceStart, sourceStart + update.width * 4),
        targetStart,
      );
    }
    this.#active = cloneRef(ref);
    this.#pixelRevision = this.#active;
  }

  /** Synchronous history hook: release an unused edit lock before apply/revert. */
  releasePreparedForHistoryTransition(): void {
    this.#assertUsable();
    if (this.#editing) {
      return;
    }
    this.#operation += 1;
    this.#cancelPrepared();
    this.#reason = this.#active === null ? "missing-image" : "image-preparing";
  }

  async selectImage(ref: ImageAssetRef): Promise<TextureImageOperationResult> {
    this.#assertUsable();
    return this.#prepareSelection(cloneRef(ref), false);
  }

  async importImage(source: Blob): Promise<TextureImageOperationResult> {
    this.#assertUsable();
    const operation = ++this.#operation;
    let imported: ImageAssetRef;

    try {
      imported = await this.#images.import(source);
    } catch (error) {
      if (!this.#disposed && operation === this.#operation && this.#active === null) {
        this.#reason = "image-unavailable";
        this.#publish();
      }
      return Object.freeze({ status: "failed" as const, reason: "image-unavailable" as const, error });
    }

    if (this.#disposed || operation !== this.#operation) {
      await this.#cleanupImported(imported);
      return Object.freeze({ status: "cancelled" as const });
    }

    return this.#prepareSelection(imported, true, operation);
  }

  /** Transfers the already-prepared edit session to a synchronous stroke. */
  takePreparedEdit(): ImageEditSession | null {
    this.#assertUsable();
    if (
      this.#prepared === null
      || this.#active === null
      || this.#pixels === null
      || !sameRevision(this.#active, this.#pixelRevision)
    ) {
      return null;
    }

    const current = this.#images.current(this.#active.id);
    if (!sameRevision(current, this.#active)) {
      this.#cancelPrepared();
      this.#reason = "image-unavailable";
      this.#publish();
      return null;
    }

    const prepared = this.#prepared;
    this.#prepared = null;
    this.#editing = true;
    return prepared;
  }

  /** Re-arms editing after a committed stroke without blocking pointer-up. */
  acceptCommitted(ref: ImageAssetRef): void {
    this.#assertUsable();
    this.#active = cloneRef(ref);
    this.#editing = false;
    this.#reason = "image-preparing";
    this.#publish();
    this.#schedulePrepare(this.#active);
  }

  /** Re-arms editing after cancel restored the edit session's base revision. */
  acceptCancelled(base: ImageAssetRef): void {
    this.#assertUsable();
    const current = this.#images.current(base.id);
    this.#editing = false;
    this.#active = current === null ? null : cloneRef(current);
    this.#pixels = null;
    this.#pixelRevision = null;
    this.#reason = this.#active === null ? "image-unavailable" : "image-preparing";
    this.#publish();
    if (this.#active !== null) {
      this.#schedulePrepare(this.#active);
    }
  }

  async flushActive(): Promise<void> {
    this.#assertUsable();
    await this.retryPendingCleanup();
    if (this.#active === null) {
      return;
    }
    await this.#images.flush(Object.freeze([this.#active]));
  }

  pendingCleanup(): ReadonlyArray<ImageAssetRef> {
    this.#assertUsable();
    return Object.freeze([...this.#pendingCleanup.values()]);
  }

  async retryPendingCleanup(): Promise<void> {
    this.#assertUsable();
    const failures: unknown[] = [];
    for (const ref of [...this.#pendingCleanup.values()]) {
      try {
        await this.#images.remove(ref.id);
        this.#pendingCleanup.delete(ref.id);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Texture image cleanup remains pending");
    }
  }

  clear(): void {
    this.#assertUsable();
    this.#operation += 1;
    this.#cancelPrepared();
    this.#editing = false;
    this.#active = null;
    this.#pixels = null;
    this.#pixelRevision = null;
    this.#reason = "missing-image";
    this.#publish();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#operation += 1;
    this.#cancelPrepared();
    this.#editing = false;
    this.#active = null;
    this.#pixels = null;
    this.#pixelRevision = null;
    this.#listeners.clear();
    this.#unsubscribeImages();
    for (const timer of this.#preparationTimers) clearTimeout(timer);
    this.#preparationTimers.clear();
  }

  async #prepareSelection(
    ref: ImageAssetRef,
    removeOnFailure: boolean,
    existingOperation?: number,
  ): Promise<TextureImageOperationResult> {
    const operation = existingOperation ?? ++this.#operation;
    const limitReason = this.#limitReason(ref);
    if (limitReason !== null) {
      let cleanupError: unknown;
      if (removeOnFailure) {
        try { await this.#cleanupImported(ref); } catch (error) { cleanupError = error; }
      }
      if (!this.#disposed && operation === this.#operation && this.#active === null) {
        this.#reason = limitReason;
        this.#publish();
      }
      return Object.freeze({
        status: "failed" as const,
        reason: limitReason,
        ...(cleanupError === undefined ? {} : { error: cleanupError }),
      });
    }

    let prepared: ImageEditSession;
    let pixels: Uint8ClampedArray;
    try {
      pixels = await this.#decode(ref);
      if (this.#disposed || operation !== this.#operation) {
        if (removeOnFailure) await this.#cleanupImported(ref);
        return Object.freeze({ status: "cancelled" as const });
      }
      this.#cancelPrepared();
      if (this.#active !== null) {
        this.#reason = "image-preparing";
        this.#publish();
      }
      prepared = await this.#images.prepareEdit(ref);
    } catch (error) {
      let cleanupError: unknown;
      if (removeOnFailure) {
        try { await this.#cleanupImported(ref); } catch (cleanupFailure) { cleanupError = cleanupFailure; }
      }
      if (!this.#disposed && operation === this.#operation && this.#active === null) {
        this.#reason = "image-unavailable";
        this.#publish();
      } else if (!this.#disposed && this.#active !== null) {
        this.#reason = "image-preparing";
        this.#publish();
        this.#schedulePrepare(this.#active);
      }
      return Object.freeze({
        status: "failed" as const,
        reason: "image-unavailable" as const,
        error: cleanupError === undefined
          ? error
          : new AggregateError([error, cleanupError], "Image preparation and cleanup failed"),
      });
    }

    if (this.#disposed || operation !== this.#operation) {
      this.#cancelDetached(prepared);
      if (removeOnFailure) {
        await this.#cleanupImported(ref);
      }
      return Object.freeze({ status: "cancelled" as const });
    }

    this.#prepared = prepared;
    this.#active = cloneRef(ref);
    this.#pixels = pixels;
    this.#pixelRevision = this.#active;
    this.#reason = "image-preparing";
    this.#publish();
    this.#reason = null;
    this.#publish();
    return Object.freeze({ status: "ready" as const, ref: this.#active });
  }

  async #prepareCurrent(ref: ImageAssetRef, operation: number): Promise<void> {
    if (this.#disposed || operation !== this.#operation || !sameRevision(this.#active, ref)) {
      return;
    }
    let prepared: ImageEditSession;
    let pixels: Uint8ClampedArray;
    try {
      pixels = await this.#decode(ref);
      if (this.#disposed || operation !== this.#operation || !sameRevision(this.#active, ref)) {
        return;
      }
      prepared = await this.#images.prepareEdit(ref);
    } catch {
      if (!this.#disposed && operation === this.#operation && sameRevision(this.#active, ref)) {
        this.#reason = "image-unavailable";
        this.#publish();
      }
      return;
    }

    if (this.#disposed || operation !== this.#operation || !sameRevision(this.#active, ref)) {
      this.#cancelDetached(prepared);
      return;
    }

    this.#cancelPrepared();
    this.#prepared = prepared;
    this.#pixels = pixels;
    this.#pixelRevision = cloneRef(ref);
    this.#reason = null;
    this.#publish();
  }

  #limitReason(ref: ImageAssetRef): "image-over-budget" | null {
    if (
      !Number.isSafeInteger(ref.width)
      || !Number.isSafeInteger(ref.height)
      || ref.width <= 0
      || ref.height <= 0
      || ref.width > this.#limits.maxTextureSize
      || ref.height > this.#limits.maxTextureSize
    ) {
      return "image-over-budget";
    }

    const bytes = ref.width * ref.height * 4;
    return Number.isSafeInteger(bytes) && bytes <= this.#limits.maxBytes
      ? null
      : "image-over-budget";
  }

  async #cleanupImported(ref: ImageAssetRef): Promise<void> {
    this.#pendingCleanup.set(ref.id, cloneRef(ref));
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.#images.remove(ref.id);
        this.#pendingCleanup.delete(ref.id);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new AggregateError(
      lastError === undefined ? [] : [lastError],
      `Imported texture "${ref.id}" cleanup remains pending`,
    );
  }

  async #decode(ref: ImageAssetRef): Promise<Uint8ClampedArray> {
    const bitmap = await this.#images.resolve(ref);
    try {
      const pixels = await this.#decoder.decode(bitmap, ref);
      const expected = ref.width * ref.height * 4;
      if (pixels.byteLength !== expected) {
        throw new Error(`Decoded texture byte length must be ${expected}`);
      }
      return new Uint8ClampedArray(pixels);
    } finally {
      bitmap.close();
    }
  }

  #handleAssetEvent(event: ImageAssetEvent): void {
    if (this.#disposed || this.#suppressEvents > 0 || this.#active === null) {
      return;
    }
    if (event.kind === "removed") {
      if (event.id !== this.#active.id) {
        return;
      }
      this.#operation += 1;
      this.#cancelPrepared();
      this.#editing = false;
      this.#active = null;
      this.#pixels = null;
      this.#pixelRevision = null;
      this.#reason = "missing-image";
      this.#publish();
      return;
    }
    if (event.ref.id !== this.#active.id) {
      return;
    }

    this.#active = cloneRef(event.ref);
    if (this.#editing) {
      this.#publish();
      return;
    }

    this.#operation += 1;
    this.#cancelPrepared();
    this.#pixels = null;
    this.#pixelRevision = null;
    this.#reason = "image-preparing";
    this.#publish();
    this.#schedulePrepare(this.#active);
  }

  #schedulePrepare(ref: ImageAssetRef): void {
    const operation = ++this.#operation;
    const timer = setTimeout(() => {
      this.#preparationTimers.delete(timer);
      void this.#prepareCurrent(ref, operation);
    }, 0);
    this.#preparationTimers.add(timer);
  }

  #cancelPrepared(): void {
    const prepared = this.#prepared;
    this.#prepared = null;
    if (prepared !== null) {
      this.#cancelDetached(prepared);
    }
  }

  #cancelDetached(prepared: ImageEditSession): void {
    this.#suppressEvents += 1;
    const current = this.#images.current(prepared.base.id);
    try {
      if (sameRevision(current, prepared.base)) {
        prepared.cancel();
        return;
      }
      throw new Error(
        "Refusing to close a stale prepared texture edit because cancel could restore an old revision",
      );
    } finally {
      this.#suppressEvents -= 1;
    }
  }

  #snapshot(): TextureImageStatus {
    return Object.freeze({
      active: this.#active,
      ready: this.#active !== null
        && this.#prepared !== null
        && this.#pixels !== null
        && sameRevision(this.#active, this.#pixelRevision),
      reason: this.#active !== null
        && this.#prepared !== null
        && this.#pixels !== null
        && sameRevision(this.#active, this.#pixelRevision)
        ? null
        : this.#reason,
    });
  }

  #publish(): void {
    const snapshot = this.#snapshot();
    for (const listener of [...this.#listeners]) {
      listener(snapshot);
    }
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Texture paint image controller is disposed");
    }
  }

  #validateUpdate(ref: ImageAssetRef, update: ImageTileUpdate): void {
    if (
      update.x < 0
      || update.y < 0
      || update.width < 0
      || update.height < 0
      || update.x + update.width > ref.width
      || update.y + update.height > ref.height
      || update.rgba8Premultiplied.byteLength !== update.width * update.height * 4
    ) {
      throw new Error("Invalid replacement tile update");
    }
  }
}
