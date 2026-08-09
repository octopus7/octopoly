import type { ImageAssetRef } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import {
  createLookdevMaterial,
  DEFAULT_LOOKDEV_MATERIAL_ID,
  LookdevMaterialStore,
} from "../../../../src/extensions/lookdev/material";

function image(overrides: Partial<ImageAssetRef> = {}): ImageAssetRef {
  return {
    id: "texture-0",
    revision: 2,
    width: 512,
    height: 256,
    colorSpace: "srgb",
    ...overrides,
  };
}

describe("lookdev material", () => {
  it("creates finite immutable defaults suitable for uniforms", () => {
    const material = createLookdevMaterial();

    expect(material).toEqual({
      id: DEFAULT_LOOKDEV_MATERIAL_ID,
      baseColor: { x: 0.8, y: 0.8, z: 0.8 },
      metallic: 0,
      roughness: 0.5,
      normalScale: 1,
      emissive: { x: 0, y: 0, z: 0 },
      opacity: 1,
      textures: {},
    });
    expect(Object.isFrozen(material)).toBe(true);
    expect(Object.isFrozen(material.baseColor)).toBe(true);
    expect(Object.isFrozen(material.emissive)).toBe(true);
    expect(Object.isFrozen(material.textures)).toBe(true);
    expect([
      ...Object.values(material.baseColor),
      material.metallic,
      material.roughness,
      material.normalScale,
      ...Object.values(material.emissive),
      material.opacity,
    ].every(Number.isFinite)).toBe(true);
  });

  it("defaults non-finite values and clamps finite values to safe channel ranges", () => {
    const material = createLookdevMaterial({
      id: "material-0",
      baseColor: { x: -1, y: Number.NaN, z: 2 },
      metallic: Number.POSITIVE_INFINITY,
      roughness: -3,
      normalScale: 50,
      emissive: { x: -1, y: 4, z: Number.NEGATIVE_INFINITY },
      opacity: 8,
    });

    expect(material).toMatchObject({
      id: "material-0",
      baseColor: { x: 0, y: 0.8, z: 1 },
      metallic: 0,
      roughness: 0.04,
      normalScale: 2,
      emissive: { x: 0, y: 4, z: 0 },
      opacity: 1,
    });
  });

  it("clones valid ImageAssetRef texture slots and omits invalid slots", () => {
    const baseColor = image();
    const normal = image({ id: "normal", revision: 7, colorSpace: "linear" });
    const material = createLookdevMaterial({
      textures: {
        baseColor,
        normal,
        metallic: image({ revision: -1 }),
        roughness: image({ width: 0 }),
        emissive: image({ id: "" }),
        opacity: image({ colorSpace: "invalid" as "srgb" }),
      },
    });

    expect(material.textures).toEqual({ baseColor, normal });
    expect(material.textures.baseColor).not.toBe(baseColor);
    expect(material.textures.normal).not.toBe(normal);
    expect(Object.isFrozen(material.textures.baseColor)).toBe(true);
    expect(Object.isFrozen(material.textures.normal)).toBe(true);

    (baseColor as unknown as { revision: number }).revision = 99;
    expect(material.textures.baseColor?.revision).toBe(2);
  });
});

describe("LookdevMaterialStore", () => {
  it("stores normalized snapshots and resolves missing ids to the default", () => {
    const store = new LookdevMaterialStore([
      { id: "paint", metallic: 0.75 },
    ]);

    expect(store.get("paint")?.metallic).toBe(0.75);
    expect(store.get("missing")).toBeNull();
    expect(store.snapshot("paint")).toBe(store.get("paint"));
    expect(store.snapshot("missing").id).toBe(DEFAULT_LOOKDEV_MATERIAL_ID);
    expect(store.snapshot().id).toBe(DEFAULT_LOOKDEV_MATERIAL_ID);
  });

  it("replaces snapshots without exposing mutable collections or caller values", () => {
    const baseColor = { x: 0.1, y: 0.2, z: 0.3 };
    const store = new LookdevMaterialStore();
    const first = store.set({ id: "paint", baseColor });

    baseColor.x = 1;
    expect(first.baseColor.x).toBe(0.1);

    const second = store.set({ id: "paint", roughness: 0.8 });
    expect(second).not.toBe(first);
    expect(store.get("paint")).toBe(second);
    expect(Object.isFrozen(store.list())).toBe(true);
    expect(store.list()).toEqual([second]);

    expect(store.remove("paint")).toBe(true);
    expect(store.remove("paint")).toBe(false);
    store.set({ id: "other" });
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("allows an explicit default material to override the built-in fallback", () => {
    const store = new LookdevMaterialStore();
    const replacement = store.set({
      id: DEFAULT_LOOKDEV_MATERIAL_ID,
      baseColor: { x: 1, y: 0, z: 0 },
    });

    expect(store.snapshot()).toBe(replacement);
    expect(store.snapshot("missing")).toBe(replacement);
  });
});
