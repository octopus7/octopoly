import { MatcapExtension } from "../../extensions/matcap";
import type { OptionalManifestEntry } from "../manifest";

export const MATCAP_OPTIONAL_MANIFEST_ENTRY: OptionalManifestEntry = Object.freeze({
  feature: "matcap",
  create: () => new MatcapExtension(),
});
