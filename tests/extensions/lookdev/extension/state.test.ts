import { describe, expect, it } from "vitest";

import type { ExtensionStateContribution, ImageAssetRef } from "@octopoly/contracts";
import { LookdevMaterialStore } from "../../../../src/extensions/lookdev/material";
import {
  LOOKDEV_STATE_SCHEMA_VERSION,
  LookdevController,
  LookdevStateProvider,
} from "../../../../src/extensions/lookdev/extension";
import { LOOKDEV_REALTIME_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/realtime";
import { LOOKDEV_QUALITY_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/quality";
import {
  ContractTestRenderControl,
  ContractTestRenderExtensionRegistry,
} from "../../../../src/optional-sdk/testkit";
import { QUALITY_CAPABILITIES, TrackingProvider } from "./fakes";

describe("LookdevStateProvider", () => {
  it("migrates schema v1 while preserving exact image revisions", () => {
    const { controller, materials, provider, registry } = fixture();
    const contribution: ExtensionStateContribution = Object.freeze({
      schemaVersion: 1,
      data: Object.freeze({
        activePreset: "quality",
        material: Object.freeze({
          id: "painted",
          baseColor: Object.freeze({ x: 0.2, y: 0.4, z: 0.6 }),
          metallic: 0.75,
          roughness: 0.2,
          textures: Object.freeze({ baseColor: jsonImage("paint", 7) }),
        }),
      }),
      imageAssets: Object.freeze([image("paint", 7)]),
    });

    provider.load(contribution);

    expect(controller.preset()).toBe("quality");
    expect(materials.get("painted")).toMatchObject({
      metallic: 0.75,
      textures: { baseColor: { id: "paint", revision: 7 } },
    });
    expect(provider.save()).toMatchObject({
      schemaVersion: LOOKDEV_STATE_SCHEMA_VERSION,
      data: { preset: "quality" },
      imageAssets: [{ id: "paint", revision: 7 }],
    });
    provider.dispose();
    controller.dispose();
    registry.dispose();
  });

  it("sorts material state and deterministically dedupes contributed image revisions", () => {
    const { controller, materials, provider, registry } = fixture();
    const shared = image("z-shared", 9);
    materials.set({
      id: "z-material",
      textures: { baseColor: shared, roughness: shared },
    });
    materials.set({
      id: "a-material",
      textures: { normal: image("a-normal", 3), emissive: shared },
    });
    const first = provider.save();
    const second = provider.save();

    expect(first).toEqual(second);
    expect(first.imageAssets).toEqual([image("a-normal", 3), shared]);
    expect(first.data).toMatchObject({
      materials: [{ id: "a-material" }, { id: "z-material" }],
    });
    provider.dispose();
    controller.dispose();
    registry.dispose();
  });

  it("preserves a future schema contribution verbatim instead of losing unknown data", () => {
    const { controller, materials, provider, registry } = fixture();
    materials.set({ id: "existing", metallic: 0.5 });
    const future: ExtensionStateContribution = Object.freeze({
      schemaVersion: 99,
      data: Object.freeze({ futurePreset: "spectral", nested: Object.freeze([1, 2, 3]) }),
      imageAssets: Object.freeze([image("future", 42)]),
    });

    provider.load(future);

    expect(provider.save()).toBe(future);
    expect(materials.get("existing")).not.toBeNull();
    provider.dispose();
    controller.dispose();
    registry.dispose();
  });

  it("rejects conflicting metadata for one contributed id/revision before state publication", () => {
    const { controller, materials, provider, registry } = fixture();
    materials.set({ id: "first", textures: { baseColor: image("same", 2, 16) } });
    materials.set({ id: "second", textures: { normal: image("same", 2, 32) } });

    expect(() => provider.save()).toThrow(/Conflicting metadata/);
    provider.dispose();
    controller.dispose();
    registry.dispose();
  });
});

function fixture(): {
  readonly controller: LookdevController;
  readonly materials: LookdevMaterialStore;
  readonly provider: LookdevStateProvider;
  readonly registry: ContractTestRenderExtensionRegistry;
} {
  const registry = new ContractTestRenderExtensionRegistry(QUALITY_CAPABILITIES);
  registry.register(new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID));
  registry.register(new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID));
  const controller = new LookdevController(
    registry,
    new ContractTestRenderControl(QUALITY_CAPABILITIES),
  );
  const materials = new LookdevMaterialStore();
  return {
    controller,
    materials,
    provider: new LookdevStateProvider(materials, controller),
    registry,
  };
}

function image(id: string, revision: number, width = 16): ImageAssetRef {
  return Object.freeze({
    id,
    revision,
    width,
    height: 16,
    colorSpace: "srgb",
  });
}

function jsonImage(id: string, revision: number, width = 16) {
  return Object.freeze({
    id,
    revision,
    width,
    height: 16,
    colorSpace: "srgb",
  });
}
