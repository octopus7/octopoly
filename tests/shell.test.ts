import { describe, expect, it, vi } from "vitest";

import { mountShell } from "../src/shell";

describe("OctoPoly shell", () => {
  it("renders the product name in the app root", () => {
    const root = document.createElement("div");

    const elements = mountShell(root);

    expect(root.querySelector("h1")?.textContent).toBe("OctoPoly");
    expect(root.querySelector("main")?.getAttribute("aria-labelledby")).toBe("octopoly-title");
    expect(elements.canvas.getAttribute("aria-label")).toContain("기본 큐브");
    expect(elements.canvas.tabIndex).toBe(0);
    expect(elements.panelContainer.className).toBe("facial-panel-layer");
    expect(elements.overlayContainer.className).toBe("viewport-overlay");
    expect(root.querySelector(".viewport")?.contains(elements.panelContainer)).toBe(true);
    expect(root.querySelector(".viewport")?.contains(elements.overlayContainer)).toBe(true);
    const actions = root.querySelector(".viewport-actions");
    const fullscreenToggle = root.querySelector<HTMLButtonElement>(".fullscreen-toggle");
    expect(actions).not.toBeNull();
    expect(actions?.contains(root.querySelector(".status"))).toBe(true);
    expect(actions?.contains(fullscreenToggle)).toBe(true);
    expect(fullscreenToggle?.type).toBe("button");
    expect(fullscreenToggle?.getAttribute("aria-label")).toBe("전체 화면으로 전환");
    expect(fullscreenToggle?.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles an accessible app menu from the OctoPoly wordmark", () => {
    const root = document.createElement("div");

    mountShell(root);

    const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle");
    const menu = root.querySelector<HTMLElement>(".app-menu");
    expect(menuToggle).toBeInstanceOf(HTMLButtonElement);
    expect(menu).not.toBeNull();
    expect(menuToggle?.type).toBe("button");
    expect(menuToggle?.getAttribute("aria-label")).toBe("OctoPoly 메뉴");
    expect(menuToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(menuToggle?.getAttribute("aria-controls")).toBe(menu?.id);
    expect(menuToggle?.nextElementSibling).toBe(menu);
    expect(menu?.hidden).toBe(true);

    menuToggle?.click();

    expect(menuToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(menu?.hidden).toBe(false);

    menuToggle?.click();

    expect(menuToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(menu?.hidden).toBe(true);
  });

  it("exposes the app menu label on a navigation landmark", () => {
    const root = document.createElement("div");

    mountShell(root);

    const menu = root.querySelector<HTMLElement>(".app-menu");
    expect(menu?.tagName).toBe("NAV");
    expect(menu?.getAttribute("aria-label")).toBe("OctoPoly 앱 메뉴");
  });

  it("renders the mode taxonomy with only Facial available and no initial selection", () => {
    const root = document.createElement("div");

    mountShell(root);

    const menu = root.querySelector<HTMLElement>(".app-menu");
    const section = menu?.querySelector<HTMLElement>(".app-menu-section");
    const heading = section?.querySelector<HTMLElement>(".app-menu-heading");
    const modeButtons = [...(section?.querySelectorAll<HTMLButtonElement>(".mode-button") ?? [])];
    expect(menu?.querySelectorAll(".app-menu-section")).toHaveLength(1);
    expect(heading?.textContent).toBe("작업 모드");
    expect(section?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(modeButtons.map((button) => button.dataset.mode)).toEqual(["retopo", "facial", "paint"]);
    expect(modeButtons.map((button) => button.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Retopo 리토포 준비 중",
      "Facial 페이셜",
      "Paint 페인트 준비 중",
    ]);
    expect(modeButtons.map((button) => button.disabled)).toEqual([true, false, true]);
    expect(modeButtons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(modeButtons.map((button) => button.getAttribute("aria-current"))).toEqual([null, null, null]);
  });

  it("does not select unavailable modes or emit mode-change events for them", () => {
    const root = document.createElement("div");
    const collectModeChange = vi.fn();
    document.addEventListener("octopoly:mode-change", collectModeChange);

    try {
      mountShell(root);
      const modeButtons = [...root.querySelectorAll<HTMLButtonElement>(".mode-button")];

      modeButtons[0]?.click();
      modeButtons[2]?.click();

      expect(modeButtons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
      expect(modeButtons.map((button) => button.getAttribute("aria-current"))).toEqual([null, null, null]);
      expect(collectModeChange).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("octopoly:mode-change", collectModeChange);
    }
  });

  it("selects Facial and emits a document mode-change event", () => {
    const root = document.createElement("div");
    const events: CustomEvent<{ mode: string }>[] = [];
    const collectModeChange = (event: Event): void => {
      events.push(event as CustomEvent<{ mode: string }>);
    };
    document.addEventListener("octopoly:mode-change", collectModeChange);

    try {
      mountShell(root);
      const modeButtons = [...root.querySelectorAll<HTMLButtonElement>(".mode-button")];
      const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle");
      const menu = root.querySelector<HTMLElement>(".app-menu");
      menuToggle?.click();

      modeButtons[1]?.click();

      expect(modeButtons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
      expect(modeButtons.map((button) => button.getAttribute("aria-current"))).toEqual([null, "true", null]);
      expect(events).toHaveLength(1);
      expect(events[0]?.detail).toEqual({ mode: "facial" });
      expect(events[0]?.target).toBe(document);
      expect(menuToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(menu?.hidden).toBe(true);
    } finally {
      document.removeEventListener("octopoly:mode-change", collectModeChange);
    }
  });

  it("does not emit mode-change when Facial is already selected", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const collectModeChange = vi.fn();
    document.addEventListener("octopoly:mode-change", collectModeChange);

    try {
      mountShell(root);
      const facialButton = root.querySelector<HTMLButtonElement>('[data-mode="facial"]');
      const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle")!;
      const menu = root.querySelector<HTMLElement>(".app-menu")!;

      facialButton?.click();
      menuToggle.click();
      facialButton?.click();

      expect(collectModeChange).toHaveBeenCalledOnce();
      expect(menu.hidden).toBe(true);
      expect(menuToggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(menuToggle);
    } finally {
      document.removeEventListener("octopoly:mode-change", collectModeChange);
      root.remove();
    }
  });

  it("closes the app menu and restores trigger focus on Escape", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const shell = mountShell(root);
    const menuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle")!;
    const menu = root.querySelector<HTMLElement>(".app-menu")!;
    menuToggle.click();
    root.querySelector<HTMLButtonElement>('[data-mode="facial"]')?.focus();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(menu.hidden).toBe(true);
    expect(menuToggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuToggle);
    shell.dispose();
    root.remove();
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

    const shell = mountShell(root) as ReturnType<typeof mountShell> & { dispose(): void };
    const { fullscreenToggle } = shell;
    fullscreenToggle.click();

    await vi.waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    expect(fullscreenToggle.getAttribute("aria-label")).toBe("전체 화면 종료");
    expect(fullscreenToggle.getAttribute("aria-pressed")).toBe("true");

    fullscreenToggle.click();

    await vi.waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce());
    expect(fullscreenToggle.getAttribute("aria-label")).toBe("전체 화면으로 전환");
    expect(fullscreenToggle.getAttribute("aria-pressed")).toBe("false");

    shell.dispose();
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    fullscreenToggle.click();
    expect(fullscreenToggle.getAttribute("aria-pressed")).toBe("false");
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });
});
