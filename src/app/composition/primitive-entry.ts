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
import { COW_RECIPE, CUBE_RECIPE, DUCK_RECIPE, FROG_RECIPE, PIG_RECIPE, PLANE_RECIPE, RABBIT_RECIPE, type PrimitiveRecipe } from "./primitive-recipes";

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
