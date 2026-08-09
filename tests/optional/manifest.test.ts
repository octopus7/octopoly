import type { OptionalExtension } from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  defineOptionalManifest,
  OPTIONAL_FEATURE_ORDER,
  type OptionalFeature,
  type OptionalManifestEntry,
} from "../../src/optional";

function entry(feature: OptionalFeature): OptionalManifestEntry {
  return {
    feature,
    create: vi.fn((): OptionalExtension => ({
      id: feature,
      activate: () => ({ status: "activated" }),
      dispose: () => {},
    })),
  };
}

describe("optional manifest", () => {
  it("canonicalizes every one of the 16 selected subsets without constructing extensions", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const selected = OPTIONAL_FEATURE_ORDER.filter((_, index) => (mask & (1 << index)) !== 0);
      const entries = [...selected].reverse().map(entry);
      const manifest = defineOptionalManifest(entries);

      expect(manifest.entries.map(({ feature }) => feature)).toEqual(selected);
      for (const manifestEntry of manifest.entries) {
        expect(manifestEntry.create).not.toHaveBeenCalled();
      }
    }
  });

  it("keeps duplicate entries stable so the runtime can isolate duplicate extension ids", () => {
    const first = entry("lookdev");
    const second = entry("lookdev");
    const manifest = defineOptionalManifest([second, first]);

    expect(manifest.entries.map(({ create }) => create)).toEqual([second.create, first.create]);
  });
});
