import {
  TexturePaintExtension,
  type TexturePaintExtensionOptions,
} from "../../extensions/texture-paint";
import type { OptionalManifestEntry } from "../manifest";

export function createTexturePaintManifestEntry(
  options?: TexturePaintExtensionOptions,
): OptionalManifestEntry {
  return Object.freeze({
    feature: "texture-paint",
    create: () => new TexturePaintExtension(options),
  });
}

export const TEXTURE_PAINT_OPTIONAL_MANIFEST_ENTRY = createTexturePaintManifestEntry();
