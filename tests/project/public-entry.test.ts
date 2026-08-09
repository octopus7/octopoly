import { describe, expect, it } from "vitest";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  IndexedDbImageAssetService,
  IndexedDbProjectStorage,
  IndexedDbReferenceAssetService,
  ProjectAutosave,
  ProjectRepository,
  migrateProjectDocument,
  validateProjectDocument,
} from "../../src/project";

describe("project public entry", () => {
  it("publishes the IO/project leaf implementations needed by integration", () => {
    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBe(2);
    expect([
      IndexedDbImageAssetService,
      IndexedDbProjectStorage,
      IndexedDbReferenceAssetService,
      ProjectAutosave,
      ProjectRepository,
      migrateProjectDocument,
      validateProjectDocument,
    ]).not.toContain(undefined);
  });
});
