import { LookdevExtension, type LookdevExtensionOptions } from "../../extensions/lookdev";
import type { OptionalManifestEntry } from "../manifest";

export function createLookdevManifestEntry(
  options?: LookdevExtensionOptions,
): OptionalManifestEntry {
  return Object.freeze({
    feature: "lookdev",
    create: () => new LookdevExtension(options),
  });
}

export const LOOKDEV_OPTIONAL_MANIFEST_ENTRY = createLookdevManifestEntry();
