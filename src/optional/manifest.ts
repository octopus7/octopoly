import type { OptionalExtension } from "@octopoly/contracts";

export const OPTIONAL_FEATURE_ORDER = Object.freeze([
  "uv",
  "texture-paint",
  "lookdev",
  "matcap",
] as const);

export type OptionalFeature = (typeof OPTIONAL_FEATURE_ORDER)[number];

export interface OptionalManifestEntry {
  readonly feature: OptionalFeature;
  create(): OptionalExtension;
}

export interface OptionalManifest {
  readonly entries: ReadonlyArray<OptionalManifestEntry>;
}

const FEATURE_ORDER = new Map<OptionalFeature, number>(
  OPTIONAL_FEATURE_ORDER.map((feature, index) => [feature, index]),
);

/**
 * Builds a deterministic manifest without importing any concrete extension.
 * Callers statically import only the per-feature manifest entries they select.
 */
export function defineOptionalManifest(
  entries: ReadonlyArray<OptionalManifestEntry>,
): OptionalManifest {
  const indexed = entries.map((entry, index) => {
    const order = FEATURE_ORDER.get(entry.feature);
    if (order === undefined) {
      throw new Error(`Unknown optional feature "${String(entry.feature)}"`);
    }
    if (typeof entry.create !== "function") {
      throw new Error(`Optional feature "${entry.feature}" requires a factory`);
    }
    return { entry, index, order };
  });

  indexed.sort((left, right) => left.order - right.order || left.index - right.index);
  return Object.freeze({
    entries: Object.freeze(indexed.map(({ entry }) => Object.freeze({ ...entry }))),
  });
}
