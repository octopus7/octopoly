import { createUvEditorExtension, type UvEditorExtensionOptions } from "../../extensions/uv";
import type { OptionalManifestEntry } from "../manifest";

export function createUvManifestEntry(
  options?: UvEditorExtensionOptions,
): OptionalManifestEntry {
  return Object.freeze({
    feature: "uv",
    create: () => createUvEditorExtension(options),
  });
}

export const UV_OPTIONAL_MANIFEST_ENTRY = createUvManifestEntry();
