import type {
  CameraSnapshot,
  HistoryService,
  MeshElementSet,
  MeshMutationService,
  MeshQuery,
  SelectionService,
  ViewportSnapshot,
} from "@octopoly/contracts";

import {
  calculateSelectedBounds,
  calculateSelectionFrame,
  type SelectionFrame,
} from "../../tools/basic/construction-plane";
import {
  createPrimitive,
  type PrimitiveCreationServices,
} from "./primitive-creation";
import { CAT_RECIPE, COW_RECIPE, DOG_RECIPE, FISH_RECIPE, CUBE_RECIPE, DUCK_RECIPE, FROG_RECIPE, PIG_RECIPE, PLANE_RECIPE, RABBIT_RECIPE, TURTLE_RECIPE, ELEPHANT_RECIPE, CUP_RECIPE, CHAIR_RECIPE, FLOWERPOT_RECIPE, KETTLE_RECIPE, SNEAKER_RECIPE, BACKPACK_RECIPE, HELMET_RECIPE, GAMEPAD_RECIPE, CAMERA_RECIPE, BICYCLE_SADDLE_RECIPE, CAR_RECIPE, ROCKET_RECIPE, TREASURE_CHEST_RECIPE, type PrimitiveRecipe } from "./primitive-recipes";

export interface BasicPrimitivesEntryDependencies extends PrimitiveCreationServices {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly history: HistoryService;
  readonly selection: SelectionService;
  readonly getCamera: () => CameraSnapshot;
  readonly getViewport: () => ViewportSnapshot;
  readonly applyFrame: (frame: SelectionFrame) => void;
  readonly requestRender: () => void;
}

export interface BasicPrimitivesEntryState {
  readonly emptyMesh: boolean;
}

export interface BasicPrimitivesEntry {
  addPlane(): MeshElementSet;
  addCube(): MeshElementSet;
  addDuck(): MeshElementSet;
  addFrog(): MeshElementSet;
  addPig(): MeshElementSet;
  addCow(): MeshElementSet;
  addRabbit(): MeshElementSet;
  addCat(): MeshElementSet;
  addDog(): MeshElementSet;
  addFish(): MeshElementSet;
  addTurtle(): MeshElementSet;
  addElephant(): MeshElementSet;
  addCup(): MeshElementSet;
  addChair(): MeshElementSet;
  addFlowerpot(): MeshElementSet;
  addKettle(): MeshElementSet;
  addSneaker(): MeshElementSet;
  addBackpack(): MeshElementSet;
  addHelmet(): MeshElementSet;
  addGamepad(): MeshElementSet;
  addCamera(): MeshElementSet;
  addBicycleSaddle(): MeshElementSet;
  addCar(): MeshElementSet;
  addRocket(): MeshElementSet;
  addTreasureChest(): MeshElementSet;
  ensureDefaultCubeForFirstMount(genuinelyNewProject: boolean): MeshElementSet | null;
  frameSelection(): SelectionFrame | null;
  state(): BasicPrimitivesEntryState;
}

export function createBasicPrimitivesEntry(
  dependencies: BasicPrimitivesEntryDependencies,
): BasicPrimitivesEntry {
  let defaultCubeMountChecked = false;
  const frameSelection = (): SelectionFrame | null => {
    const bounds = calculateSelectedBounds(
      dependencies.mesh,
      dependencies.selection.snapshot(),
    );
    if (bounds === null) {
      return null;
    }
    const frame = calculateSelectionFrame(
      bounds,
      dependencies.getCamera(),
      dependencies.getViewport(),
    );
    if (frame === null) {
      return null;
    }
    dependencies.applyFrame(frame);
    dependencies.requestRender();
    return frame;
  };

  const add = (recipe: PrimitiveRecipe): MeshElementSet => {
    const created = createPrimitive(recipe, dependencies);
    frameSelection();
    return created;
  };

  return Object.freeze({
    addPlane(): MeshElementSet {
      return add(PLANE_RECIPE);
    },
    addCube(): MeshElementSet {
      return add(CUBE_RECIPE);
    },
    addDuck(): MeshElementSet {
      return add(DUCK_RECIPE);
    },
    addFrog(): MeshElementSet {
      return add(FROG_RECIPE);
    },
    addPig(): MeshElementSet {
      return add(PIG_RECIPE);
    },
    addCow(): MeshElementSet {
      return add(COW_RECIPE);
    },
    addRabbit(): MeshElementSet {
      return add(RABBIT_RECIPE);
    },
    addCat(): MeshElementSet {
      return add(CAT_RECIPE);
    },
    addDog(): MeshElementSet {
      return add(DOG_RECIPE);
    },
    addFish(): MeshElementSet {
      return add(FISH_RECIPE);
    },
    addTurtle(): MeshElementSet {
      return add(TURTLE_RECIPE);
    },
    addElephant(): MeshElementSet {
      return add(ELEPHANT_RECIPE);
    },
    addCup(): MeshElementSet {
      return add(CUP_RECIPE);
    },
    addChair(): MeshElementSet {
      return add(CHAIR_RECIPE);
    },
    addFlowerpot(): MeshElementSet { return add(FLOWERPOT_RECIPE); },
    addKettle(): MeshElementSet { return add(KETTLE_RECIPE); },
    addSneaker(): MeshElementSet { return add(SNEAKER_RECIPE); },
    addBackpack(): MeshElementSet { return add(BACKPACK_RECIPE); },
    addHelmet(): MeshElementSet { return add(HELMET_RECIPE); },
    addGamepad(): MeshElementSet { return add(GAMEPAD_RECIPE); },
    addCamera(): MeshElementSet { return add(CAMERA_RECIPE); },
    addBicycleSaddle(): MeshElementSet { return add(BICYCLE_SADDLE_RECIPE); },
    addCar(): MeshElementSet { return add(CAR_RECIPE); },
    addRocket(): MeshElementSet { return add(ROCKET_RECIPE); },
    addTreasureChest(): MeshElementSet { return add(TREASURE_CHEST_RECIPE); },
    ensureDefaultCubeForFirstMount(genuinelyNewProject: boolean): MeshElementSet | null {
      if (defaultCubeMountChecked) return null;
      defaultCubeMountChecked = true;
      const snapshot = dependencies.mesh.snapshot();
      const empty = snapshot.vertices.length === 0 && snapshot.faces.length === 0;
      return genuinelyNewProject && empty ? add(CUBE_RECIPE) : null;
    },
    frameSelection,
    state(): BasicPrimitivesEntryState {
      const snapshot = dependencies.mesh.snapshot();
      return Object.freeze({
        emptyMesh: snapshot.vertices.length === 0 && snapshot.faces.length === 0,
      });
    },
  });
}
