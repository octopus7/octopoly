import type { RendererCapabilities } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { createFullOptionalComposition } from "../../src/optional/full";
import { createContractTestExtensionHost } from "../../src/optional-sdk/testkit";
import type { LookdevExtension } from "../../src/extensions/lookdev";
import type { TexturePaintExtension } from "../../src/extensions/texture-paint";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 64 * 1024 * 1024,
  applicationGpuBudgetBytes: 128 * 1024 * 1024,
});

describe("full optional manifest", () => {
  it("activates all concrete extensions in product order without activation-time shading theft", async () => {
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const composition = createFullOptionalComposition(host);

    const report = await composition.start();

    expect(report.activations.map(({ feature, status }) => ({ feature, status }))).toEqual([
      { feature: "uv", status: "activated" },
      { feature: "texture-paint", status: "activated" },
      { feature: "lookdev", status: "activated" },
      { feature: "matcap", status: "activated" },
    ]);
    expect(report.active).toHaveLength(4);
    expect(host.shading.active()).toBeNull();
    expect(composition.resources().every(({ total }) => total > 0)).toBe(true);

    const lookdev = composition.extension<LookdevExtension>("octopoly.lookdev");
    lookdev?.controller()?.setPreset("quality");
    expect(host.shading.active()).toBe("octopoly.lookdev.quality");

    const paint = composition.extension<TexturePaintExtension>("texture-paint");
    paint?.setPreviewEnabled(true);
    expect(host.shading.active()).toBeNull();
    paint?.setPreviewEnabled(false);
    expect(host.shading.active()).toBe("octopoly.lookdev.quality");

    composition.dispose();
    expect(composition.resources().every(({ total }) => total === 0)).toBe(true);
    expect(composition.resources().flatMap(({ cleanupErrors }) => cleanupErrors)).toEqual([]);
  });
});
