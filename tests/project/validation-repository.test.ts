import { describe, expect, it } from "vitest";
import { ProjectRepository } from "../../src/project/repository";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  migrateProjectDocument,
  validateProjectDocument,
} from "../../src/project/validation";
import { MemoryProjectStorage } from "./fakes";
import { meshFixture, projectFixture } from "./fixtures";

describe("project validation and persistence", () => {
  it("migrates legacy image metadata and preserves unknown extension keys", () => {
    const migrated = migrateProjectDocument({
      schemaVersion: 1,
      mesh: meshFixture,
      referenceAssets: [],
      imageAssets: [{ id: "legacy", width: 2, height: 3, colorSpace: "srgb" }],
      extensionData: {
        "unrecognized.vendor": {
          schemaVersion: 17,
          data: { nested: [1, true, null, { value: "kept" }] },
          imageAssets: [{ id: "extension-image", width: 1, height: 1, colorSpace: "linear" }],
        },
      },
    });
    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(migrated.imageAssets[0]?.revision).toBe(0);
    expect(migrated.extensionData?.["unrecognized.vendor"]?.data).toEqual({
      nested: [1, true, null, { value: "kept" }],
    });
    expect(migrated.extensionData?.["unrecognized.vendor"]?.imageAssets?.[0]?.revision).toBe(0);
  });

  it("rejects unsupported versions, non-finite geometry, and malformed topology", () => {
    expect(() => migrateProjectDocument({ ...projectFixture, schemaVersion: 999 })).toThrow(/Unsupported/u);
    expect(() => validateProjectDocument({
      ...projectFixture,
      mesh: {
        ...meshFixture,
        vertices: [{ id: 1, position: { x: Number.NaN, y: 0, z: 0 } }],
      },
    })).toThrow(/finite/u);
    expect(() => validateProjectDocument({
      ...projectFixture,
      mesh: { ...meshFixture, faces: [{ id: 31, corners: [21, 22, 999] }] },
    })).toThrow(/invalid corners/u);
  });

  it("saves atomically, honors cancellation, and leaves the previous durable document on failure", async () => {
    const storage = new MemoryProjectStorage();
    const repository = new ProjectRepository(storage);
    await repository.save("main", projectFixture);
    expect(await repository.load("main")).toEqual(projectFixture);

    storage.failNextTransaction = new Error("quota");
    await expect(repository.save("main", { ...projectFixture, mesh: { ...meshFixture, version: 4 } })).rejects.toThrow("quota");
    expect((await repository.load("main"))?.mesh.version).toBe(3);

    const controller = new AbortController();
    controller.abort();
    await expect(repository.save("main", projectFixture, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect((await repository.load("main"))?.mesh.version).toBe(3);

    repository.dispose();
    repository.dispose();
    await expect(repository.load("main")).rejects.toThrow(/disposed/u);
  });
});
