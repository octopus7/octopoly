export interface BasicPrimitivesUiCallbacks {
  readonly importReference: () => void | Promise<void>;
  readonly addPlane: () => void | Promise<void>;
  readonly addCube: () => void | Promise<void>;
  readonly addDuck: () => void | Promise<void>;
  readonly addFrog: () => void | Promise<void>;
  readonly addPig: () => void | Promise<void>;
  readonly addCow: () => void | Promise<void>;
  readonly addRabbit: () => void | Promise<void>;
  readonly addCat: () => void | Promise<void>;
  readonly addDog: () => void | Promise<void>;
  readonly addFish: () => void | Promise<void>;
  readonly addTurtle: () => void | Promise<void>;
  readonly addElephant: () => void | Promise<void>;
  readonly addCup: () => void | Promise<void>;
  readonly addChair: () => void | Promise<void>;
  readonly addFlowerpot: () => void | Promise<void>;
  readonly addKettle: () => void | Promise<void>;
  readonly addSneaker: () => void | Promise<void>;
  readonly addBackpack: () => void | Promise<void>;
  readonly addHelmet: () => void | Promise<void>;
  readonly addGamepad: () => void | Promise<void>;
  readonly addCamera: () => void | Promise<void>;
  readonly addBicycleSaddle: () => void | Promise<void>;
  readonly addCar: () => void | Promise<void>;
  readonly addRocket: () => void | Promise<void>;
  readonly addTreasureChest: () => void | Promise<void>;
  readonly frameSelection: () => void | Promise<void>;
  readonly save: () => void | Promise<void>;
  readonly reload: () => void | Promise<void>;
  readonly exportObj: () => void | Promise<void>;
  readonly exportGlb: () => void | Promise<void>;
}

export interface BasicPrimitivesUiState {
  readonly emptyMesh: boolean;
  readonly hasReference: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly status: string | null;
}

export interface BasicPrimitivesUiAdapter {
  readonly element: HTMLElement;
  update(state: BasicPrimitivesUiState): void;
  dispose(): void;
}

type ActionName = keyof BasicPrimitivesUiCallbacks;

interface ActionDefinition {
  readonly name: ActionName;
  readonly label: string;
  readonly requiresMesh: boolean;
  readonly emptyState: boolean;
}

const ACTIONS: ReadonlyArray<ActionDefinition> = [
  { name: "importReference", label: "Import Reference", requiresMesh: false, emptyState: true },
  { name: "addPlane", label: "Add Plane", requiresMesh: false, emptyState: true },
  { name: "addCube", label: "Add Cube", requiresMesh: false, emptyState: true },
  { name: "addDuck", label: "Add Duck", requiresMesh: false, emptyState: true },
  { name: "addFrog", label: "Add Frog", requiresMesh: false, emptyState: true },
  { name: "addPig", label: "Add Pig", requiresMesh: false, emptyState: true },
  { name: "addCow", label: "Add Cow", requiresMesh: false, emptyState: true },
  { name: "addRabbit", label: "Add Rabbit", requiresMesh: false, emptyState: true },
  { name: "addCat", label: "Add Cat", requiresMesh: false, emptyState: true },
  { name: "addDog", label: "Add Dog", requiresMesh: false, emptyState: true },
  { name: "addFish", label: "Add Fish", requiresMesh: false, emptyState: true },
  { name: "addTurtle", label: "Add Turtle", requiresMesh: false, emptyState: true },
  { name: "addElephant", label: "Add Elephant", requiresMesh: false, emptyState: true },
  { name: "addCup", label: "Add Cup", requiresMesh: false, emptyState: true },
  { name: "addChair", label: "Add Chair", requiresMesh: false, emptyState: true },
  { name: "addFlowerpot", label: "Add Flowerpot", requiresMesh: false, emptyState: true },
  { name: "addKettle", label: "Add Kettle", requiresMesh: false, emptyState: true },
  { name: "addSneaker", label: "Add Sneaker", requiresMesh: false, emptyState: true },
  { name: "addBackpack", label: "Add Backpack", requiresMesh: false, emptyState: true },
  { name: "addHelmet", label: "Add Helmet", requiresMesh: false, emptyState: true },
  { name: "addGamepad", label: "Add Gamepad", requiresMesh: false, emptyState: true },
  { name: "addCamera", label: "Add Camera", requiresMesh: false, emptyState: true },
  { name: "addBicycleSaddle", label: "Add Bicycle Saddle", requiresMesh: false, emptyState: true },
  { name: "addCar", label: "Add Car", requiresMesh: false, emptyState: true },
  { name: "addRocket", label: "Add Rocket", requiresMesh: false, emptyState: true },
  { name: "addTreasureChest", label: "Add Treasure Chest", requiresMesh: false, emptyState: true },
  { name: "frameSelection", label: "Frame Selection", requiresMesh: true, emptyState: false },
  { name: "save", label: "Save Project", requiresMesh: false, emptyState: false },
  { name: "reload", label: "Reload Project", requiresMesh: false, emptyState: false },
  { name: "exportObj", label: "Export OBJ", requiresMesh: true, emptyState: false },
  { name: "exportGlb", label: "Export GLB", requiresMesh: true, emptyState: false },
];

export function mountBasicPrimitivesUi(
  viewport: HTMLElement,
  callbacks: BasicPrimitivesUiCallbacks,
  initialState: BasicPrimitivesUiState,
): BasicPrimitivesUiAdapter {
  const document = viewport.ownerDocument;
  const element = document.createElement("section");
  element.className = "octopoly-basic-primitives-ui";
  element.setAttribute("aria-label", "New Scene actions");
  Object.assign(element.style, {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    pointerEvents: "none",
  });

  const emptyState = document.createElement("div");
  emptyState.className = "octopoly-new-scene";
  emptyState.dataset.emptyState = "";
  Object.assign(emptyState.style, {
    boxSizing: "border-box",
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "20px",
    maxWidth: "min(420px, calc(100% - 32px))",
    border: "1px solid rgba(255, 255, 255, 0.24)",
    borderRadius: "16px",
    background: "rgba(20, 24, 34, 0.92)",
    color: "#ffffff",
    pointerEvents: "auto",
  });

  const heading = document.createElement("h2");
  heading.textContent = "New Scene";
  heading.style.margin = "0";
  emptyState.append(heading);

  const emptyActions = document.createElement("div");
  emptyActions.setAttribute("role", "group");
  emptyActions.setAttribute("aria-label", "Primitive catalog");
  Object.assign(emptyActions.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    maxHeight: "min(52vh, 440px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingInlineEnd: "4px",
  });
  emptyState.append(emptyActions);

  const toolbar = document.createElement("div");
  toolbar.className = "octopoly-basic-primitives-actions";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Project and mesh actions");
  Object.assign(toolbar.style, {
    position: "absolute",
    right: "16px",
    bottom: "16px",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "8px",
    pointerEvents: "auto",
  });

  let disposed = false;
  const buttons = new Map<ActionName, HTMLButtonElement>();
  for (const action of ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", action.label);
    button.textContent = action.label;
    Object.assign(button.style, {
      boxSizing: "border-box",
      minWidth: "44px",
      minHeight: "44px",
      padding: "10px 14px",
      touchAction: "manipulation",
    });
    button.addEventListener("click", () => {
      if (!disposed) void callbacks[action.name]();
    });
    buttons.set(action.name, button);
    (action.emptyState ? emptyActions : toolbar).append(button);
  }

  const feedback = document.createElement("div");
  feedback.className = "octopoly-basic-primitives-feedback";
  Object.assign(feedback.style, {
    position: "absolute",
    left: "16px",
    bottom: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    color: "#ffffff",
    pointerEvents: "none",
  });

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.margin = "0";
  feedback.append(status);

  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  error.style.margin = "0";
  feedback.append(error);

  element.append(emptyState, toolbar, feedback);
  viewport.append(element);

  const render = (state: BasicPrimitivesUiState): void => {
    const presentation = !state.emptyMesh
      ? "hidden"
      : state.hasReference
        ? "compact"
        : "full";
    element.dataset.presentation = presentation;
    element.setAttribute("aria-busy", String(state.busy));
    emptyState.hidden = presentation === "hidden";
    emptyState.style.display = presentation === "hidden" ? "none" : "flex";
    emptyState.style.left = presentation === "full" ? "50%" : "16px";
    emptyState.style.top = presentation === "full" ? "50%" : "16px";
    emptyState.style.transform = presentation === "full" ? "translate(-50%, -50%)" : "none";
    emptyState.style.padding = presentation === "compact" ? "12px" : "20px";

    for (const action of ACTIONS) {
      const button = buttons.get(action.name);
      if (button !== undefined) {
        button.disabled = state.busy || (action.requiresMesh && state.emptyMesh);
      }
    }

    status.textContent = state.status ?? "";
    status.hidden = state.status === null;
    error.textContent = state.error ?? "";
    error.hidden = state.error === null;
  };
  render(initialState);

  return {
    element,
    update(state) {
      if (disposed) throw new Error("basic primitives UI is disposed");
      render(state);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      element.remove();
    },
  };
}
