import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function zIndexFor(selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{[^}]*z-index:\\s*(\\d+)`, "s"));
  if (!match) throw new Error(`Missing numeric z-index for ${selector}`);
  return Number(match[1]);
}

describe("application stacking order", () => {
  it("keeps interactive Facial panels above the vertex gizmo overlay", () => {
    expect(zIndexFor(".facial-panel-layer")).toBeGreaterThan(zIndexFor(".viewport-overlay"));
  });
});
