import type { RendererCapabilities } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { LOOKDEV_EXTENSION_ID } from "../../../src/extensions/lookdev";
import { MATCAP_EXTENSION_ID } from "../../../src/extensions/matcap";
import { TEXTURE_PAINT_EXTENSION_ID } from "../../../src/extensions/texture-paint";
import { UV_EDITOR_EXTENSION_ID } from "../../../src/extensions/uv";
import {
  createOptionalComposition,
  defineOptionalManifest,
  type OptionalFeature,
  type OptionalManifestEntry,
} from "../../../src/optional";
import { LOOKDEV_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/lookdev";
import { MATCAP_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/matcap";
import { TEXTURE_PAINT_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/texture-paint";
import { UV_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/uv";
import { createContractTestExtensionHost } from "../../../src/optional-sdk";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 8192,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 512 * 1024 * 1024,
  applicationGpuBudgetBytes: 256 * 1024 * 1024,
});

const ENTRIES: ReadonlyArray<OptionalManifestEntry> = Object.freeze([
  UV_OPTIONAL_MANIFEST_ENTRY,
  TEXTURE_PAINT_OPTIONAL_MANIFEST_ENTRY,
  LOOKDEV_OPTIONAL_MANIFEST_ENTRY,
  MATCAP_OPTIONAL_MANIFEST_ENTRY,
]);

const IDS: Readonly<Record<OptionalFeature, string>> = Object.freeze({
  uv: UV_EDITOR_EXTENSION_ID,
  "texture-paint": TEXTURE_PAINT_EXTENSION_ID,
  lookdev: LOOKDEV_EXTENSION_ID,
  matcap: MATCAP_EXTENSION_ID,
});

const COMBINATIONS = Object.freeze(Array.from({ length: 16 }, (_, value) => {
  const bits = value.toString(2).padStart(4, "0");
  const entries = ENTRIES.filter((_entry, index) => bits[index] === "1");
  return Object.freeze({ bits, entries });
}));

describe("16-combination Optional composition matrix", () => {
  it.each(COMBINATIONS)("$bits activates deterministically and releases every owned resource", async ({ entries }) => {
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      images: { importWidth: 256, importHeight: 256 },
    });
    // Reverse input proves defineOptionalManifest, not caller order, owns determinism.
    const manifest = defineOptionalManifest([...entries].reverse());
    const composition = createOptionalComposition(host, manifest);
    const report = await composition.start();
    const expectedFeatures = entries.map((entry) => entry.feature);
    const expectedIds = expectedFeatures.map((feature) => IDS[feature]);

    expect(report.activations.map((record) => record.feature)).toEqual(expectedFeatures);
    expect(report.activations.every((record) => record.status === "activated")).toBe(true);
    expect(report.active).toEqual(expectedIds);
    expect(composition.active()).toEqual(expectedIds);
    expect(composition.resources()).toHaveLength(entries.length);
    expect(composition.resources().every((resource) => resource.cleanupErrors.length === 0)).toBe(true);
    // Registration alone never steals the shared global mode.
    expect(host.shading.active()).toBeNull();

    composition.dispose();
    composition.dispose();
    expect(composition.active()).toEqual([]);
    expect(composition.resources()).toEqual(entries.map((entry) => expect.objectContaining({
      ownerId: IDS[entry.feature],
      total: 0,
      cleanupErrors: [],
    })));
    expect(composition.cleanupErrors()).toEqual([]);
  });
});
