// Loader-only entrypoint: intentionally does not import concrete extensions or the full manifest.
export {
  createOptionalComposition,
  OptionalComposition,
  type OptionalActivationRecord,
  type OptionalStartupReport,
} from "./loader";
export {
  defineOptionalManifest,
  OPTIONAL_FEATURE_ORDER,
  type OptionalFeature,
  type OptionalManifest,
  type OptionalManifestEntry,
} from "./manifest";
export type { OwnerResourceSnapshot } from "./owner-scope";
