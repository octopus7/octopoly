import { describe, expect, it, vi } from "vitest";

import { mountShell } from "../src/shell";

describe("OctoPoly shell", () => {
  it("renders the product name in the app root", () => {
    const root = document.createElement("div");

    const elements = mountShell(root);

    expect(root.querySelector("h1")?.textContent).toBe("OctoPoly");
    expect(root.querySelector("main")?.getAttribute("aria-labelledby")).toBe("octopoly-title");
    expect(elements.canvas.getAttribute("aria-label")).toContain("기본 큐브");
    const actions = root.querySelector(".viewport-actions");
    const fullscreenToggle = root.querySelector<HTMLButtonElement>(".fullscreen-toggle");
    expect(actions).not.toBeNull();
    expect(actions?.contains(root.querySelector(".status"))).toBe(true);
    expect(actions?.contains(fullscreenToggle)).toBe(true);
    expect(fullscreenToggle?.type).toBe("button");
    expect(fullscreenToggle?.getAttribute("aria-label")).toBe("전체 화면으로 전환");
    expect(fullscreenToggle?.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles browser fullscreen and synchronizes its accessible state", async () => {
    const root = document.createElement("div");
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    const { fullscreenToggle } = mountShell(root);
    fullscreenToggle.click();

    await vi.waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    expect(fullscreenToggle.getAttribute("aria-label")).toBe("전체 화면 종료");
    expect(fullscreenToggle.getAttribute("aria-pressed")).toBe("true");

    fullscreenToggle.click();

    await vi.waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce());
    expect(fullscreenToggle.getAttribute("aria-label")).toBe("전체 화면으로 전환");
    expect(fullscreenToggle.getAttribute("aria-pressed")).toBe("false");
  });
});
