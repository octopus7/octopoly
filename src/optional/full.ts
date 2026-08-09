import type { ExtensionHost } from "@octopoly/contracts";

import { createOptionalComposition } from "./loader";
import { defineOptionalManifest } from "./manifest";
import { LOOKDEV_OPTIONAL_MANIFEST_ENTRY } from "./manifests/lookdev";
import { MATCAP_OPTIONAL_MANIFEST_ENTRY } from "./manifests/matcap";
import { TEXTURE_PAINT_OPTIONAL_MANIFEST_ENTRY } from "./manifests/texture-paint";
import { UV_OPTIONAL_MANIFEST_ENTRY } from "./manifests/uv";

/** Explicit full-product boundary. Importing this module statically selects all extensions. */
export const FULL_OPTIONAL_MANIFEST = defineOptionalManifest([
  UV_OPTIONAL_MANIFEST_ENTRY,
  TEXTURE_PAINT_OPTIONAL_MANIFEST_ENTRY,
  LOOKDEV_OPTIONAL_MANIFEST_ENTRY,
  MATCAP_OPTIONAL_MANIFEST_ENTRY,
]);

export function createFullOptionalComposition(host: ExtensionHost) {
  return createOptionalComposition(host, FULL_OPTIONAL_MANIFEST);
}
