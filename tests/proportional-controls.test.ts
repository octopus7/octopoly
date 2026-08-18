import { describe, expect, it, vi } from "vitest";

import { mountProportionalControls } from "../src/facial/proportional-controls";

describe("proportional edit controls", () => {
  it("mounts a default-off toggle beside an independent settings disclosure", () => {
    const toolStrip = document.createElement("div");
    toolStrip.className = "facial-tool-strip";
    const meshButton = document.createElement("button");
    meshButton.className = "facial-mesh-drawer-toggle";
    toolStrip.append(meshButton);
    const overlay = document.createElement("div");
    const onChange = vi.fn();

    const controls = mountProportionalControls(toolStrip, overlay, { onChange });
    const toggle = toolStrip.querySelector<HTMLButtonElement>('[data-action="toggle-proportional-edit"]')!;
    const settings = toolStrip.querySelector<HTMLButtonElement>('[data-action="toggle-proportional-settings"]')!;
    const popover = toolStrip.querySelector<HTMLElement>(".proportional-controls__popover")!;

    expect(controls.element.nextElementSibling).toBe(meshButton);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toContain("비례 편집");
    expect(settings.getAttribute("aria-expanded")).toBe("false");
    expect(settings.getAttribute("aria-controls")).toBe(popover.id);
    expect(popover.hidden).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({
      enabled: false,
      radiusRatio: 0.25,
      falloff: "smooth",
      connectedOnly: false,
    });

    toggle.click();
    settings.click();

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(settings.getAttribute("aria-expanded")).toBe("true");
    expect(popover.hidden).toBe(false);
    expect(popover.querySelector('[data-proportional-radius-value]')?.textContent).toBe("25%");
    expect(popover.querySelectorAll('select[data-proportional-falloff] option')).toHaveLength(3);
    expect(popover.querySelector<HTMLInputElement>('[data-proportional-connected]')?.checked).toBe(false);

    controls.dispose();
  });

  it("publishes radius, falloff, and connected-only setting changes", () => {
    const toolStrip = document.createElement("div");
    const overlay = document.createElement("div");
    const onChange = vi.fn();
    const controls = mountProportionalControls(toolStrip, overlay, { onChange });
    const increment = toolStrip.querySelector<HTMLButtonElement>('[data-proportional-radius-increase]')!;
    const falloff = toolStrip.querySelector<HTMLSelectElement>('[data-proportional-falloff]')!;
    const connected = toolStrip.querySelector<HTMLInputElement>('[data-proportional-connected]')!;

    increment.click();
    falloff.value = "sharp";
    falloff.dispatchEvent(new Event("change", { bubbles: true }));
    connected.checked = true;
    connected.dispatchEvent(new Event("change", { bubbles: true }));

    expect(controls.state).toEqual({
      enabled: false,
      radiusRatio: 0.3,
      falloff: "sharp",
      connectedOnly: true,
    });
    expect(toolStrip.querySelector('[data-proportional-radius-value]')?.textContent).toBe("30%");
    expect(onChange).toHaveBeenLastCalledWith(controls.state);
    controls.dispose();
  });

  it("renders a non-interactive influence boundary and weighted vertex markers", () => {
    const toolStrip = document.createElement("div");
    const overlay = document.createElement("div");
    const controls = mountProportionalControls(toolStrip, overlay, { onChange: vi.fn() });

    controls.showInfluence({
      center: { x: 100, y: 80 },
      radiusPixels: 40,
      points: [
        { x: 100, y: 80, weight: 1 },
        { x: 120, y: 80, weight: 0.5 },
        { x: 160, y: 80, weight: 0 },
      ],
    });

    const visual = overlay.querySelector<HTMLElement>(".proportional-influence")!;
    const ring = visual.querySelector<HTMLElement>(".proportional-influence__ring")!;
    const points = [...visual.querySelectorAll<HTMLElement>(".proportional-influence__point")];
    expect(visual.hidden).toBe(false);
    expect(visual.getAttribute("aria-hidden")).toBe("true");
    expect(ring.style.width).toBe("80px");
    expect(ring.style.transform).toBe("translate(60px, 40px)");
    expect(points).toHaveLength(2);
    expect(points[1]?.style.opacity).toBe("0.5");

    controls.showInfluence(null);
    expect(visual.hidden).toBe(true);
    controls.dispose();
  });

  it("bounds DOM influence markers for large meshes", () => {
    const toolStrip = document.createElement("div");
    const overlay = document.createElement("div");
    const controls = mountProportionalControls(toolStrip, overlay, { onChange: vi.fn() });

    controls.showInfluence({
      center: { x: 0, y: 0 },
      radiusPixels: 50,
      points: Array.from({ length: 2_000 }, (_, index) => ({ x: index, y: 0, weight: 0.5 })),
    });

    expect(overlay.querySelectorAll(".proportional-influence__point").length).toBeLessThanOrEqual(512);
    controls.dispose();
  });
});
