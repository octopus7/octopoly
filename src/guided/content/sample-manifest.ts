export const GUIDED_SAMPLE_MANIFEST_SCHEMA_VERSION = 1 as const;

export type GuidedSampleRole = "reference-geometry" | "starter-mesh" | "diagnostic-fixture";

interface GuidedSampleLicense {
  readonly identifier: string;
  readonly licensePath: string;
  readonly redistributionAllowed: true;
  readonly modificationAllowed: boolean;
  readonly commercialUseAllowed: true;
  readonly attribution: string;
}

export interface GuidedSampleManifest {
  readonly schemaVersion: typeof GUIDED_SAMPLE_MANIFEST_SCHEMA_VERSION;
  readonly sampleId: string;
  readonly contentHash: string;
  readonly author: string;
  readonly source: string;
  readonly modifiedByOctoPoly: boolean;
  readonly modificationDescription?: string;
  readonly modificationDate?: string;
  readonly license: GuidedSampleLicense;
  readonly roles: ReadonlyArray<GuidedSampleRole>;
}

export type SampleManifestValidationResult =
  | { readonly status: "ok"; readonly manifest: GuidedSampleManifest }
  | { readonly status: "invalid"; readonly code: string; readonly path: string };

const roles = new Set<GuidedSampleRole>(["reference-geometry", "starter-mesh", "diagnostic-fixture"]);
const sha256 = /^sha256:[0-9a-f]{64}$/;
const licensePath = /^docs\/licenses\/guided\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validSource(value: string): boolean {
  if (value === "OctoPoly original") return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function validIsoDate(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function failure(code: string, path: string): SampleManifestValidationResult {
  return Object.freeze({ status: "invalid", code, path });
}

export function validateSampleManifest(source: unknown): SampleManifestValidationResult {
  const root = record(source);
  if (root === null || root.schemaVersion !== GUIDED_SAMPLE_MANIFEST_SCHEMA_VERSION) {
    return failure("invalid-schema-version", "$.schemaVersion");
  }
  if (!text(root.sampleId) || !text(root.author) || !text(root.source)) {
    return failure("missing-provenance", "$.source");
  }
  if (!validSource(root.source)) return failure("invalid-source", "$.source");
  if (typeof root.modifiedByOctoPoly !== "boolean") {
    return failure("missing-modification-metadata", "$.modifiedByOctoPoly");
  }
  if (root.modifiedByOctoPoly) {
    if (!text(root.modificationDescription) || !text(root.modificationDate)) {
      return failure("missing-modification-metadata", "$.modificationDescription");
    }
    if (!validIsoDate(root.modificationDate)) {
      return failure("invalid-modification-date", "$.modificationDate");
    }
  } else if (root.modificationDescription !== undefined || root.modificationDate !== undefined) {
    return failure("unexpected-modification-metadata", "$.modificationDescription");
  }
  if (!text(root.contentHash) || !sha256.test(root.contentHash)) {
    return failure("invalid-content-hash", "$.contentHash");
  }
  const license = record(root.license);
  if (license === null || !text(license.identifier) || !text(license.licensePath) || !text(license.attribution)) {
    return failure("missing-license", "$.license");
  }
  if (!licensePath.test(license.licensePath)) return failure("invalid-license-path", "$.license.licensePath");
  if (license.redistributionAllowed !== true) return failure("redistribution-not-allowed", "$.license.redistributionAllowed");
  if (license.commercialUseAllowed !== true) return failure("commercial-use-not-allowed", "$.license.commercialUseAllowed");
  if (typeof license.modificationAllowed !== "boolean") return failure("invalid-license", "$.license.modificationAllowed");
  if (root.modifiedByOctoPoly && !license.modificationAllowed) {
    return failure("modification-not-allowed", "$.license.modificationAllowed");
  }
  if (!Array.isArray(root.roles) || root.roles.length === 0 || !root.roles.every((role) => roles.has(role as GuidedSampleRole))) {
    return failure("invalid-role", "$.roles");
  }
  if (new Set(root.roles).size !== root.roles.length) return failure("duplicate-role", "$.roles");

  const frozenLicense: GuidedSampleLicense = Object.freeze({
    identifier: license.identifier,
    licensePath: license.licensePath,
    redistributionAllowed: true,
    modificationAllowed: license.modificationAllowed,
    commercialUseAllowed: true,
    attribution: license.attribution,
  });
  const modification = root.modifiedByOctoPoly
    ? {
        modificationDescription: root.modificationDescription as string,
        modificationDate: root.modificationDate as string,
      }
    : {};
  const manifest: GuidedSampleManifest = {
    schemaVersion: GUIDED_SAMPLE_MANIFEST_SCHEMA_VERSION,
    sampleId: root.sampleId,
    contentHash: root.contentHash,
    author: root.author,
    source: root.source,
    modifiedByOctoPoly: root.modifiedByOctoPoly,
    ...modification,
    license: frozenLicense,
    roles: Object.freeze([...(root.roles as GuidedSampleRole[])]),
  };
  return Object.freeze({ status: "ok", manifest: Object.freeze(manifest) });
}

export function verifySampleContentHash(expected: string, actual: string): { readonly status: "match" | "mismatch" } {
  return Object.freeze({ status: expected === actual ? "match" : "mismatch" });
}
