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

  it("renders Modes and Controls Help as an accessible tab interface", () => {
    const root = document.createElement("div");

    mountShell(root);

    const tablist = root.querySelector<HTMLElement>('[role="tablist"]');
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(tablist?.getAttribute("aria-label")).toBe("App menu sections");
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Modes", "Controls Help"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
    expect(panels).toHaveLength(2);
    expect(panels.map((panel) => panel.getAttribute("aria-labelledby"))).toEqual(tabs.map((tab) => tab.id));
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual(panels.map((panel) => panel.id));
    expect(panels.map((panel) => panel.tabIndex)).toEqual([0, 0]);
    expect(panels.map((panel) => panel.hidden)).toEqual([false, true]);
  });

  it("activates a menu tab when it is clicked", () => {
    const root = document.createElement("div");

    mountShell(root);

    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    tabs[1]?.click();

    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false]);
  });

  it("cycles through menu tabs with ArrowLeft and ArrowRight", () => {
    const root = document.createElement("div");
    document.body.append(root);

    try {
      mountShell(root);
      const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      tabs[0]?.focus();

      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);

      tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      expect(document.activeElement).toBe(tabs[0]);

      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      expect(document.activeElement).toBe(tabs[1]);
    } finally {
      root.remove();
    }
  });

  it("jumps to the first and last menu tabs with Home and End", () => {
    const root = document.createElement("div");
    document.body.append(root);

    try {
      mountShell(root);
      const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      tabs[0]?.focus();

      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");

      tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      expect(document.activeElement).toBe(tabs[0]);
      expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    } finally {
      root.remove();
    }
  });

  it("shows keyboard and mouse controls for the default desktop capability profile", () => {
    const root = document.createElement("div");

    mountShell(root);

    const help = root.querySelector<HTMLElement>(".controls-help-list");
    const items = [...(help?.querySelectorAll("li") ?? [])].map((item) => item.textContent?.replace(/\s+/g, " ").trim());
    expect(help?.dataset.inputProfile).toBe("desktop");
    expect(items).toEqual([
      "Left drag — Orbit",
      "Shift + left drag — Pan",
      "Wheel — Zoom",
      "Click / Arrow keys — Select vertex",
      "F — Focus selected vertex",
      "X / Y / Z gizmo or plane handle — Move selected vertex",
    ]);
    expect(root.textContent).not.toContain("One-finger drag");
    expect(root.textContent).not.toContain("Focus button");
  });

  it("shows touch controls when touch, coarse pointer, and hover-none capabilities are all present", () => {
    const root = document.createElement("div");
    const originalTouchPoints = Object.getOwnPropertyDescriptor(window.navigator, "maxTouchPoints");
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 5 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(pointer: coarse)" || query === "(hover: none)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } satisfies MediaQueryList)),
    });

    try {
      mountShell(root);
      const help = root.querySelector<HTMLElement>(".controls-help-list");
      const items = [...(help?.querySelectorAll("li") ?? [])].map((item) => item.textContent?.replace(/\s+/g, " ").trim());
      expect(help?.dataset.inputProfile).toBe("touch");
      expect(items).toEqual([
        "One-finger drag — Orbit",
        "Two-finger drag — Pan",
        "Pinch — Zoom",
        "Tap — Select vertex",
        "Focus button in panel — Focus selected vertex",
        "X / Y / Z gizmo or plane handle — Move selected vertex",
      ]);
      expect(root.textContent).not.toContain("Left drag");
      expect(root.textContent).not.toContain("Arrow keys");
    } finally {
      if (originalTouchPoints) Object.defineProperty(window.navigator, "maxTouchPoints", originalTouchPoints);
      else Reflect.deleteProperty(window.navigator, "maxTouchPoints");
      if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
      else Reflect.deleteProperty(window, "matchMedia");
    }
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
    const facialButton = root.querySelector<HTMLButtonElement>('[data-mode="facial"]')!;
    menuToggle.click();
    facialButton.focus();

    facialButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

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
