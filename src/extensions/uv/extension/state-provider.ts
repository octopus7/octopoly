import type {
  ExtensionStateContribution,
  ExtensionStateProvider,
  ImageAssetRef,
  JsonValue,
} from "@octopoly/contracts";

import { UvEditorSelection, UvViewportController } from "../editor";
import type { UvViewportLayout } from "../editor";

export const UV_EDITOR_STATE_ID = "octopoly.uv-editor";
export const UV_EDITOR_STATE_SCHEMA_VERSION = 1;

type JsonObject = { readonly [key: string]: JsonValue };

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneJson));
  if (isObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneJson(item);
    return Object.freeze(result);
  }
  return value;
}

function cloneImageRef(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({ ...ref });
}

function cloneContribution(value: ExtensionStateContribution): ExtensionStateContribution {
  const imageAssets = value.imageAssets?.map(cloneImageRef);
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    data: cloneJson(value.data),
    ...(imageAssets === undefined ? {} : { imageAssets: Object.freeze(imageAssets) }),
  });
}

function withoutKeys(source: JsonObject, keys: ReadonlySet<string>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!keys.has(key)) result[key] = cloneJson(value);
  }
  return result;
}

function readIds(value: JsonValue | undefined): ReadonlySet<number> | null {
  if (!Array.isArray(value)) return null;
  const result = new Set<number>();
  for (const id of value) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) return null;
    result.add(id);
  }
  return result;
}

export class UvEditorStateProvider implements ExtensionStateProvider {
  readonly id = UV_EDITOR_STATE_ID;
  readonly #selection: UvEditorSelection;
  readonly #controller: UvViewportController;
  readonly #defaultLayout: UvViewportLayout;
  #rootUnknown: Record<string, JsonValue> = {};
  #layoutUnknown: Record<string, JsonValue> = {};
  #selectionUnknown: Record<string, JsonValue> = {};
  #imageAssets: ReadonlyArray<ImageAssetRef> | undefined;
  #opaque: ExtensionStateContribution | undefined;
  #disposed = false;

  constructor(selection: UvEditorSelection, controller: UvViewportController) {
    this.#selection = selection;
    this.#controller = controller;
    this.#defaultLayout = controller.layout();
  }

  load(value: ExtensionStateContribution | undefined): void {
    this.#assertUsable();
    this.#resetUnknown();
    this.#controller.setLayout(this.#defaultLayout);
    this.#selection.clear();
    if (value === undefined) {
      return;
    }

    if (value.schemaVersion !== UV_EDITOR_STATE_SCHEMA_VERSION || !isObject(value.data)) {
      this.#opaque = cloneContribution(value);
      return;
    }

    const data = value.data;
    this.#rootUnknown = withoutKeys(data, new Set(["layout", "selection"]));
    this.#imageAssets = value.imageAssets?.map(cloneImageRef);

    const layout = data.layout;
    if (layout !== undefined && isObject(layout)) {
      this.#layoutUnknown = withoutKeys(layout, new Set(["panX", "panY", "zoom"]));
      const panX = layout.panX;
      const panY = layout.panY;
      const zoom = layout.zoom;
      if (typeof panX === "number" && Number.isFinite(panX)
        && typeof panY === "number" && Number.isFinite(panY)
        && typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0) {
        this.#controller.setLayout({ pan: { x: panX, y: panY }, zoom });
      }
    }

    const selection = data.selection;
    if (selection !== undefined && isObject(selection)) {
      this.#selectionUnknown = withoutKeys(selection, new Set(["corners", "islands"]));
      const corners = readIds(selection.corners);
      const islands = readIds(selection.islands);
      if (corners !== null && islands !== null) {
        this.#selection.replace(corners, islands);
      }
    }
  }

  save(): ExtensionStateContribution {
    this.#assertUsable();
    if (this.#opaque !== undefined) return cloneContribution(this.#opaque);

    const layout = this.#controller.layout();
    const selection = this.#selection.snapshot();
    const data: Record<string, JsonValue> = {
      ...this.#rootUnknown,
      layout: Object.freeze({
        ...this.#layoutUnknown,
        panX: layout.pan.x,
        panY: layout.pan.y,
        zoom: layout.zoom,
      }),
      selection: Object.freeze({
        ...this.#selectionUnknown,
        corners: Object.freeze([...selection.corners].sort((a, b) => a - b)),
        islands: Object.freeze([...selection.islands].sort((a, b) => a - b)),
      }),
    };
    return Object.freeze({
      schemaVersion: UV_EDITOR_STATE_SCHEMA_VERSION,
      data: Object.freeze(data),
      ...(this.#imageAssets === undefined
        ? {}
        : { imageAssets: Object.freeze(this.#imageAssets.map(cloneImageRef)) }),
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
  }

  #resetUnknown(): void {
    this.#rootUnknown = {};
    this.#layoutUnknown = {};
    this.#selectionUnknown = {};
    this.#imageAssets = undefined;
    this.#opaque = undefined;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("UV editor state provider is disposed");
  }
}
