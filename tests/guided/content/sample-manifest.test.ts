import { describe, expect, it } from "vitest";

import {
  validateSampleManifest,
  verifySampleContentHash,
} from "../../../src/guided/content/sample-manifest.ts";

const validManifest = {
  schemaVersion: 1,
  sampleId: "guided-eye-v1",
  contentHash: `sha256:${"a".repeat(64)}`,
  author: "OctoPoly",
  source: "OctoPoly original",
  modifiedByOctoPoly: false,
  license: {
    identifier: "LicenseRef-OctoPoly-Original",
    licensePath: "docs/licenses/guided/octopoly-original.txt",
    redistributionAllowed: true,
    modificationAllowed: true,
    commercialUseAllowed: true,
    attribution: "OctoPoly original",
  },
  roles: ["reference-geometry", "starter-mesh", "diagnostic-fixture"],
} as const;

describe("sample manifest validation", () => {
  it("accepts and deeply freezes complete offline provenance metadata", () => {
    const result = validateSampleManifest(validManifest);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(Object.isFrozen(result.manifest.license)).toBe(true);
    expect(Object.isFrozen(result.manifest.roles)).toBe(true);
  });

  it("accepts a modified external sample only with an original URL, description, and date", () => {
    const result = validateSampleManifest({
      ...validManifest,
      source: "https://example.org/assets/eye-loop.glb",
      modifiedByOctoPoly: true,
      modificationDescription: "Reduced to a small deterministic tutorial mesh.",
      modificationDate: "2026-08-10",
    });
    expect(result.status).toBe("ok");
  });

  it.each([
    ["unknown-license", { ...validManifest, license: { ...validManifest.license, identifier: "" } }, "missing-license"],
    ["commercial-rights", { ...validManifest, license: { ...validManifest.license, commercialUseAllowed: false } }, "commercial-use-not-allowed"],
    ["modification-rights", {
      ...validManifest,
      modifiedByOctoPoly: true,
      modificationDescription: "Changed topology",
      modificationDate: "2026-08-10",
      license: { ...validManifest.license, modificationAllowed: false },
    }, "modification-not-allowed"],
    ["bad-hash", { ...validManifest, contentHash: "sha256:not-a-hash" }, "invalid-content-hash"],
    ["duplicate-role", { ...validManifest, roles: ["starter-mesh", "starter-mesh"] }, "duplicate-role"],
    ["unverifiable-source", { ...validManifest, source: "downloaded from the internet" }, "invalid-source"],
    ["absolute-license-path", { ...validManifest, license: { ...validManifest.license, licensePath: "/etc/passwd" } }, "invalid-license-path"],
    ["traversal-license-path", { ...validManifest, license: { ...validManifest.license, licensePath: "docs/licenses/guided/../../secret" } }, "invalid-license-path"],
    ["missing-modification-description", { ...validManifest, modifiedByOctoPoly: true, modificationDate: "2026-08-10" }, "missing-modification-metadata"],
    ["invalid-modification-date", { ...validManifest, modifiedByOctoPoly: true, modificationDescription: "Changed topology", modificationDate: "today" }, "invalid-modification-date"],
  ])("rejects %s metadata", (_label, source, code) => {
    expect(validateSampleManifest(source)).toEqual(expect.objectContaining({ status: "invalid", code }));
  });

  it("compares a precomputed artifact hash without reading a network or asset", () => {
    expect(verifySampleContentHash(validManifest.contentHash, `sha256:${"a".repeat(64)}`)).toEqual({ status: "match" });
    expect(verifySampleContentHash(validManifest.contentHash, `sha256:${"b".repeat(64)}`)).toEqual({ status: "mismatch" });
  });
});
