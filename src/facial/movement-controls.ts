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

export function mountMovementControls(
  panel: HTMLElement,
  overlay: HTMLElement,
  options: MovementControlsOptions,
): MovementControls {
  const document = panel.ownerDocument;
  const element = document.createElement("section");
  element.className = "movement-controls";
  element.setAttribute("aria-label", "버텍스 이동 모드");

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

  element.append(modeGroup, planeOptions);
  const heading = panel.querySelector("h2");
  if (heading) heading.after(element);
  else panel.prepend(element);
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
      element.remove();
      selector.remove();
    },
  };
}
