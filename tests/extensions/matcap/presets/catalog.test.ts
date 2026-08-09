import { describe, expect, it } from "vitest";

import {
  MATCAP_DEFAULT_PRESET_ID,
  MATCAP_PRESET_IDS,
  MatcapPresetCatalog,
  createMatcapPresetBlob,
  isMatcapPresetId,
} from "../../../../src/extensions/matcap/presets";

describe("MatCap preset catalog", () => {
  it("publishes stable IDs and deeply immutable metadata", () => {
    expect(MATCAP_DEFAULT_PRESET_ID).toBe("clay");
    expect(MATCAP_PRESET_IDS).toEqual([
      "clay",
      "neutral-gray",
      "metallic",
      "soft",
      "high-contrast",
    ]);
    expect(Object.isFrozen(MATCAP_PRESET_IDS)).toBe(true);
    expect(Object.isFrozen(MatcapPresetCatalog)).toBe(true);

    for (const id of MATCAP_PRESET_IDS) {
      const preset = MatcapPresetCatalog[id];
      expect(Object.isFrozen(preset)).toBe(true);
      expect(preset).toMatchObject({
        id,
        width: 256,
        height: 256,
        colorSpace: "srgb",
        mimeType: "image/svg+xml",
        estimatedRgbaBytes: 256 * 256 * 4,
      });
    }

    expect(() => {
      (MatcapPresetCatalog.clay as { label: string }).label = "Changed";
    }).toThrow();
  });

  it("recognizes only canonical preset IDs", () => {
    expect(isMatcapPresetId("metallic")).toBe(true);
    expect(isMatcapPresetId("Metallic")).toBe(false);
    expect(isMatcapPresetId("toString")).toBe(false);
  });

  it("creates fresh deterministic code-native SVG blobs", async () => {
    const first = createMatcapPresetBlob("high-contrast");
    const second = createMatcapPresetBlob("high-contrast");

    expect(first).not.toBe(second);
    expect(first.type).toBe("image/svg+xml");
    expect(await first.text()).toBe(await second.text());
    expect(await first.text()).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(await first.text()).toContain("<radialGradient");
  });
});
