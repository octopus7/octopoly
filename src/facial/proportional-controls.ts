import {
  createProportionalEditState,
  PROPORTIONAL_RADIUS_MAX,
  PROPORTIONAL_RADIUS_MIN,
  PROPORTIONAL_RADIUS_STEP,
  proportionalEditReducer,
  type ProportionalEditAction,
  type ProportionalEditState,
} from "./proportional-edit";

export interface ProportionalControlsOptions {
  readonly onChange: (state: ProportionalEditState) => void;
}

export interface ProportionalInfluenceVisual {
  readonly center: { readonly x: number; readonly y: number };
  readonly radiusPixels: number;
  readonly points: readonly {
    readonly x: number;
    readonly y: number;
    readonly weight: number;
  }[];
}

export interface ProportionalControls {
  readonly element: HTMLElement;
  readonly state: ProportionalEditState;
  showInfluence(visual: ProportionalInfluenceVisual | null): void;
  dispose(): void;
}

let proportionalControlsSequence = 0;
const MAX_PROPORTIONAL_VISUAL_POINTS = 512;

export function mountProportionalControls(
  toolStrip: HTMLElement,
  _overlay: HTMLElement,
  options: ProportionalControlsOptions,
): ProportionalControls {
  const document = toolStrip.ownerDocument;
  const element = document.createElement("section");
  element.className = "proportional-controls";
  element.setAttribute("aria-label", "비례 편집");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "facial-tool-button proportional-controls__toggle";
  toggle.dataset.action = "toggle-proportional-edit";
  toggle.setAttribute("aria-label", "비례 편집 켜기");
  toggle.title = "비례 편집";
  toggle.textContent = "◉";

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "facial-tool-button proportional-controls__settings";
  settings.dataset.action = "toggle-proportional-settings";
  settings.setAttribute("aria-label", "비례 편집 설정");
  settings.setAttribute("aria-expanded", "false");
  settings.textContent = "⌄";

  const popover = document.createElement("div");
  popover.id = `proportional-controls-popover-${++proportionalControlsSequence}`;
  popover.className = "proportional-controls__popover";
  popover.hidden = true;
  popover.setAttribute("aria-label", "비례 편집 설정");
  settings.setAttribute("aria-controls", popover.id);

  const radius = document.createElement("div");
  radius.className = "proportional-controls__radius";
  const decrement = document.createElement("button");
  decrement.type = "button";
  decrement.dataset.proportionalRadiusDecrease = "true";
  decrement.setAttribute("aria-label", "영향 반경 줄이기");
  decrement.textContent = "−";
  const radiusValue = document.createElement("output");
  radiusValue.dataset.proportionalRadiusValue = "true";
  const increment = document.createElement("button");
  increment.type = "button";
  increment.dataset.proportionalRadiusIncrease = "true";
  increment.setAttribute("aria-label", "영향 반경 늘리기");
  increment.textContent = "+";
  radius.append(decrement, radiusValue, increment);

  const falloffLabel = document.createElement("label");
  falloffLabel.append(document.createTextNode("Falloff "));
  const falloff = document.createElement("select");
  falloff.dataset.proportionalFalloff = "true";
  for (const [value, label] of [["smooth", "Smooth"], ["linear", "Linear"], ["sharp", "Sharp"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    falloff.append(option);
  }
  falloffLabel.append(falloff);

  const connectedLabel = document.createElement("label");
  const connected = document.createElement("input");
  connected.type = "checkbox";
  connected.dataset.proportionalConnected = "true";
  connectedLabel.append(connected, document.createTextNode("Connected only"));
  popover.append(radius, falloffLabel, connectedLabel);
  element.append(toggle, settings, popover);
  toolStrip.insertBefore(element, toolStrip.querySelector(".facial-mesh-drawer-toggle"));

  const influence = document.createElement("div");
  influence.className = "proportional-influence";
  influence.hidden = true;
  influence.setAttribute("aria-hidden", "true");
  const influenceRing = document.createElement("div");
  influenceRing.className = "proportional-influence__ring";
  const influencePoints = document.createElement("div");
  influencePoints.className = "proportional-influence__points";
  influence.append(influenceRing, influencePoints);
  _overlay.append(influence);

  let currentState = createProportionalEditState();
  const render = (): void => {
    toggle.setAttribute("aria-pressed", String(currentState.enabled));
    toggle.setAttribute("aria-label", `비례 편집 ${currentState.enabled ? "끄기" : "켜기"}`);
    radiusValue.textContent = `${Math.round(currentState.radiusRatio * 100)}%`;
    decrement.disabled = currentState.radiusRatio <= PROPORTIONAL_RADIUS_MIN;
    increment.disabled = currentState.radiusRatio >= PROPORTIONAL_RADIUS_MAX;
    falloff.value = currentState.falloff;
    connected.checked = currentState.connectedOnly;
  };
  const publish = (action: ProportionalEditAction): void => {
    currentState = proportionalEditReducer(currentState, action);
    render();
    options.onChange(currentState);
  };
  const onToggle = (): void => publish({ type: "toggle-enabled" });
  const onDecrement = (): void => publish({
    type: "set-radius-ratio",
    radiusRatio: currentState.radiusRatio - PROPORTIONAL_RADIUS_STEP,
  });
  const onIncrement = (): void => publish({
    type: "set-radius-ratio",
    radiusRatio: currentState.radiusRatio + PROPORTIONAL_RADIUS_STEP,
  });
  const onFalloff = (): void => publish({
    type: "set-falloff",
    falloff: falloff.value as ProportionalEditState["falloff"],
  });
  const onConnected = (): void => publish({
    type: "set-connected-only",
    connectedOnly: connected.checked,
  });
  const setOpen = (open: boolean, restoreFocus = false): void => {
    settings.setAttribute("aria-expanded", String(open));
    popover.hidden = !open;
    if (restoreFocus) settings.focus();
  };
  const onSettings = (): void => {
    const open = popover.hidden !== false;
    setOpen(open);
    if (open) {
      const CustomEventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
      document.dispatchEvent(new CustomEventConstructor("facial:tool-popover-open", {
        detail: popover,
      }));
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || popover.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false, true);
  };
  const onOtherToolPopover = (event: Event): void => {
    if ((event as CustomEvent<HTMLElement>).detail !== popover) setOpen(false);
  };
  toggle.addEventListener("click", onToggle);
  settings.addEventListener("click", onSettings);
  element.addEventListener("keydown", onKeyDown);
  document.addEventListener("facial:tool-popover-open", onOtherToolPopover);
  decrement.addEventListener("click", onDecrement);
  increment.addEventListener("click", onIncrement);
  falloff.addEventListener("change", onFalloff);
  connected.addEventListener("change", onConnected);
  render();
  options.onChange(currentState);

  let disposed = false;
  return {
    element,
    get state() { return currentState; },
    showInfluence: (visual) => {
      if (!visual || !Number.isFinite(visual.radiusPixels) || visual.radiusPixels <= 0) {
        influence.hidden = true;
        influencePoints.replaceChildren();
        return;
      }
      const diameter = visual.radiusPixels * 2;
      influence.hidden = false;
      influenceRing.style.width = `${diameter}px`;
      influenceRing.style.height = `${diameter}px`;
      influenceRing.style.transform = `translate(${visual.center.x - visual.radiusPixels}px, ${visual.center.y - visual.radiusPixels}px)`;
      const positivePoints = visual.points.filter((point) => Number.isFinite(point.weight) && point.weight > 0);
      const displayedPoints = positivePoints.length <= MAX_PROPORTIONAL_VISUAL_POINTS
        ? positivePoints
        : Array.from({ length: MAX_PROPORTIONAL_VISUAL_POINTS }, (_, index) => (
            positivePoints[Math.round(index * (positivePoints.length - 1) / (MAX_PROPORTIONAL_VISUAL_POINTS - 1))]!
          ));
      influencePoints.replaceChildren(...displayedPoints.map((point) => {
        const marker = document.createElement("span");
        marker.className = "proportional-influence__point";
        marker.style.transform = `translate(${point.x}px, ${point.y}px)`;
        marker.style.opacity = String(Math.min(1, point.weight));
        return marker;
      }));
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      toggle.removeEventListener("click", onToggle);
      settings.removeEventListener("click", onSettings);
      element.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("facial:tool-popover-open", onOtherToolPopover);
      decrement.removeEventListener("click", onDecrement);
      increment.removeEventListener("click", onIncrement);
      falloff.removeEventListener("change", onFalloff);
      connected.removeEventListener("change", onConnected);
      influence.remove();
      element.remove();
    },
  };
}
