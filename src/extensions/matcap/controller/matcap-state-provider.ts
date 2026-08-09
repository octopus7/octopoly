import type {
  ExtensionStateContribution,
  ExtensionStateProvider,
  ImageAssetRef,
  JsonValue,
} from "@octopoly/contracts";

import { isMatcapPresetId, type MatcapPresetId } from "../presets";
import { MatcapController } from "./matcap-controller";

export const MATCAP_STATE_PROVIDER_ID = "octopoly.matcap";
export const MATCAP_STATE_SCHEMA_VERSION = 2;

interface RestoredState {
  readonly enabled: boolean;
  readonly selection:
    | { readonly kind: "preset"; readonly presetId: MatcapPresetId }
    | { readonly kind: "custom"; readonly image: ImageAssetRef };
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function imageRef(value: JsonValue): ImageAssetRef {
  if (!isRecord(value)) throw new Error("MatCap custom image state must be an object");
  const { id, revision, width, height, colorSpace } = value;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("MatCap custom image id must not be empty");
  }
  for (const [label, numeric] of Object.entries({ revision, width, height })) {
    if (typeof numeric !== "number" || !Number.isSafeInteger(numeric) || numeric < 0) {
      throw new Error(`MatCap custom image ${label} must be a non-negative safe integer`);
    }
  }
  if (colorSpace !== "srgb" && colorSpace !== "linear") {
    throw new Error("MatCap custom image colorSpace is invalid");
  }
  return Object.freeze({
    id,
    revision: revision as number,
    width: width as number,
    height: height as number,
    colorSpace,
  });
}

function sameImage(first: ImageAssetRef, second: ImageAssetRef): boolean {
  return first.id === second.id
    && first.revision === second.revision
    && first.width === second.width
    && first.height === second.height
    && first.colorSpace === second.colorSpace;
}

function parseCurrent(value: ExtensionStateContribution): RestoredState {
  if (!isRecord(value.data)) throw new Error("MatCap state data must be an object");
  const { enabled, selection } = value.data;
  if (typeof enabled !== "boolean") throw new Error("MatCap enabled state must be boolean");
  if (!isRecord(selection) || (selection.kind !== "preset" && selection.kind !== "custom")) {
    throw new Error("MatCap selection state is invalid");
  }
  if (selection.kind === "preset") {
    if (typeof selection.presetId !== "string" || !isMatcapPresetId(selection.presetId)) {
      throw new Error("MatCap preset id is invalid");
    }
    return { enabled, selection: { kind: "preset", presetId: selection.presetId } };
  }

  const serializedImage = selection.image;
  const image = imageRef(serializedImage === undefined ? null : serializedImage);
  const matching = value.imageAssets?.find((candidate) => sameImage(candidate, image));
  if (matching === undefined) {
    throw new Error("MatCap custom image revision is missing from imageAssets");
  }
  return { enabled, selection: { kind: "custom", image } };
}

function migrateLegacy(value: ExtensionStateContribution): RestoredState {
  if (!isRecord(value.data)) throw new Error("Legacy MatCap state data must be an object");
  const enabled = value.data.enabled ?? value.data.active ?? false;
  if (typeof enabled !== "boolean") throw new Error("Legacy MatCap enabled state must be boolean");
  if (typeof value.data.presetId === "string") {
    if (!isMatcapPresetId(value.data.presetId)) throw new Error("Legacy MatCap preset id is invalid");
    return {
      enabled,
      selection: { kind: "preset", presetId: value.data.presetId },
    };
  }
  const custom = value.data.customImage;
  const image = custom === undefined
    ? value.imageAssets?.[0]
    : imageRef(custom);
  if (image === undefined) throw new Error("Legacy MatCap selection is missing");
  return { enabled, selection: { kind: "custom", image } };
}

function serializeImage(ref: ImageAssetRef): JsonValue {
  return Object.freeze({
    id: ref.id,
    revision: ref.revision,
    width: ref.width,
    height: ref.height,
    colorSpace: ref.colorSpace,
  });
}

export class MatcapStateProvider implements ExtensionStateProvider {
  readonly id = MATCAP_STATE_PROVIDER_ID;
  readonly #controller: MatcapController;
  #disposed = false;

  constructor(controller: MatcapController) {
    this.#controller = controller;
  }

  async load(value: ExtensionStateContribution | undefined): Promise<void> {
    this.#assertUsable();
    if (value === undefined) {
      await this.#controller.reset();
      return;
    }
    if (value.schemaVersion !== 1 && value.schemaVersion !== MATCAP_STATE_SCHEMA_VERSION) {
      throw new Error(`Unsupported MatCap state schema ${value.schemaVersion}`);
    }

    const restored = value.schemaVersion === 1 ? migrateLegacy(value) : parseCurrent(value);
    if (restored.selection.kind === "preset") {
      await this.#controller.selectPreset(restored.selection.presetId);
    } else {
      await this.#controller.selectCustom(restored.selection.image);
    }
    this.#controller.setEnabled(restored.enabled);
  }

  save(): ExtensionStateContribution {
    this.#assertUsable();
    const snapshot = this.#controller.snapshot();
    const selection: JsonValue = snapshot.selection.kind === "preset"
      ? Object.freeze({ kind: "preset", presetId: snapshot.selection.presetId })
      : Object.freeze({ kind: "custom", image: serializeImage(snapshot.selection.image) });
    const imageAssets = snapshot.selection.kind === "custom"
      ? Object.freeze([snapshot.selection.image])
      : undefined;

    return Object.freeze({
      schemaVersion: MATCAP_STATE_SCHEMA_VERSION,
      data: Object.freeze({ enabled: snapshot.enabled, selection }),
      ...(imageAssets === undefined ? {} : { imageAssets }),
    });
  }

  dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("MatCap state provider is disposed");
  }
}
