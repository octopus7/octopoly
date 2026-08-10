import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mountBasicPrimitivesUi,
  type BasicPrimitivesUiCallbacks,
} from "../../src/app/basic-primitives-ui";

function callbacks(): BasicPrimitivesUiCallbacks {
  return {
    importReference: vi.fn(),
    addPlane: vi.fn(),
    addCube: vi.fn(),
    addDuck: vi.fn(),
    addFrog: vi.fn(),
    addPig: vi.fn(),
    addCow: vi.fn(),
    addRabbit: vi.fn(),
    addCat: vi.fn(),
    addDog: vi.fn(),
    addFish: vi.fn(),
    addTurtle: vi.fn(),
    addElephant: vi.fn(),
    addCup: vi.fn(),
    addChair: vi.fn(),
    addFlowerpot: vi.fn(),
    addKettle: vi.fn(),
    addSneaker: vi.fn(),
    addBackpack: vi.fn(),
    addHelmet: vi.fn(),
    addGamepad: vi.fn(),
    addCamera: vi.fn(),
    addBicycleSaddle: vi.fn(),
    addCar: vi.fn(),
    addRocket: vi.fn(),
    addTreasureChest: vi.fn(),
    frameSelection: vi.fn(),
    save: vi.fn(),
    reload: vi.fn(),
    exportObj: vi.fn(),
    exportGlb: vi.fn(),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("basic primitives empty-state UI", () => {
  it("mounts a full New Scene choice over an existing canvas without replacing it", () => {
    const viewport = document.createElement("section");
    const canvas = document.createElement("canvas");
    viewport.append(canvas);
    document.body.append(viewport);

    const ui = mountBasicPrimitivesUi(viewport, callbacks(), {
      emptyMesh: true,
      hasReference: false,
      busy: false,
      error: null,
      status: null,
    });

    expect(viewport.querySelector("canvas")).toBe(canvas);
    expect(viewport.contains(ui.element)).toBe(true);
    expect(ui.element.dataset.presentation).toBe("full");
    expect(ui.element.getAttribute("aria-label")).toBe("New Scene actions");
    expect(ui.element.textContent).toContain("New Scene");
  });

  it("routes every action button to its real callback", () => {
    const viewport = document.createElement("section");
    document.body.append(viewport);
    const actions = callbacks();
    const ui = mountBasicPrimitivesUi(viewport, actions, {
      emptyMesh: false,
      hasReference: false,
      busy: false,
      error: null,
      status: null,
    });

    const expected = [
      ["Import Reference", actions.importReference],
      ["Add Plane", actions.addPlane],
      ["Add Cube", actions.addCube],
      ["Add Duck", actions.addDuck],
      ["Add Frog", actions.addFrog],
      ["Add Pig", actions.addPig],
      ["Add Cow", actions.addCow],
      ["Add Rabbit", actions.addRabbit],
      ["Add Cat", actions.addCat],
      ["Add Dog", actions.addDog],
      ["Add Fish", actions.addFish],
      ["Add Turtle", actions.addTurtle],
      ["Add Elephant", actions.addElephant],
      ["Add Cup", actions.addCup],
      ["Add Chair", actions.addChair],
      ["Add Flowerpot", actions.addFlowerpot],
      ["Add Kettle", actions.addKettle],
      ["Add Sneaker", actions.addSneaker],
      ["Add Backpack", actions.addBackpack],
      ["Add Helmet", actions.addHelmet],
      ["Add Gamepad", actions.addGamepad],
      ["Add Camera", actions.addCamera],
      ["Add Bicycle Saddle", actions.addBicycleSaddle],
      ["Add Car", actions.addCar],
      ["Add Rocket", actions.addRocket],
      ["Add Treasure Chest", actions.addTreasureChest],
      ["Frame Selection", actions.frameSelection],
      ["Save Project", actions.save],
      ["Reload Project", actions.reload],
      ["Export OBJ", actions.exportObj],
      ["Export GLB", actions.exportGlb],
    ] as const;

    for (const [label, callback] of expected) {
      const button = ui.element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button, label).not.toBeNull();
      button?.click();
      expect(callback, label).toHaveBeenCalledTimes(1);
    }
  });

  it("transitions full to compact to hidden and returns after undo-to-empty", () => {
    const viewport = document.createElement("section");
    document.body.append(viewport);
    const ui = mountBasicPrimitivesUi(viewport, callbacks(), {
      emptyMesh: true,
      hasReference: false,
      busy: false,
      error: null,
      status: null,
    });

    const emptyState = ui.element.querySelector<HTMLElement>("[data-empty-state]");
    expect(emptyState).not.toBeNull();

    ui.update({ emptyMesh: true, hasReference: true, busy: false, error: null, status: null });
    expect(ui.element.dataset.presentation).toBe("compact");
    expect(emptyState?.hidden).toBe(false);

    ui.update({ emptyMesh: false, hasReference: true, busy: false, error: null, status: null });
    expect(ui.element.dataset.presentation).toBe("hidden");
    expect(emptyState?.hidden).toBe(true);
    expect(ui.element.hidden).toBe(false);

    ui.update({ emptyMesh: true, hasReference: true, busy: false, error: null, status: "Undo complete" });
    expect(ui.element.dataset.presentation).toBe("compact");
    expect(emptyState?.hidden).toBe(false);
  });

  it("exposes native keyboard buttons with busy, disabled, status, error, and 44px hit targets", () => {
    const viewport = document.createElement("section");
    document.body.append(viewport);
    const actions = callbacks();
    const ui = mountBasicPrimitivesUi(viewport, actions, {
      emptyMesh: true,
      hasReference: false,
      busy: true,
      error: null,
      status: "Creating plane",
    });

    const buttons = Array.from(ui.element.querySelectorAll("button"));
    expect(buttons).toHaveLength(31);
    for (const button of buttons) {
      expect(button.type).toBe("button");
      expect(button.disabled).toBe(true);
      expect(button.style.minWidth).toBe("44px");
      expect(button.style.minHeight).toBe("44px");
    }
    expect(ui.element.getAttribute("aria-busy")).toBe("true");
    buttons[1]?.click();
    expect(actions.addPlane).not.toHaveBeenCalled();
    expect(ui.element.querySelector('[role="status"]')?.textContent).toBe("Creating plane");

    ui.update({ emptyMesh: false, hasReference: false, busy: false, error: "Export failed", status: "Ready" });
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    expect(ui.element.getAttribute("aria-busy")).toBe("false");
    const alert = ui.element.querySelector<HTMLElement>('[role="alert"]');
    const liveStatus = ui.element.querySelector<HTMLElement>('[role="status"]');
    expect(alert?.textContent).toBe("Export failed");
    expect(liveStatus?.textContent).toBe("Ready");
    expect(alert?.closest("[hidden]")).toBeNull();
    expect(liveStatus?.closest("[hidden]")).toBeNull();
  });

  it("keeps the expanded primitive catalog semantically grouped and keyboard-scrollable", () => {
    const viewport = document.createElement("section");
    document.body.append(viewport);
    const ui = mountBasicPrimitivesUi(viewport, callbacks(), {
      emptyMesh: true, hasReference: false, busy: false, error: null, status: null,
    });
    const catalog = ui.element.querySelector<HTMLElement>('[aria-label="Primitive catalog"]');
    expect(catalog).not.toBeNull();
    expect(catalog?.getAttribute("role")).toBe("group");
    expect(catalog?.style.overflowY).toBe("auto");
    expect(catalog?.style.maxHeight).not.toBe("");
    const buttons = Array.from(catalog?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    expect(buttons).toHaveLength(26);
    expect(buttons.every((button) => button.tabIndex === 0)).toBe(true);
  });

  it("disposes idempotently and rejects updates or callbacks after disposal", () => {
    const viewport = document.createElement("section");
    document.body.append(viewport);
    const actions = callbacks();
    const ui = mountBasicPrimitivesUi(viewport, actions, {
      emptyMesh: true,
      hasReference: false,
      busy: false,
      error: null,
      status: null,
    });
    const addPlane = ui.element.querySelector<HTMLButtonElement>('button[aria-label="Add Plane"]');

    ui.dispose();
    ui.dispose();
    addPlane?.click();

    expect(viewport.contains(ui.element)).toBe(false);
    expect(actions.addPlane).not.toHaveBeenCalled();
    expect(() => ui.update({
      emptyMesh: true,
      hasReference: false,
      busy: false,
      error: null,
      status: null,
    })).toThrow(/disposed/);
  });
});
