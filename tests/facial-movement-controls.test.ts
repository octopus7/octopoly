import { describe, expect, it, vi } from "vitest";

import { mountMovementControls } from "../src/facial/movement-controls";

describe("vertex movement controls", () => {
  it("mounts one collapsed top-tool icon and restores its focus when the mode popover closes on Escape", () => {
    const panel = document.createElement("section");
    const toolStrip = document.createElement("div");
    toolStrip.className = "facial-tool-strip";
    panel.append(toolStrip);
    const overlay = document.createElement("div");
    const onChange = vi.fn();
    document.body.append(panel);

    const controls = mountMovementControls(panel, overlay, { onChange });
    const trigger = toolStrip.querySelector<HTMLButtonElement>('[data-action="toggle-movement-controls"]')!;
    const popover = toolStrip.querySelector<HTMLElement>(".movement-controls__popover")!;

    expect(controls.element.parentElement).toBe(toolStrip);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(popover.id);
    expect(trigger.getAttribute("aria-label")).toContain("버텍스 이동");
    expect(trigger.title).toContain("기즈모");
    expect(trigger.textContent).toBe("");
    expect(trigger.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(popover.hidden).toBe(true);
    expect(toolStrip.querySelectorAll<HTMLButtonElement>("[data-movement-mode]")).toHaveLength(3);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "gizmo" }));

    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popover.hidden).toBe(false);
    const modes = [...popover.querySelectorAll<HTMLButtonElement>("[data-movement-mode]")];
    expect(modes.map((button) => button.textContent)).toEqual(["기즈모", "뷰 평면", "제한 평면"]);
    expect(modes.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);

    modes[1]?.focus();
    modes[1]?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    controls.dispose();
    panel.remove();
  });

  it("closes the movement popover when Escape bubbles from its focused trigger", () => {
    const panel = document.createElement("section");
    const toolStrip = document.createElement("div");
    toolStrip.className = "facial-tool-strip";
    panel.append(toolStrip);
    const overlay = document.createElement("div");
    document.body.append(panel);
    const controls = mountMovementControls(panel, overlay, { onChange: vi.fn() });
    const trigger = toolStrip.querySelector<HTMLButtonElement>('[data-action="toggle-movement-controls"]')!;
    const popover = toolStrip.querySelector<HTMLElement>(".movement-controls__popover")!;
    const backgroundKeydown = vi.fn();
    document.addEventListener("keydown", backgroundKeydown);

    try {
      trigger.focus();
      trigger.click();
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });

      trigger.dispatchEvent(escape);

      expect(popover.hidden).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      expect(escape.defaultPrevented).toBe(true);
      expect(backgroundKeydown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", backgroundKeydown);
      controls.dispose();
      panel.remove();
    }
  });

  it("shows only enabled constrained planes in the left selector and hides it for one plane", () => {
    const panel = document.createElement("section");
    panel.append(document.createElement("h2"));
    const overlay = document.createElement("div");
    const controls = mountMovementControls(panel, overlay, { onChange: vi.fn() });

    panel.querySelector<HTMLButtonElement>('[data-movement-mode="constrained-plane"]')?.click();
    const options = panel.querySelector<HTMLElement>(".movement-plane-options")!;
    expect(options.hidden).toBe(false);
    const screenSpace = options.querySelector<HTMLInputElement>('[data-plane-screen-space="true"]')!;
    expect(screenSpace.checked).toBe(false);
    expect(screenSpace.parentElement?.textContent).toContain("스크린 스페이스");
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

  it("publishes the constrained-plane screen-space presentation toggle", () => {
    const panel = document.createElement("section");
    panel.append(document.createElement("h2"));
    const overlay = document.createElement("div");
    const onChange = vi.fn();
    const controls = mountMovementControls(panel, overlay, { onChange });
    panel.querySelector<HTMLButtonElement>('[data-movement-mode="constrained-plane"]')?.click();
    const screenSpace = panel.querySelector<HTMLInputElement>('[data-plane-screen-space="true"]')!;

    screenSpace.checked = true;
    screenSpace.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: "constrained-plane",
      activeConstrainedPlane: "xy",
      constrainedPlaneScreenSpace: true,
    }));
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
