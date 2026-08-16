import { describe, expect, it, vi } from "vitest";

import { createFacialController } from "../src/facial/controller";
import { createFacialSession } from "../src/facial/session";
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

describe("facial mode session", () => {
  it("imports OBJ text into the base workspace and autosaves", async () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const geometry = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const parseObjText = vi.fn(() => geometry);
    const session = createFacialSession({ controller, parseObjText });
    const file = { text: vi.fn(async () => "v 0 0 0") } as unknown as File;

    await session.importObj(file);

    expect(parseObjText).toHaveBeenCalledWith("v 0 0 0");
    expect(controller.workspace.meshes[0]?.geometry).toEqual(geometry);
    expect(JSON.parse(storage.values.get(FACIAL_WORKSPACE_STORAGE_KEY) ?? "null"))
      .toEqual(controller.workspace);
  });

  it("rejects parsed geometry that cannot be prepared safely for WebGL", async () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const session = createFacialSession({
      controller,
      parseObjText: () => ({
        positions: [3e38, 3e38, 0, -3e38, 3e38, 0, 3e38, -3e38, 0],
        indices: [0, 1, 2],
      }),
    });

    await expect(session.importObj({ text: async () => "overflow" } as unknown as File))
      .rejects.toThrow(/WebGL/i);
    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
  });

  it("ignores a pending OBJ import after idempotent disposal", async () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    let resolveText!: (source: string) => void;
    const text = new Promise<string>((resolve) => {
      resolveText = resolve;
    });
    const parseObjText = vi.fn(() => ({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    }));
    const session = createFacialSession({ controller, parseObjText });
    const file = { text: vi.fn(() => text) } as unknown as File;
    const before = structuredClone(controller.workspace);

    const pending = session.importObj(file);
    session.dispose();
    session.dispose();
    resolveText("v 0 0 0");
    await pending;

    expect(parseObjText).not.toHaveBeenCalled();
    expect(controller.workspace).toEqual(before);
    expect(storage.values.has(FACIAL_WORKSPACE_STORAGE_KEY)).toBe(false);
  });

  it("absorbs a pending OBJ read rejection after disposal", async () => {
    const controller = createFacialController({
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    let rejectText!: (reason: Error) => void;
    const text = new Promise<string>((_resolve, reject) => {
      rejectText = reject;
    });
    const parseObjText = vi.fn(() => ({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    }));
    const session = createFacialSession({ controller, parseObjText });
    const pending = session.importObj({ text: () => text } as unknown as File);

    session.dispose();
    rejectText(new Error("late read failure"));

    await expect(pending).resolves.toBeUndefined();
    expect(parseObjText).not.toHaveBeenCalled();
  });

  it("keeps the newest OBJ import when reads finish out of order", async () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const resolutions = new Map<string, (source: string) => void>();
    const file = (name: string): File => ({
      text: () => new Promise<string>((resolve) => resolutions.set(name, resolve)),
    }) as unknown as File;
    const firstGeometry = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const secondGeometry = {
      positions: [0, 0, 1, 1, 0, 1, 0, 1, 1],
      indices: [0, 1, 2],
    };
    const parseObjText = vi.fn((source: string) => source === "second" ? secondGeometry : firstGeometry);
    const session = createFacialSession({ controller, parseObjText });

    const first = session.importObj(file("first"));
    const second = session.importObj(file("second"));
    resolutions.get("second")?.("second");
    await second;
    resolutions.get("first")?.("first");
    await first;

    expect(controller.workspace.meshes[0]?.geometry).toEqual(secondGeometry);
    expect(parseObjText).toHaveBeenCalledTimes(1);
    expect(parseObjText).toHaveBeenCalledWith("second");
  });

  it("does not let a pending import erase a newer workspace command", async () => {
    const controller = createFacialController({
      storage: new MemoryStorage(),
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    let resolveText!: (source: string) => void;
    const session = createFacialSession({
      controller,
      parseObjText: vi.fn(() => ({
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
      })),
    });
    const pending = session.importObj({
      text: () => new Promise<string>((resolve) => { resolveText = resolve; }),
    } as unknown as File);

    session.duplicateBase();
    resolveText("late import");
    await pending;

    expect(controller.workspace.activeMeshId).toBe("copy-1");
    expect(controller.workspace.meshes).toHaveLength(2);
  });

  it("delegates base duplication to the workspace controller", () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const session = createFacialSession({
      controller,
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
    });

    session.duplicateBase();

    expect(controller.workspace.activeMeshId).toBe("copy-1");
    expect(controller.workspace.meshes).toHaveLength(2);
  });

  it("delegates active mesh selection to the workspace controller", () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const session = createFacialSession({
      controller,
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
    });
    session.duplicateBase();

    session.selectMesh("base");

    expect(controller.workspace.activeMeshId).toBe("base");
  });

  it("delegates copy renaming to the workspace controller", () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const session = createFacialSession({
      controller,
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
    });
    session.duplicateBase();

    session.renameMesh("copy-1", "Smile");

    expect(controller.workspace.meshes.find((mesh) => mesh.id === "copy-1")?.name).toBe("Smile");
  });

  it("delegates a mesh-qualified vertex pick and axis move", () => {
    const storage = new MemoryStorage();
    const controller = createFacialController({
      storage,
      nextCopyId: () => "copy-1",
      onChange: vi.fn(),
    });
    const session = createFacialSession({
      controller,
      parseObjText: vi.fn(() => ({ positions: [], indices: [] })),
    });
    const before = controller.workspace.meshes[0]?.geometry.positions[0] ?? 0;

    session.selectVertex("base", controller.sceneRevision, 0);
    session.moveVertex("base", controller.sceneRevision, 0, "x", 0.25);

    expect(controller.selectedVertex).toBe(0);
    expect(controller.workspace.meshes[0]?.geometry.positions[0]).toBe(before + 0.25);
  });
});
