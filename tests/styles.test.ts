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

function declarationFor(selector: string, property: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)`, "s"))?.[1];
  const value = block?.match(new RegExp(`${property}:\\s*([^;]+)`))?.[1]?.trim();
  if (!value) throw new Error(`Missing ${property} for ${selector}`);
  return value;
}

describe("application stacking order", () => {
  it("keeps interactive Facial panels above the vertex gizmo overlay", () => {
    expect(zIndexFor(".facial-panel-layer")).toBeGreaterThan(zIndexFor(".viewport-overlay"));
  });

  it("keeps the app menu above the vertex gizmo overlay on narrow layouts", () => {
    expect(zIndexFor(".app-menu-anchor")).toBeGreaterThan(zIndexFor(".viewport-overlay"));
  });

  it("lays out scalable tabs and a scrollable menu panel", () => {
    expect(declarationFor(".app-menu-tabs", "display")).toBe("grid");
    expect(declarationFor(".app-menu-tabs", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(declarationFor(".app-menu-tab", "min-height")).toBe("2.75rem");
    expect(declarationFor(".app-menu-panel", "overflow-y")).toBe("auto");
  });
});
