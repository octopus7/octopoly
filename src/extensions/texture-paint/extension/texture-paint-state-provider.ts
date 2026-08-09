import type {
  ExtensionStateContribution,
  ExtensionStateProvider,
  ImageAssetRef,
  JsonValue,
} from "@octopoly/contracts";

import { DEFAULT_BRUSH_SETTINGS, BrushEngine, type BrushSettings } from "../brush";
import type { TexturePaintImageController } from "../image";
import type { TexturePaintBrushController } from "./brush-controller";

export const TEXTURE_PAINT_STATE_ID = "texture-paint";
const TEXTURE_PAINT_STATE_SCHEMA = 1;

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSettings(value: JsonValue | undefined): Readonly<BrushSettings> {
  if (!isRecord(value)) {
    throw new Error("Texture paint brush state must be an object");
  }
  const radiusPx = value.radiusPx;
  const hardness = value.hardness;
  const opacity = value.opacity;
  const spacingPx = value.spacingPx;
  const pressureRadius = value.pressureRadius;
  const pressureOpacity = value.pressureOpacity;
  const defaultPressure = value.defaultPressure;
  const entries = Object.entries({
    radiusPx,
    hardness,
    opacity,
    spacingPx,
    pressureRadius,
    pressureOpacity,
    defaultPressure,
  });
  for (const [key, candidate] of entries) {
    if (typeof candidate !== "number") {
      throw new Error(`Texture paint brush setting "${key}" must be a number`);
    }
  }
  const settings = {
    radiusPx: radiusPx as number,
    hardness: hardness as number,
    opacity: opacity as number,
    spacingPx: spacingPx as number,
    pressureRadius: pressureRadius as number,
    pressureOpacity: pressureOpacity as number,
    defaultPressure: defaultPressure as number,
  };
  return new BrushEngine(settings).settings;
}

function findActiveImage(
  value: JsonValue | undefined,
  imageAssets: ReadonlyArray<ImageAssetRef>,
): ImageAssetRef | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.revision !== "number") {
    throw new Error("Texture paint active image state is invalid");
  }
  const ref = imageAssets.find((candidate) => (
    candidate.id === value.id && candidate.revision === value.revision
  ));
  if (ref === undefined) {
    throw new Error("Texture paint active image revision is missing from imageAssets");
  }
  return ref;
}

export class TexturePaintStateProvider implements ExtensionStateProvider {
  readonly id = TEXTURE_PAINT_STATE_ID;
  readonly #images: TexturePaintImageController;
  readonly #brushes: TexturePaintBrushController;
  #disposed = false;

  constructor(images: TexturePaintImageController, brushes: TexturePaintBrushController) {
    this.#images = images;
    this.#brushes = brushes;
  }

  async load(value: ExtensionStateContribution | undefined): Promise<void> {
    this.#assertUsable();
    if (value === undefined) {
      this.#images.clear();
      this.#brushes.setSettings(DEFAULT_BRUSH_SETTINGS);
      return;
    }
    if (value.schemaVersion !== TEXTURE_PAINT_STATE_SCHEMA || !isRecord(value.data)) {
      throw new Error(`Unsupported texture paint state schema ${value.schemaVersion}`);
    }

    const settings = parseSettings(value.data.brush);
    const image = findActiveImage(value.data.activeImage, value.imageAssets ?? []);
    if (image === null) {
      this.#images.clear();
    } else {
      const selection = await this.#images.selectImage(image);
      if (selection.status !== "ready") {
        throw new Error(`Texture paint image could not be prepared: ${selection.status}`);
      }
    }
    this.#assertUsable();
    this.#brushes.setSettings(settings);
  }

  save(): ExtensionStateContribution {
    this.#assertUsable();
    if (this.#images.pendingCleanup().length > 0) {
      throw new Error("Cannot save texture paint state while imported image cleanup is pending");
    }
    const image = this.#images.activeImage();
    const settings = this.#brushes.settings();
    const brush: Record<string, JsonValue> = {};
    for (const key of Object.keys(settings) as Array<keyof BrushSettings>) {
      brush[key] = settings[key];
    }
    return Object.freeze({
      schemaVersion: TEXTURE_PAINT_STATE_SCHEMA,
      data: Object.freeze({
        activeImage: image === null
          ? null
          : Object.freeze({ id: image.id, revision: image.revision }),
        brush: Object.freeze(brush),
      }),
      ...(image === null ? {} : { imageAssets: Object.freeze([image]) }),
    });
  }

  dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Texture paint state provider is disposed");
    }
  }
}
