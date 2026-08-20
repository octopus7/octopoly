import "./styles.css";
import { mountOctoPolyApp } from "./app";
import { parseObjMesh } from "./facial/obj";
import { createPresetTextLoader } from "./facial/preset-loader";
import { createTextureImageDecoder } from "./facial/texture-loader";
import { createProjectDownloader } from "./facial/project-download";
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

const loadPresetText = createPresetTextLoader((url) => window.fetch(url));
const decodeTextureImage = createTextureImageDecoder((source) => window.createImageBitmap(source));
const downloadProject = createProjectDownloader(
  document,
  (blob) => URL.createObjectURL(blob),
  (url) => URL.revokeObjectURL(url),
);

mountOctoPolyApp(root, {
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  },
  nextCopyId,
  parseObjText: parseObjMesh,
  loadPresetText,
  decodeTextureImage,
  downloadProject,
  startCube: startCubeViewport,
  startViewport: (canvas, initialScene) => {
    const viewport = startMeshViewport(canvas, initialScene);
    viewport.setSelectedVertex(initialScene.selectedVertex);
    let currentSelectedVertex = initialScene.selectedVertex;
    return {
      setScene: (scene: FacialViewportScene) => {
        viewport.setScene(scene);
        viewport.setSelectedVertex(scene.selectedVertex);
        currentSelectedVertex = scene.selectedVertex;
      },
      prepareScene: (scene: FacialViewportScene) => {
        const transaction = viewport.prepareScene(scene);
        const previousSelectedVertex = currentSelectedVertex;
        let committed = false;
        return {
          commit: () => {
            transaction.commit();
            committed = true;
            viewport.setSelectedVertex(scene.selectedVertex);
            currentSelectedVertex = scene.selectedVertex;
          },
          dispose: () => {
            transaction.dispose();
            if (committed) {
              try { viewport.setSelectedVertex(previousSelectedVertex); } catch { /* scene rollback remains authoritative */ }
              currentSelectedVertex = previousSelectedVertex;
            }
          },
          finalize: () => transaction.finalize(),
        };
      },
      setTexture: (textureKey, source) => viewport.setTexture(textureKey, source),
      cameraState: () => viewport.cameraState(),
      restoreCameraState: (state) => viewport.restoreCameraState(state),
      replaceTextures: (entries) => viewport.replaceTextures(entries),
      prepareTextures: (entries) => viewport.prepareTextures(entries),
      deleteTexture: (textureKey) => viewport.deleteTexture(textureKey),
      projectVertex: (vertexIndex) => viewport.projectVertex(vertexIndex),
      projectRadius: (vertexIndex, modelRadius) => viewport.projectRadius(vertexIndex, modelRadius),
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
