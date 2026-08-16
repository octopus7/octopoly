import "./styles.css";
import { mountOctoPolyApp } from "./app";
import { parseObjMesh } from "./facial/obj";
import type { FacialViewportScene } from "./facial/scene";
import {
  startCubeViewport,
  startMeshViewport,
} from "./viewport/renderer";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("OctoPoly app root was not found.");
}

let copySequence = 0;
const nextCopyId = (): string => {
  copySequence += 1;
  return globalThis.crypto?.randomUUID
    ? `copy-${globalThis.crypto.randomUUID()}`
    : `copy-${Date.now()}-${copySequence}`;
};

mountOctoPolyApp(root, {
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  nextCopyId,
  parseObjText: parseObjMesh,
  startCube: startCubeViewport,
  startViewport: (canvas, initialScene) => {
    const viewport = startMeshViewport(canvas, initialScene);
    viewport.setSelectedVertex(initialScene.selectedVertex);
    return {
      setScene: (scene: FacialViewportScene) => {
        viewport.setScene(scene);
        viewport.setSelectedVertex(scene.selectedVertex);
      },
      projectVertex: (vertexIndex) => viewport.projectVertex(vertexIndex),
      projectAxis: (vertexIndex, axis) => viewport.projectAxis(vertexIndex, axis),
      pickVertex: (x, y, radius) => viewport.pickVertex(x, y, radius),
      focusVertex: (vertexIndex) => viewport.focusVertex(vertexIndex),
      modelDeltaForPlaneDrag: (vertexIndex, plane, from, to) =>
        viewport.modelDeltaForPlaneDrag(vertexIndex, plane, from, to),
      subscribeViewChange: (listener) => viewport.subscribeViewChange(listener),
      dispose: () => viewport.dispose(),
    };
  },
});
