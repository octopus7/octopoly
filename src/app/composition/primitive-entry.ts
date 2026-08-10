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
import { CUBE_RECIPE, PLANE_RECIPE } from "./primitive-recipes";

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
  frameSelection(): SelectionFrame | null;
  state(): BasicPrimitivesEntryState;
}

export function createBasicPrimitivesEntry(
  dependencies: BasicPrimitivesEntryDependencies,
): BasicPrimitivesEntry {
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

  return Object.freeze({
    addPlane(): MeshElementSet {
      const created = createPrimitive(PLANE_RECIPE, dependencies);
      frameSelection();
      return created;
    },
    addCube(): MeshElementSet {
      const created = createPrimitive(CUBE_RECIPE, dependencies);
      frameSelection();
      return created;
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
