import type {
  ExtensionStateContribution,
  ExtensionStateProvider,
  ImageAssetRef,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import { ExtensionStateRegistryImpl } from "../../../src/optional-sdk/state";
import { ContractTestStateProvider } from "../../../src/optional-sdk/testkit";

function image(id: string, revision: number, width = 16): ImageAssetRef {
  return { id, revision, width, height: 8, colorSpace: "srgb" };
}

function contribution(
  schemaVersion: number,
  data: ExtensionStateContribution["data"],
  imageAssets?: ReadonlyArray<ImageAssetRef>,
): ExtensionStateContribution {
  return imageAssets === undefined
    ? { schemaVersion, data }
    : { schemaVersion, data, imageAssets };
}

describe("ExtensionStateRegistryImpl", () => {
  it("hydrates registered providers while preserving unknown versioned contributions", async () => {
    const registry = new ExtensionStateRegistryImpl();
    const known = new ContractTestStateProvider("known");
    registry.register(known);
    const unknownData = { nested: [1, "two", true] };
    const values = {
      known: contribution(2, { enabled: true }, [image("shared", 3)]),
      future: contribution(7, unknownData, [image("future", 1)]),
    };

    await registry.load(values);
    unknownData.nested.push("mutated after load");
    const saved = registry.save();

    expect(known.loaded).toHaveLength(1);
    expect(saved.values).toEqual({
      future: contribution(7, { nested: [1, "two", true] }, [image("future", 1)]),
      known: contribution(2, { enabled: true }, [image("shared", 3)]),
    });
    expect(saved.imageAssets).toEqual([image("future", 1), image("shared", 3)]);
    registry.dispose();
  });

  it("deduplicates identical image revisions and retains distinct revisions", async () => {
    const registry = new ExtensionStateRegistryImpl();
    await registry.load({
      first: contribution(1, null, [image("paint", 2), image("paint", 3)]),
      second: contribution(1, null, [image("paint", 2)]),
    });

    expect(registry.save().imageAssets).toEqual([image("paint", 2), image("paint", 3)]);
    registry.dispose();
  });

  it("rejects conflicting metadata for the same image revision", async () => {
    const registry = new ExtensionStateRegistryImpl();
    await registry.load({
      first: contribution(1, null, [image("paint", 2, 16)]),
      second: contribution(1, null, [image("paint", 2, 32)]),
    });

    expect(() => registry.save()).toThrow(/Conflicting metadata/);
    registry.dispose();
  });

  it("preserves a provider contribution as unknown when the provider is unregistered", async () => {
    const registry = new ExtensionStateRegistryImpl();
    const provider = new ContractTestStateProvider(
      "optional.paint",
      contribution(4, { mode: "brush" }, [image("brush", 5)]),
    );
    registry.register(provider);

    registry.unregister(provider.id);

    expect(provider.disposed()).toBe(true);
    expect(registry.save()).toEqual({
      values: {
        "optional.paint": contribution(4, { mode: "brush" }, [image("brush", 5)]),
      },
      imageAssets: [image("brush", 5)],
    });
    registry.dispose();
  });

  it("leaves the prior unknown snapshot intact when provider hydration fails", async () => {
    const registry = new ExtensionStateRegistryImpl();
    await registry.load({ future: contribution(1, { stable: true }) });
    const broken: ExtensionStateProvider = {
      id: "broken",
      load: vi.fn(() => { throw new Error("migration failed"); }),
      save: () => undefined,
      dispose: vi.fn(),
    };
    registry.register(broken);

    await expect(registry.load({
      future: contribution(2, { stable: false }),
      broken: contribution(1, null),
    })).rejects.toThrow("migration failed");

    expect(registry.save().values).toEqual({ future: contribution(1, { stable: true }) });
    registry.dispose();
  });

  it("disposes owned providers once in reverse registration order", () => {
    const calls: string[] = [];
    const registry = new ExtensionStateRegistryImpl();
    const createProvider = (id: string): ExtensionStateProvider => ({
      id,
      load: () => {},
      save: () => undefined,
      dispose: () => { calls.push(id); },
    });
    registry.register(createProvider("first"));
    registry.register(createProvider("second"));
    registry.register(createProvider("third"));

    registry.dispose();
    registry.dispose();

    expect(calls).toEqual(["third", "second", "first"]);
  });
});
