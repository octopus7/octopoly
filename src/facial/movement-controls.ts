import {
  createVertexMovementModeState,
  getConstrainedPlaneSelectorPlanes,
  vertexMovementModeReducer,
  WORLD_PLANES,
  type VertexMovementMode,
  type VertexMovementModeState,
  type WorldPlane,
} from "./movement-mode";

export interface MovementControlsOptions {
  readonly onChange: (state: VertexMovementModeState) => void;
}

export interface MovementControls {
  readonly element: HTMLElement;
  readonly state: VertexMovementModeState;
  dispose(): void;
}

const MODE_LABELS: Readonly<Record<VertexMovementMode, string>> = {
  gizmo: "기즈모",
  "view-plane": "뷰 평면",
  "constrained-plane": "제한 평면",
};

let movementControlsSequence = 0;

export function mountMovementControls(
  panel: HTMLElement,
  overlay: HTMLElement,
  options: MovementControlsOptions,
): MovementControls {
  const document = panel.ownerDocument;
  const toolStrip = panel.matches(".facial-tool-strip")
    ? panel
    : panel.querySelector<HTMLElement>(".facial-tool-strip") ?? panel;
  const element = document.createElement("section");
  element.className = "movement-controls";
  element.setAttribute("aria-label", "버텍스 이동 모드");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "facial-tool-button movement-controls__toggle";
  trigger.dataset.action = "toggle-movement-controls";
  trigger.setAttribute("aria-expanded", "false");
  const popover = document.createElement("div");
  popover.id = `movement-controls-popover-${++movementControlsSequence}`;
  popover.className = "movement-controls__popover";
  popover.hidden = true;
  popover.setAttribute("aria-label", "버텍스 이동 모드");
  trigger.setAttribute("aria-controls", popover.id);
  trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M22 12l-3-3m3 3-3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3" /></svg>';

  const modeGroup = document.createElement("div");
  modeGroup.className = "movement-mode-buttons";
  modeGroup.setAttribute("role", "group");
  modeGroup.setAttribute("aria-label", "버텍스 이동 모드 선택");
  const modeButtons = new Map<VertexMovementMode, HTMLButtonElement>();
  const modeDisposers: Array<() => void> = [];

  const planeOptions = document.createElement("fieldset");
  planeOptions.className = "movement-plane-options";
  const legend = document.createElement("legend");
  legend.textContent = "사용할 제한 평면";
  planeOptions.append(legend);
  const planeInputs = new Map<WorldPlane, HTMLInputElement>();
  const planeDisposers: Array<() => void> = [];

  const selector = document.createElement("aside");
  selector.className = "movement-plane-selector";
  selector.setAttribute("role", "toolbar");
  selector.setAttribute("aria-label", "제한 평면 전환");

  let currentState = createVertexMovementModeState();

  const publish = (): void => options.onChange(currentState);
  const render = (): void => {
    const activeLabel = MODE_LABELS[currentState.mode];
    trigger.setAttribute("aria-label", `버텍스 이동 도구: ${activeLabel}`);
    trigger.title = `버텍스 이동 도구: ${activeLabel}`;
    for (const [mode, button] of modeButtons) {
      button.setAttribute("aria-pressed", String(currentState.mode === mode));
    }
    planeOptions.hidden = currentState.mode !== "constrained-plane";
    for (const [plane, input] of planeInputs) {
      input.checked = currentState.enabledConstrainedPlanes.includes(plane);
    }
    const selectorPlanes = currentState.mode === "constrained-plane"
      ? getConstrainedPlaneSelectorPlanes(currentState)
      : [];
    selector.hidden = selectorPlanes.length === 0;
    selector.replaceChildren(...selectorPlanes.map((plane) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.constrainedPlane = plane;
      button.textContent = plane.toUpperCase();
      button.setAttribute("aria-pressed", String(currentState.activeConstrainedPlane === plane));
      button.addEventListener("click", () => {
        currentState = vertexMovementModeReducer(currentState, {
          type: "select-constrained-plane",
          plane,
        });
        render();
        publish();
      });
      return button;
    }));
  };

  for (const mode of ["gizmo", "view-plane", "constrained-plane"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.movementMode = mode;
    button.textContent = MODE_LABELS[mode];
    const onClick = (): void => {
      currentState = vertexMovementModeReducer(currentState, { type: "set-mode", mode });
      render();
      publish();
    };
    button.addEventListener("click", onClick);
    modeDisposers.push(() => button.removeEventListener("click", onClick));
    modeButtons.set(mode, button);
    modeGroup.append(button);
  }

  for (const plane of WORLD_PLANES) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.planeEnabled = plane;
    const onChange = (): void => {
      currentState = vertexMovementModeReducer(currentState, {
        type: "set-constrained-plane-enabled",
        plane,
        enabled: input.checked,
      });
      render();
      publish();
    };
    input.addEventListener("change", onChange);
    planeDisposers.push(() => input.removeEventListener("change", onChange));
    planeInputs.set(plane, input);
    label.append(input, document.createTextNode(plane.toUpperCase()));
    planeOptions.append(label);
  }

  const setOpen = (open: boolean, restoreFocus = false): void => {
    trigger.setAttribute("aria-expanded", String(open));
    popover.hidden = !open;
    if (restoreFocus) trigger.focus();
  };
  const handleToggle = (): void => {
    const open = popover.hidden !== false;
    setOpen(open);
    if (open) {
      const CustomEventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
      document.dispatchEvent(new CustomEventConstructor("facial:tool-popover-open", {
        detail: popover,
      }));
    }
  };
  const handlePopoverKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || popover.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false, true);
  };
  const handleOtherToolPopover = (event: Event): void => {
    if ((event as CustomEvent<HTMLElement>).detail !== popover) setOpen(false);
  };
  trigger.addEventListener("click", handleToggle);
  element.addEventListener("keydown", handlePopoverKeydown);
  document.addEventListener("facial:tool-popover-open", handleOtherToolPopover);

  popover.append(modeGroup, planeOptions);
  element.append(trigger, popover);
  toolStrip.insertBefore(element, toolStrip.querySelector(".facial-mesh-drawer-toggle"));
  overlay.append(selector);
  render();
  publish();

  let disposed = false;
  return {
    element,
    get state() {
      return currentState;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const dispose of modeDisposers) dispose();
      for (const dispose of planeDisposers) dispose();
      trigger.removeEventListener("click", handleToggle);
      element.removeEventListener("keydown", handlePopoverKeydown);
      document.removeEventListener("facial:tool-popover-open", handleOtherToolPopover);
      element.remove();
      selector.remove();
    },
  };
}
