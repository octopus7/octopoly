import { afterEach, describe, expect, it, vi } from "vitest";

import type { ViewportSnapshot } from "@octopoly/contracts";
import { ViewportShell } from "../../src/ui";

describe("ViewportShell", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("publishes CSS-pixel orientation and safe-area layout without sizing a GPU buffer", () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const updates: ViewportSnapshot[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const shell = new ViewportShell(container, (viewport) => updates.push(viewport));
    let width = 1024;
    let height = 768;
    vi.spyOn(shell.viewportElement, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          width,
          height,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    updates.length = 0;
    expect(shell.refresh()).toEqual({
      cssWidth: 1024,
      cssHeight: 768,
      devicePixelRatio: 2,
    });
    expect(shell.element.dataset.orientation).toBe("landscape");
    expect(shell.element.style.getPropertyValue("--octopoly-safe-area-top")).toContain(
      "safe-area-inset-top",
    );
    expect(shell.element.querySelector("canvas")).toBeNull();

    width = 600;
    height = 900;
    window.dispatchEvent(new Event("orientationchange"));
    expect(updates.at(-1)).toEqual({ cssWidth: 600, cssHeight: 900, devicePixelRatio: 2 });
    expect(shell.element.dataset.orientation).toBe("portrait");

    shell.dispose();
    const count = updates.length;
    window.dispatchEvent(new Event("resize"));
    expect(updates).toHaveLength(count);
  });

  it("removes its DOM and is idempotent on dispose", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const shell = new ViewportShell(container);

    shell.dispose();
    shell.dispose();

    expect(container.childElementCount).toBe(0);
    expect(() => shell.viewport()).toThrow(/disposed/);
  });
});
