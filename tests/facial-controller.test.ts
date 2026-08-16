import { describe, expect, it, vi } from "vitest";

import { createFacialController, FacialPersistenceError } from "../src/facial/controller";
import { FACIAL_WORKSPACE_STORAGE_KEY } from "../src/facial/storage";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("facial workspace controller", () => {
  it("duplicates the base, publishes the new active copy, and autosaves", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });

    controller.duplicateBase();

    expect(controller.workspace.activeMeshId).toBe("copy-1");
    expect(controller.workspace.meshes).toHaveLength(2);
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY) ?? "null"))
      .toEqual(controller.workspace);
    expect(onChange).toHaveBeenCalledWith(controller.workspace, null);
  });

  it("keeps the previous state when autosave throws", () => {
    const onChange = vi.fn();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    const before = controller.workspace;

    expect(() => controller.duplicateBase()).toThrow(FacialPersistenceError);
    expect(controller.workspace).toBe(before);
    expect(controller.sceneRevision).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the base vertex selection when duplicating into a new active mesh", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.selectVertex("base", controller.sceneRevision, 0);

    controller.duplicateBase();

    expect(controller.workspace.activeMeshId).toBe("copy-1");
    expect(controller.selectedVertex).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(controller.workspace, null);
  });

  it("publishes one selected vertex without writing workspace storage", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });

    controller.selectVertex("base", controller.sceneRevision, 4);

    expect(controller.selectedVertex).toBe(4);
    expect(onChange).toHaveBeenCalledWith(controller.workspace, 4);
    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
  });

  it.each([-1, 1.5, 9999])("ignores invalid vertex selection %s", (vertexIndex) => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });

    controller.selectVertex("base", controller.sceneRevision, vertexIndex);

    expect(controller.selectedVertex).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a stale vertex pick from a non-active mesh", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.duplicateBase();
    controller.selectMesh("base");
    onChange.mockClear();

    controller.selectVertex("copy-1", controller.sceneRevision, 0);

    expect(controller.selectedVertex).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the selected vertex on one axis and autosaves the edit", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    const before = controller.workspace.meshes[0]?.geometry.positions[0];
    controller.selectVertex("base", controller.sceneRevision, 0);

    controller.moveVertex("base", controller.sceneRevision, 0, "x", 0.25);

    expect(controller.workspace.meshes[0]?.geometry.positions[0]).toBe((before ?? 0) + 0.25);
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY) ?? "null"))
      .toEqual(controller.workspace);
    expect(onChange).toHaveBeenLastCalledWith(controller.workspace, 0);
  });

  it("ignores a stale vertex move after the active mesh changes", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.duplicateBase();
    controller.selectVertex("copy-1", controller.sceneRevision, 0);
    controller.selectMesh("base");
    const before = structuredClone(controller.workspace);
    const savedBefore = storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY);
    onChange.mockClear();

    controller.moveVertex("copy-1", controller.sceneRevision, 0, "x", 0.25);

    expect(controller.workspace).toEqual(before);
    expect(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(savedBefore);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not autosave a vertex move that overflows Float32", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.selectVertex("base", controller.sceneRevision, 0);
    onChange.mockClear();

    controller.moveVertex("base", controller.sceneRevision, 0, "x", Number.MAX_VALUE);

    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("switches the active mesh, clears vertex selection, and autosaves", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.duplicateBase();
    controller.selectVertex("copy-1", controller.sceneRevision, 2);

    controller.selectMesh("base");

    expect(controller.workspace.activeMeshId).toBe("base");
    expect(controller.selectedVertex).toBeNull();
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY) ?? "null"))
      .toEqual(controller.workspace);
    expect(onChange).toHaveBeenLastCalledWith(controller.workspace, null);
  });

  it("renames a copy and autosaves the trimmed name", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.duplicateBase();

    controller.renameMesh("copy-1", "  Smile  ");

    expect(controller.workspace.meshes.find((mesh) => mesh.id === "copy-1")?.name).toBe("Smile");
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY) ?? "null"))
      .toEqual(controller.workspace);
    expect(onChange).toHaveBeenLastCalledWith(controller.workspace, null);
  });

  it("does not autosave an immutable base rename request", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });

    controller.renameMesh("base", "Changed Base");

    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("replaces the base geometry, removes copies and selection, and autosaves", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.duplicateBase();
    controller.selectVertex("copy-1", controller.sceneRevision, 1);
    const geometry = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };

    controller.replaceBase(geometry);

    expect(controller.workspace.activeMeshId).toBe("base");
    expect(controller.workspace.meshes).toHaveLength(1);
    expect(controller.workspace.meshes[0]?.name).toBe("Base Mask");
    expect(controller.selectedVertex).toBeNull();
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY) ?? "null"))
      .toEqual(controller.workspace);
    expect(onChange).toHaveBeenLastCalledWith(controller.workspace, null);
  });

  it("ignores a stale base pick from before geometry replacement", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    const revisionAware = controller as unknown as {
      selectVertex(meshId: string, sceneRevision: number, vertexIndex: number | null): void;
    };
    controller.replaceBase({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    });
    onChange.mockClear();

    revisionAware.selectVertex("base", 0, 0);

    expect(controller.selectedVertex).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores commands after idempotent disposal", () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange,
    });
    controller.duplicateBase();
    controller.selectVertex("copy-1", controller.sceneRevision, 0);
    const before = structuredClone(controller.workspace);
    const selectedBefore = controller.selectedVertex;
    const savedBefore = storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY);
    onChange.mockClear();

    controller.dispose();
    controller.dispose();
    controller.duplicateBase();
    controller.selectVertex("copy-1", controller.sceneRevision, 1);
    controller.selectMesh("base");
    controller.renameMesh("copy-1", "Late Rename");
    controller.replaceBase({ positions: [0, 0, 0], indices: [] });
    controller.moveVertex("copy-1", controller.sceneRevision, 0, "x", 0.25);

    expect(controller.workspace).toEqual(before);
    expect(controller.selectedVertex).toBe(selectedBefore);
    expect(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(savedBefore);
    expect(onChange).not.toHaveBeenCalled();
  });
});
