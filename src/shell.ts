export interface WorkspaceElements {
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly fullscreenToggle: HTMLButtonElement;
  readonly panelContainer: HTMLElement;
  readonly overlayContainer: HTMLElement;
  dispose(): void;
}

type WorkspaceMode = "retopo" | "facial" | "paint";

const WORKSPACE_MODES: ReadonlyArray<{
  readonly mode: WorkspaceMode;
  readonly name: string;
  readonly koreanName: string;
  readonly available: boolean;
}> = [
  { mode: "retopo", name: "Retopo", koreanName: "리토포", available: false },
  { mode: "facial", name: "Facial", koreanName: "페이셜", available: true },
  { mode: "paint", name: "Paint", koreanName: "페인트", available: false },
];

type ControlsProfile = "desktop" | "touch";

const CONTROL_HELP: Readonly<Record<ControlsProfile, ReadonlyArray<readonly [input: string, action: string]>>> = {
  desktop: [
    ["Left drag", "Orbit"],
    ["Shift + left drag", "Pan"],
    ["Wheel", "Zoom"],
    ["Click / Arrow keys", "Select vertex"],
    ["F", "Focus selected vertex"],
    ["X / Y / Z gizmo or plane handle", "Move selected vertex"],
  ],
  touch: [
    ["One-finger drag", "Orbit"],
    ["Two-finger drag", "Pan"],
    ["Pinch", "Zoom"],
    ["Tap", "Select vertex"],
    ["Focus button in panel", "Focus selected vertex"],
    ["X / Y / Z gizmo or plane handle", "Move selected vertex"],
  ],
};

function controlsProfile(document: Document): ControlsProfile {
  const view = document.defaultView;
  if (!view || view.navigator.maxTouchPoints <= 0 || typeof view.matchMedia !== "function") return "desktop";
  return view.matchMedia("(pointer: coarse)").matches && view.matchMedia("(hover: none)").matches
    ? "touch"
    : "desktop";
}

function attachFullscreenToggle(button: HTMLButtonElement, document: Document): () => void {
  const target = document.documentElement;
  const supported = typeof target.requestFullscreen === "function"
    && typeof document.exitFullscreen === "function";

  if (!supported) {
    button.hidden = true;
    return () => undefined;
  }

  const synchronize = (): void => {
    const active = document.fullscreenElement !== null;
    const label = active ? "전체 화면 종료" : "전체 화면으로 전환";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(active));
    button.title = label;
  };

  const onClick = (): void => {
    const operation = document.fullscreenElement
      ? document.exitFullscreen()
      : target.requestFullscreen();
    void operation.catch(synchronize);
  };
  button.addEventListener("click", onClick);
  document.addEventListener("fullscreenchange", synchronize);
  synchronize();
  return () => {
    button.removeEventListener("click", onClick);
    document.removeEventListener("fullscreenchange", synchronize);
  };
}

function closeAppMenu(button: HTMLButtonElement, menu: HTMLElement): void {
  button.setAttribute("aria-expanded", "false");
  menu.hidden = true;
  button.focus();
}

function attachAppMenuToggle(button: HTMLButtonElement, menu: HTMLElement): () => void {
  const onClick = (): void => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    menu.hidden = expanded;
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || menu.hidden) return;
    event.preventDefault();
    closeAppMenu(button, menu);
  };
  button.addEventListener("click", onClick);
  button.ownerDocument.addEventListener("keydown", onKeyDown);
  return () => {
    button.removeEventListener("click", onClick);
    button.ownerDocument.removeEventListener("keydown", onKeyDown);
  };
}

function attachAppMenuTabs(
  tabs: readonly HTMLButtonElement[],
  panels: readonly HTMLElement[],
): () => void {
  const activate = (activeIndex: number): void => {
    tabs.forEach((tab, index) => {
      const selected = index === activeIndex;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[index]!.hidden = !selected;
    });
  };
  const disposers = tabs.map((tab, index) => {
    const onClick = (): void => activate(index);
    const onKeyDown = (event: KeyboardEvent): void => {
      let nextIndex: number;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const direction = event.key === "ArrowRight" ? 1 : -1;
        nextIndex = (index + direction + tabs.length) % tabs.length;
      } else return;
      event.preventDefault();
      activate(nextIndex);
      tabs[nextIndex]?.focus();
    };
    tab.addEventListener("click", onClick);
    tab.addEventListener("keydown", onKeyDown);
    return () => {
      tab.removeEventListener("click", onClick);
      tab.removeEventListener("keydown", onKeyDown);
    };
  });
  return () => disposers.forEach((dispose) => dispose());
}

function attachModeSelector(
  buttons: readonly HTMLButtonElement[],
  document: Document,
  menuToggle: HTMLButtonElement,
  menu: HTMLElement,
): () => void {
  const disposers: Array<() => void> = [];
  for (const button of buttons) {
    if (button.disabled) {
      continue;
    }

    const onClick = (): void => {
      if (button.getAttribute("aria-current") === "true") {
        closeAppMenu(menuToggle, menu);
        return;
      }

      const mode = button.dataset.mode as WorkspaceMode;
      const previousState = buttons.map((candidate) => ({
        button: candidate,
        pressed: candidate.getAttribute("aria-pressed") ?? "false",
        current: candidate.getAttribute("aria-current"),
      }));
      for (const candidate of buttons) {
        const selected = candidate === button;
        candidate.setAttribute("aria-pressed", String(selected));
        candidate.toggleAttribute("aria-current", selected);
        if (selected) {
          candidate.setAttribute("aria-current", "true");
        }
      }

      const CustomEventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
      const accepted = document.dispatchEvent(new CustomEventConstructor("octopoly:mode-change", {
        detail: { mode },
        cancelable: true,
      }));
      if (!accepted) {
        for (const previous of previousState) {
          previous.button.setAttribute("aria-pressed", previous.pressed);
          if (previous.current === null) previous.button.removeAttribute("aria-current");
          else previous.button.setAttribute("aria-current", previous.current);
        }
        return;
      }
      closeAppMenu(menuToggle, menu);
    };
    button.addEventListener("click", onClick);
    disposers.push(() => button.removeEventListener("click", onClick));
  }
  return () => disposers.forEach((dispose) => dispose());
}

export function mountShell(root: HTMLElement): WorkspaceElements {
  const modeButtons = WORKSPACE_MODES.map(({ mode, name, koreanName, available }) => {
    const disabled = available ? "" : " disabled";
    const status = available ? "" : '<span class="mode-button-status">준비 중</span>';
    return `
      <button class="mode-button" type="button" data-mode="${mode}" aria-pressed="false"${disabled}>
        <span class="mode-button-label">
          <span class="mode-button-name">${name}</span>
          <span class="mode-button-korean">${koreanName}</span>
        </span>
        ${status}
      </button>
    `;
  }).join("");

  const inputProfile = controlsProfile(root.ownerDocument);
  const controlsHelp = CONTROL_HELP[inputProfile]
    .map(([input, action]) => `<li><kbd>${input}</kbd> <span>— ${action}</span></li>`)
    .join("");

  root.innerHTML = `
    <main class="workspace" aria-labelledby="octopoly-title">
      <h1 id="octopoly-title" class="visually-hidden">OctoPoly</h1>
      <section class="viewport" aria-label="3D viewport">
        <canvas tabindex="0" aria-label="기본 큐브가 있는 3D 뷰포트"></canvas>
        <div class="viewport-overlay"></div>
        <div class="facial-panel-layer"></div>
        <div class="app-menu-anchor">
          <button class="app-menu-toggle" type="button" aria-label="OctoPoly 메뉴" aria-expanded="false" aria-controls="octopoly-app-menu">
            <img class="wordmark" src="/assets/octopoly-wordmark.png" alt="" draggable="false" />
          </button>
          <nav id="octopoly-app-menu" class="app-menu" aria-label="OctoPoly 앱 메뉴" hidden>
            <div class="app-menu-tabs" role="tablist" aria-label="App menu sections">
              <button id="app-menu-tab-modes" class="app-menu-tab" type="button" role="tab" aria-selected="true" aria-controls="app-menu-panel-modes" tabindex="0">Modes</button>
              <button id="app-menu-tab-controls" class="app-menu-tab" type="button" role="tab" aria-selected="false" aria-controls="app-menu-panel-controls" tabindex="-1">Controls Help</button>
            </div>
            <div id="app-menu-panel-modes" class="app-menu-panel" role="tabpanel" aria-labelledby="app-menu-tab-modes" tabindex="0">
              <section class="app-menu-section" aria-labelledby="work-mode-heading">
                <h2 id="work-mode-heading" class="app-menu-heading">작업 모드</h2>
                <div class="app-menu-items">${modeButtons}</div>
              </section>
            </div>
            <div id="app-menu-panel-controls" class="app-menu-panel" role="tabpanel" aria-labelledby="app-menu-tab-controls" tabindex="0" hidden>
              <ul class="controls-help-list" data-input-profile="${inputProfile}">${controlsHelp}</ul>
            </div>
          </nav>
        </div>
        <p class="controls">드래그: 회전 · 휠/핀치: 줌</p>
        <div class="viewport-actions">
          <p class="status" role="status" aria-live="polite">3D 뷰포트 준비 중…</p>
          <button class="fullscreen-toggle" type="button" aria-label="전체 화면으로 전환" aria-pressed="false" title="전체 화면으로 전환">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
            </svg>
          </button>
        </div>
      </section>
    </main>
  `;

  const canvas = root.querySelector("canvas");
  const status = root.querySelector<HTMLElement>(".status");
  const fullscreenToggle = root.querySelector<HTMLButtonElement>(".fullscreen-toggle");
  const panelContainer = root.querySelector<HTMLElement>(".facial-panel-layer");
  const overlayContainer = root.querySelector<HTMLElement>(".viewport-overlay");
  const appMenuToggle = root.querySelector<HTMLButtonElement>(".app-menu-toggle");
  const appMenu = root.querySelector<HTMLElement>(".app-menu");
  const appMenuTabs = [...root.querySelectorAll<HTMLButtonElement>('.app-menu [role="tab"]')];
  const appMenuPanels = [...root.querySelectorAll<HTMLElement>('.app-menu [role="tabpanel"]')];
  const workspaceModeButtons = [...root.querySelectorAll<HTMLButtonElement>(".mode-button")];
  if (
    !(canvas instanceof HTMLCanvasElement)
    || !status
    || !fullscreenToggle
    || !panelContainer
    || !overlayContainer
    || !appMenuToggle
    || !appMenu
    || appMenuTabs.length !== 2
    || appMenuPanels.length !== appMenuTabs.length
    || workspaceModeButtons.length !== WORKSPACE_MODES.length
  ) {
    throw new Error("OctoPoly workspace could not be created.");
  }

  const disposers = [
    attachAppMenuToggle(appMenuToggle, appMenu),
    attachAppMenuTabs(appMenuTabs, appMenuPanels),
    attachModeSelector(workspaceModeButtons, root.ownerDocument, appMenuToggle, appMenu),
    attachFullscreenToggle(fullscreenToggle, root.ownerDocument),
  ];
  let disposed = false;
  return {
    canvas,
    status,
    fullscreenToggle,
    panelContainer,
    overlayContainer,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers) dispose();
    },
  };
}
