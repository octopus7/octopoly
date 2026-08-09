import type {
  ExtensionStateContribution,
  ImageAssetRef,
  RendererCapabilities,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import {
  MATCAP_EXTENSION_ID,
  MATCAP_PANEL_ID,
  MatcapExtension,
} from "../../../../src/extensions/matcap/extension";
import {
  MATCAP_STATE_SCHEMA_VERSION,
} from "../../../../src/extensions/matcap/controller";
import { MATCAP_SHADING_PROVIDER_ID } from "../../../../src/extensions/matcap/webgl2";
import {
  createContractTestExtensionHost,
  createExtensionRuntime,
} from "../../../../src/optional-sdk";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 32 * 1024 * 1024,
  applicationGpuBudgetBytes: 64 * 1024 * 1024,
});

function createHost() {
  return createContractTestExtensionHost({
    capabilities: CAPABILITIES,
    images: { importWidth: 256, importHeight: 256, colorSpace: "srgb" },
  });
}

function image(id: string, revision = 0): ImageAssetRef {
  return Object.freeze({
    id,
    revision,
    width: 256,
    height: 256,
    colorSpace: "srgb",
  });
}

function customState(ref: ImageAssetRef, enabled = true): ExtensionStateContribution {
  return Object.freeze({
    schemaVersion: MATCAP_STATE_SCHEMA_VERSION,
    data: Object.freeze({
      enabled,
      selection: Object.freeze({
        kind: "custom",
        image: Object.freeze({ ...ref }),
      }),
    }),
    imageAssets: Object.freeze([ref]),
  });
}

describe("MatCap optional integration", () => {
  it("deactivation removes MatCap and returns to Core fallback without deleting persistent images", async () => {
    const host = createHost();
    const runtime = createExtensionRuntime(host);

    await expect(runtime.activate(new MatcapExtension())).resolves.toEqual({ status: "activated" });
    const importedPreset = host.images.current("contract-test-image-1");
    expect(importedPreset).not.toBeNull();

    const container = document.createElement("div");
    host.panels.get(MATCAP_PANEL_ID)?.mount(container, host.panelContext());
    const enabled = container.querySelector<HTMLInputElement>("[data-matcap-enabled]");
    expect(enabled).not.toBeNull();
    enabled!.checked = true;
    enabled!.dispatchEvent(new Event("change"));
    expect(host.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);

    runtime.deactivate(MATCAP_EXTENSION_ID);

    expect(host.shading.active()).toBeNull();
    expect(host.shading.get(MATCAP_SHADING_PROVIDER_ID)).toBeNull();
    expect(host.panels.get(MATCAP_PANEL_ID)).toBeNull();
    expect(host.images.current("contract-test-image-1")).toEqual(importedPreset);
    runtime.dispose();
  });

  it("restores one custom revision while preserving unknown state and deduping bundle refs", async () => {
    const host = createHost();
    const custom = host.images.seed(image("saved-matcap", 7));
    const extension = new MatcapExtension();
    await extension.activate(host);
    const unknown = Object.freeze({
      schemaVersion: 42,
      data: Object.freeze({ feature: "future" }),
      imageAssets: Object.freeze([custom, custom]),
    });

    await host.state.load(Object.freeze({
      [MATCAP_EXTENSION_ID]: customState(custom),
      "future.extension": unknown,
    }));
    const saved = host.state.save();

    expect(saved.values[MATCAP_EXTENSION_ID]).toEqual(customState(custom));
    expect(saved.values["future.extension"]).toEqual(unknown);
    expect(saved.imageAssets).toEqual([custom]);

    extension.dispose();
    host.dispose();
  });

  it("retains the built-in preset when a restored custom image cannot be decoded", async () => {
    const host = createHost();
    const extension = new MatcapExtension();
    await extension.activate(host);
    const missing = image("missing-custom", 3);

    await expect(host.state.load(Object.freeze({
      [MATCAP_EXTENSION_ID]: customState(missing),
    }))).resolves.toBeUndefined();

    const saved = host.state.save().values[MATCAP_EXTENSION_ID];
    expect(saved).toMatchObject({
      data: {
        enabled: true,
        selection: { kind: "preset", presetId: "clay" },
      },
    });
    expect(saved).not.toHaveProperty("imageAssets");
    expect(host.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);

    extension.dispose();
    host.dispose();
  });
});
