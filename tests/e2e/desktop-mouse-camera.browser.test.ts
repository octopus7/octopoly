import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const harnessPath = resolve("docs/validation/desktop-mouse/browser-harness.html");
const verifierPath = resolve("scripts/verify-desktop-mouse.mjs");

describe("desktop mouse actual-browser evidence boundary", () => {
  it("keeps the browser harness reachable and labels CDP input as synthetic automation", () => {
    // verify:optional intentionally removes docs/ and scripts/ from its core-only fixture.
    if (!existsSync(harnessPath) || !existsSync(verifierPath)) {
      expect(existsSync("src/app/composition/workspace-input.ts")).toBe(true);
      return;
    }
    const harnessHtml = readFileSync(harnessPath, "utf8");
    const verifier = readFileSync(verifierPath, "utf8");
    expect(harnessHtml).toContain("id=\"viewport\"");
    expect(harnessHtml).toContain("/docs/validation/desktop-mouse/browser-harness.ts");
    expect(verifier).toContain('evidenceClass: "SYNTHETIC_CDP_AUTOMATION"');
    expect(verifier).toContain('physicalDesktopMouse: "NOT_RUN"');
    expect(verifier).toContain('precisionTrackpad: "NOT_RUN"');
    expect(verifier).toContain('physicalIPadExternalPointer: "NOT_RUN"');
  });
});
