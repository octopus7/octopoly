import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const VERIFIER = path.join(ROOT, "scripts", "verify-optional.mjs");

describe("Full Optional physical evidence boundary", () => {
  it("reports automation, desktop WebGL2, and physical iPad/Pencil as separate gates", () => {
    const result = run("--scan-only");
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      automated: { status: string };
      desktopWebGL2: { status: string; note: string };
      physicalIPadPencil: { status: string; note: string };
      releaseReadiness: string;
    };
    expect(report.automated.status).toBe("PASS");
    expect(report.desktopWebGL2.status).toBe("NOT_RUN");
    expect(report.desktopWebGL2.note).toMatch(/not iPad Safari or Apple Pencil/i);
    expect(report.physicalIPadPencil.status).toBe("NOT_RUN");
    expect(report.physicalIPadPencil.note).toMatch(/Only completed physical iPad Safari/i);
    expect(report.releaseReadiness).toBe("BLOCKED");
  });

  it("returns nonzero when --require-physical has only the checked-in NOT_RUN record", () => {
    const result = run("--scan-only", "--require-physical");
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout) as {
      physicalIPadPencil: { status: string };
      releaseReadiness: string;
      failures: string[];
    };
    expect(report.physicalIPadPencil.status).toBe("NOT_RUN");
    expect(report.releaseReadiness).toBe("BLOCKED");
    expect(report.failures).toContain(
      "EVIDENCE: physical iPad/Pencil evidence is NOT_RUN; PASS is required.",
    );
  });
});

function run(...args: string[]) {
  return spawnSync(process.execPath, [VERIFIER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
