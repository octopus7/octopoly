import { describe, expect, it, vi } from "vitest";

import { mountMovementControls } from "../src/facial/movement-controls";

describe("vertex movement controls", () => {
  it("starts in gizmo mode and exposes all three movement modes", () => {
    const panel = document.createElement("section");
    panel.append(document.createElement("h2"));
    const overlay = document.createElement("div");
    const onChange = vi.fn();

    const controls = mountMovementControls(panel, overlay, { onChange });

    const modes = [...panel.querySelectorAll<HTMLButtonElement>("[data-movement-mode]")];
    expect(modes.map((button) => button.dataset.movementMode)).toEqual([
      "gizmo",
      "view-plane",
      "constrained-plane",
    ]);
    expect(modes.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(panel.querySelector<HTMLElement>(".movement-plane-options")?.hidden).toBe(true);
    expect(overlay.querySelector<HTMLElement>(".movement-plane-selector")?.hidden).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "gizmo" }));
    controls.dispose();
  });

  it("shows only enabled constrained planes in the left selector and hides it for one plane", () => {
    const panel = document.createElement("section");
    panel.append(document.createElement("h2"));
    const overlay = document.createElement("div");
    const controls = mountMovementControls(panel, overlay, { onChange: vi.fn() });

    panel.querySelector<HTMLButtonElement>('[data-movement-mode="constrained-plane"]')?.click();
    const options = panel.querySelector<HTMLElement>(".movement-plane-options")!;
    expect(options.hidden).toBe(false);
    const selector = overlay.querySelector<HTMLElement>(".movement-plane-selector")!;
    expect([...selector.querySelectorAll("[data-constrained-plane]")]).toHaveLength(3);

    const xz = panel.querySelector<HTMLInputElement>('[data-plane-enabled="xz"]')!;
    xz.checked = false;
    xz.dispatchEvent(new Event("change", { bubbles: true }));
    expect([...selector.querySelectorAll("[data-constrained-plane]")]
      .map((button) => (button as HTMLElement).dataset.constrainedPlane)).toEqual(["xy", "yz"]);

    const yz = panel.querySelector<HTMLInputElement>('[data-plane-enabled="yz"]')!;
    yz.checked = false;
    yz.dispatchEvent(new Event("change", { bubbles: true }));
    expect(selector.hidden).toBe(true);
    expect([...selector.querySelectorAll("[data-constrained-plane]")]).toHaveLength(0);
    controls.dispose();
  });

  it("selects an enabled world plane from the left-side selector", () => {
    const panel = document.createElement("section");
    panel.append(document.createElement("h2"));
    const overlay = document.createElement("div");
    const onChange = vi.fn();
    const controls = mountMovementControls(panel, overlay, { onChange });
    panel.querySelector<HTMLButtonElement>('[data-movement-mode="constrained-plane"]')?.click();

    overlay.querySelector<HTMLButtonElement>('[data-constrained-plane="yz"]')?.click();

    expect(overlay.querySelector('[data-constrained-plane="yz"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: "constrained-plane",
      activeConstrainedPlane: "yz",
    }));
    controls.dispose();
  });
});
