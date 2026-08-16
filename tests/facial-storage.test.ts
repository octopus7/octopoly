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

  it("falls back when saved workspace structure is invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
      version: 1,
      activeMeshId: "missing",
      meshes: [],
    }));

    expect(loadFacialWorkspace(storage)).toEqual(createDefaultFacialWorkspace());
  });
});
