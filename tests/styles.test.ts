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

  it("keeps the app menu above the Facial layer when their open panels overlap", () => {
    expect(zIndexFor(".app-menu-anchor")).toBeGreaterThan(zIndexFor(".facial-panel-layer"));
    expect(zIndexFor(".app-menu-anchor")).toBeGreaterThan(zIndexFor(".viewport-overlay"));
  });

  it("uses a full non-blocking Facial layer with an independently sliding right drawer", () => {
    expect(declarationFor(".facial-panel-layer", "inset")).toBe("0");
    expect(declarationFor(".facial-panel-layer", "width")).toBe("100%");
    expect(declarationFor(".facial-panel-layer", "pointer-events")).toBe("none");
    expect(declarationFor(".facial-mesh-drawer", "position")).toBe("absolute");
    expect(declarationFor(".facial-mesh-drawer", "transform")).toContain("translateX");
    expect(declarationFor(".facial-mesh-drawer", "pointer-events")).toBe("none");
    expect(declarationFor('.facial-mesh-drawer[data-open="true"]', "transform")).toBe("translateX(0)");
    expect(declarationFor('.facial-mesh-drawer[data-open="true"]', "pointer-events")).toBe("auto");
  });

  it("keeps the compact Facial tool strip and selection card reachable above the viewport", () => {
    expect(declarationFor(".facial-tool-strip", "position")).toBe("absolute");
    expect(declarationFor(".facial-tool-strip", "pointer-events")).toBe("auto");
    expect(declarationFor(".facial-tool-button", "width")).toBe("2.75rem");
    expect(declarationFor(".facial-tool-button", "min-width")).toBe("2.75rem");
    expect(declarationFor(".facial-tool-button", "height")).toBe("2.75rem");
    expect(declarationFor(".facial-tool-button", "min-height")).toBe("2.75rem");
    expect(declarationFor(".facial-selection-card", "position")).toBe("absolute");
    expect(declarationFor(".facial-selection-card", "max-width")).toContain("rem");
  });

  it("lays out one compact action group without exposing hidden mesh actions", () => {
    expect(declarationFor(".facial-mesh-row__actions", "display")).toBe("flex");
    expect(declarationFor('.facial-mesh-row__actions[hidden]', "display")).toBe("none");
  });

  it("keeps all movement mode labels on one line", () => {
    expect(declarationFor(".movement-mode-buttons button", "white-space")).toBe("nowrap");
  });

  it("uses a compact view-plane touch target and a non-interactive top-level plane visual", () => {
    expect(declarationFor(".vertex-gizmo__plane-handle--view", "width")).toBe("2.75rem");
    expect(declarationFor(".vertex-gizmo__plane-handle--view", "min-width")).toBe("2.75rem");
    expect(declarationFor(".vertex-gizmo__plane-handle--view", "height")).toBe("2.75rem");
    expect(declarationFor('.vertex-gizmo__handle[hidden]', "display")).toBe("none");
    expect(declarationFor('.vertex-gizmo__plane-handle[hidden]', "display")).toBe("none");
    expect(declarationFor('.vertex-gizmo__plane-axis-handle[hidden]', "display")).toBe("none");
    expect(declarationFor(".vertex-gizmo__plane-visual", "pointer-events")).toBe("none");
    expect(declarationFor(".vertex-gizmo__plane-axis-handle", "pointer-events")).toBe("auto");
    expect(declarationFor(".vertex-gizmo__plane-axis-handle", "touch-action")).toBe("none");
    expect(Number(declarationFor(".vertex-gizmo__plane-axis-handle", "z-index")))
      .toBeGreaterThan(Number(declarationFor(".vertex-gizmo__plane-handle", "z-index")));
    expect(Number(declarationFor(".vertex-gizmo__plane-visual", "z-index")))
      .toBeGreaterThan(Number(declarationFor(".vertex-gizmo__axis-line", "z-index")));
  });

  it("includes safe-area-aware narrow layouts for the drawer, top strip, and compact selection", () => {
    const mobile = stylesheet.match(/@media \(max-width: 520px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";
    expect(mobile).toContain(".facial-mesh-drawer");
    expect(mobile).toContain("env(safe-area-inset-right)");
    expect(mobile).toContain(".facial-tool-strip");
    expect(mobile).toContain(".facial-selection-card");
    expect(mobile).toMatch(/max-height:\s*min\(/);
  });

  it("places the narrow Facial tool strip below the logo menu trigger", () => {
    const mobile = stylesheet.match(/@media \(max-width: 520px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";
    const toolStrip = mobile.match(/\.facial-tool-strip\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(toolStrip).toContain("top: max(5.25rem, calc(env(safe-area-inset-top) + 4.25rem))");
  });

  it("lays out scalable tabs and a scrollable menu panel", () => {
    expect(declarationFor(".app-menu-tabs", "display")).toBe("grid");
    expect(declarationFor(".app-menu-tabs", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(declarationFor(".app-menu-tab", "min-height")).toBe("2.75rem");
    expect(declarationFor(".app-menu-panel", "overflow-y")).toBe("auto");
  });
});
