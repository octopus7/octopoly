import type {
  Disposable,
  ImageAssetRef,
  ImageAssetService,
  RendererCapabilities,
} from "@octopoly/contracts";

import { createMatcapPresetBlob, type MatcapPresetId } from "../presets";

export type MatcapImageFailureCode =
  | "invalid-image"
  | "decode-failed"
  | "resource-budget";

export type MatcapImageIssue =
  | "invalid-reference"
  | "invalid-dimensions"
  | "invalid-color-space"
  | "decode-failed"
  | "texture-size-exceeded"
  | "texture-budget-exceeded"
  | "gpu-budget-exceeded";

export interface MatcapImageSelectionSuccess {
  readonly status: "selected";
  readonly ref: ImageAssetRef;
  readonly previous: ImageAssetRef | null;
}
export interface MatcapImageSelectionFailure {
  readonly status: "failed";
  readonly code: MatcapImageFailureCode;
  readonly issue: MatcapImageIssue;
  readonly reason: string;
  readonly retained: ImageAssetRef | null;
  readonly attempted?: ImageAssetRef;
}

export type MatcapImageSelectionResult =
  | MatcapImageSelectionSuccess
  | MatcapImageSelectionFailure;

interface ValidationFailure {
  readonly code: MatcapImageFailureCode;
  readonly issue: MatcapImageIssue;
  readonly reason: string;
}

function cloneRef(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({ ...ref });
}

function message(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown decode error";
}

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // Ownership ends here even when a test double or host shim throws while closing.
  }
}

function validateCapabilities(capabilities: RendererCapabilities): void {
  if (!Number.isSafeInteger(capabilities.maxTextureSize) || capabilities.maxTextureSize <= 0) {
    throw new TypeError("Renderer max texture size must be a positive safe integer");
  }
  for (const [label, value] of [
    ["application texture budget", capabilities.applicationTextureBudgetBytes],
    ["application GPU budget", capabilities.applicationGpuBudgetBytes],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Renderer ${label} must be a non-negative safe integer`);
    }
  }
}

function validateReference(
  ref: ImageAssetRef,
  capabilities: RendererCapabilities,
): ValidationFailure | null {
  if (typeof ref.id !== "string" || ref.id.trim().length === 0
    || !Number.isSafeInteger(ref.revision) || ref.revision < 0) {
    return {
      code: "invalid-image",
      issue: "invalid-reference",
      reason: "MatCap image id and revision are invalid.",
    };
  }
  if (!Number.isSafeInteger(ref.width) || ref.width <= 0
    || !Number.isSafeInteger(ref.height) || ref.height <= 0) {
    return {
      code: "invalid-image",
      issue: "invalid-dimensions",
      reason: "MatCap image dimensions must be positive safe integers.",
    };
  }
  if (ref.colorSpace !== "srgb" && ref.colorSpace !== "linear") {
    return {
      code: "invalid-image",
      issue: "invalid-color-space",
      reason: "MatCap image color space must be srgb or linear.",
    };
  }
  if (ref.width > capabilities.maxTextureSize || ref.height > capabilities.maxTextureSize) {
    return {
      code: "resource-budget",
      issue: "texture-size-exceeded",
      reason: `MatCap image exceeds the ${capabilities.maxTextureSize}px texture size limit.`,
    };
  }
  const pixels = ref.width * ref.height;
  const rgbaBytes = pixels * 4;
  if (!Number.isSafeInteger(pixels) || !Number.isSafeInteger(rgbaBytes)) {
    return {
      code: "resource-budget",
      issue: "texture-budget-exceeded",
      reason: "MatCap image RGBA8 byte size exceeds the safe integer range.",
    };
  }
  if (rgbaBytes > capabilities.applicationTextureBudgetBytes) {
    return {
      code: "resource-budget",
      issue: "texture-budget-exceeded",
      reason: "MatCap image exceeds the application texture budget.",
    };
  }
  if (rgbaBytes > capabilities.applicationGpuBudgetBytes) {
    return {
      code: "resource-budget",
      issue: "gpu-budget-exceeded",
      reason: "MatCap image exceeds the application GPU budget.",
    };
  }
  return null;
}

function validateDecodedBitmap(ref: ImageAssetRef, bitmap: ImageBitmap): ValidationFailure | null {
  if (!Number.isSafeInteger(bitmap.width) || bitmap.width <= 0
    || !Number.isSafeInteger(bitmap.height) || bitmap.height <= 0
    || bitmap.width !== ref.width || bitmap.height !== ref.height) {
    return {
      code: "invalid-image",
      issue: "invalid-dimensions",
      reason: "Decoded MatCap dimensions do not match the image reference.",
    };
  }
  return null;
}

/**
 * Owns MatCap selection validation, not the persistent assets themselves.
 * Failed operations leave the previous valid reference active.
 */
export class MatcapImageManager implements Disposable {
  readonly #images: ImageAssetService;
  readonly #capabilities: RendererCapabilities;
  readonly #presetRefs = new Map<MatcapPresetId, ImageAssetRef>();
  #current: ImageAssetRef | null = null;
  #tail: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(images: ImageAssetService, capabilities: RendererCapabilities) {
    validateCapabilities(capabilities);
    this.#images = images;
    this.#capabilities = Object.freeze({ ...capabilities });
  }

  current(): ImageAssetRef | null {
    this.#assertUsable();
    return this.#current;
  }

  selectPreset(id: MatcapPresetId): Promise<MatcapImageSelectionResult> {
    return this.#enqueue(async () => {
      let ref = this.#presetRefs.get(id);
      if (ref === undefined) {
        try {
          ref = await this.#images.import(createMatcapPresetBlob(id));
        } catch (error) {
          this.#assertUsable();
          return this.#failure({
            code: "decode-failed",
            issue: "decode-failed",
            reason: `MatCap preset import failed: ${message(error)}`,
          });
        }
        this.#assertUsable();
      }
      const result = await this.#validateAndSelect(ref);
      if (result.status === "selected") this.#presetRefs.set(id, result.ref);
      return result;
    });
  }

  importCustom(source: Blob): Promise<MatcapImageSelectionResult> {
    return this.#enqueue(async () => {
      let ref: ImageAssetRef;
      try {
        ref = await this.#images.import(source);
      } catch (error) {
        this.#assertUsable();
        return this.#failure({
          code: "decode-failed",
          issue: "decode-failed",
          reason: `MatCap image import failed: ${message(error)}`,
        });
      }
      this.#assertUsable();
      return this.#validateAndSelect(ref);
    });
  }

  selectCustom(ref: ImageAssetRef): Promise<MatcapImageSelectionResult> {
    return this.#enqueue(() => this.#validateAndSelect(ref));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#presetRefs.clear();
    this.#current = null;
  }

  #enqueue(
    operation: () => Promise<MatcapImageSelectionResult>,
  ): Promise<MatcapImageSelectionResult> {
    this.#assertUsable();
    const result = this.#tail.then(async () => {
      this.#assertUsable();
      return operation();
    });
    this.#tail = result.then(() => {}, () => {});
    return result;
  }

  async #validateAndSelect(ref: ImageAssetRef): Promise<MatcapImageSelectionResult> {
    const immutableRef = cloneRef(ref);
    const referenceFailure = validateReference(immutableRef, this.#capabilities);
    if (referenceFailure !== null) return this.#failure(referenceFailure, immutableRef);

    let bitmap: ImageBitmap;
    try {
      bitmap = await this.#images.resolve(immutableRef);
    } catch (error) {
      this.#assertUsable();
      return this.#failure({
        code: "decode-failed",
        issue: "decode-failed",
        reason: `MatCap image decode failed: ${message(error)}`,
      }, immutableRef);
    }

    try {
      this.#assertUsable();
      const bitmapFailure = validateDecodedBitmap(immutableRef, bitmap);
      if (bitmapFailure !== null) return this.#failure(bitmapFailure, immutableRef);
      const previous = this.#current;
      this.#current = immutableRef;
      return Object.freeze({ status: "selected", ref: immutableRef, previous });
    } finally {
      closeBitmap(bitmap);
    }
  }

  #failure(
    failure: ValidationFailure,
    attempted?: ImageAssetRef,
  ): MatcapImageSelectionFailure {
    const base = {
      status: "failed" as const,
      code: failure.code,
      issue: failure.issue,
      reason: failure.reason,
      retained: this.#current,
    };
    return attempted === undefined
      ? Object.freeze(base)
      : Object.freeze({ ...base, attempted });
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("MatCap image manager is disposed");
  }
}
