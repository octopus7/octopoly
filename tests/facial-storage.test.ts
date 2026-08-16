import { describe, expect, it } from "vitest";

import { duplicateBaseMesh, moveVertex } from "../src/facial/workspace";
import {
  FACIAL_WORKSPACE_STORAGE_KEY,
  loadFacialWorkspace,
  saveFacialWorkspace,
} from "../src/facial/storage";
import { createDefaultFacialWorkspace } from "../src/facial/workspace";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("facial workspace storage", () => {
  it("round-trips copied meshes and vertex edits", () => {
    const storage = new MemoryStorage();
    const duplicated = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const workspace = moveVertex(duplicated, "copy-1", 0, "z", 0.25);

    saveFacialWorkspace(storage, workspace);
    const restored = loadFacialWorkspace(storage);

    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(true);
    expect(restored).toEqual(workspace);
    expect(restored).not.toBe(workspace);
  });

  it("falls back to the placeholder when saved JSON is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, "{not-json");

    expect(loadFacialWorkspace(storage)).toEqual(createDefaultFacialWorkspace());
  });

  it("falls back when reading storage throws", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };

    expect(loadFacialWorkspace(storage)).toEqual(createDefaultFacialWorkspace());
  });

  it("falls back when saved workspace structure is invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
      version: 1,
      activeMeshId: "missing",
      meshes: [],
    }));

    expect(loadFacialWorkspace(storage)).toEqual(createDefaultFacialWorkspace());
  });

  it("falls back when a saved coordinate overflows Float32", () => {
    const storage = new MemoryStorage();
    const workspace = createDefaultFacialWorkspace();
    const invalid = structuredClone(workspace);
    invalid.meshes[0]!.geometry.positions[0] = Number.MAX_VALUE;
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify(invalid));

    expect(loadFacialWorkspace(storage)).toEqual(createDefaultFacialWorkspace());
  });

  it.each([
    ["id", "renamed-base"],
    ["name", "Renamed Base"],
  ] as const)("falls back when the saved base %s is not canonical", (property, value) => {
    const storage = new MemoryStorage();
    const invalid = structuredClone(createDefaultFacialWorkspace());
    Object.assign(invalid.meshes[0]!, { [property]: value });
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify(invalid));

    expect(loadFacialWorkspace(storage)).toEqual(createDefaultFacialWorkspace());
  });
});
