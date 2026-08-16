import { loadFacialWorkspace, saveFacialWorkspace } from "./storage";
import {
  deleteMesh as deleteWorkspaceMesh,
  duplicateBaseMesh,
  moveVertex as moveWorkspaceVertex,
  moveVertexByDelta as moveWorkspaceVertexByDelta,
  renameMesh,
  replaceBaseMesh,
  selectMesh,
  type FacialWorkspace,
  type MeshGeometry,
  type VertexAxis,
  type VertexDelta,
} from "./workspace";

interface ControllerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FacialControllerOptions {
  readonly storage: ControllerStorage;
  readonly nextCopyId: () => string;
  readonly onChange: (workspace: FacialWorkspace, selectedVertex: number | null) => void;
}

export interface FacialController {
  readonly workspace: FacialWorkspace;
  readonly selectedVertex: number | null;
  readonly sceneRevision: number;
  duplicateBase(): void;
  deleteMesh(meshId: string): void;
  selectVertex(meshId: string, sceneRevision: number, vertexIndex: number | null): void;
  selectMesh(meshId: string): void;
  renameMesh(meshId: string, name: string): void;
  replaceBase(geometry: MeshGeometry): void;
  moveVertex(
    meshId: string,
    sceneRevision: number,
    vertexIndex: number,
    axis: VertexAxis,
    delta: number,
  ): void;
  moveVertexByDelta(
    meshId: string,
    sceneRevision: number,
    vertexIndex: number,
    delta: VertexDelta,
  ): void;
  dispose(): void;
}

export class FacialPersistenceError extends Error {
  constructor(cause: unknown) {
    super("페이셜 작업을 자동 저장하지 못했습니다.", { cause });
    this.name = "FacialPersistenceError";
  }
}

export function createFacialController(options: FacialControllerOptions): FacialController {
  let workspace = loadFacialWorkspace(options.storage);
  let selectedVertex: number | null = null;
  let selectedRevision: number | null = null;
  let sceneRevision = 0;
  let disposed = false;
  const commit = (
    nextWorkspace: FacialWorkspace,
    nextSelectedVertex: number | null,
    nextSceneRevision: number,
    nextSelectedRevision: number | null,
  ): void => {
    try {
      saveFacialWorkspace(options.storage, nextWorkspace);
    } catch (error) {
      throw new FacialPersistenceError(error);
    }
    workspace = nextWorkspace;
    selectedVertex = nextSelectedVertex;
    sceneRevision = nextSceneRevision;
    selectedRevision = nextSelectedRevision;
    options.onChange(workspace, selectedVertex);
  };

  return {
    get workspace() {
      return workspace;
    },
    get selectedVertex() {
      return selectedVertex;
    },
    get sceneRevision() {
      return sceneRevision;
    },
    duplicateBase: () => {
      if (disposed) return;
      const next = duplicateBaseMesh(workspace, options.nextCopyId());
      if (next === workspace) return;
      commit(next, null, sceneRevision + 1, null);
    },
    deleteMesh: (meshId) => {
      if (disposed) return;
      const next = deleteWorkspaceMesh(workspace, meshId);
      if (next === workspace) return;
      commit(next, null, sceneRevision + 1, null);
    },
    selectVertex: (meshId, requestedRevision, vertexIndex) => {
      if (disposed) return;
      if (workspace.activeMeshId !== meshId || requestedRevision !== sceneRevision) return;
      if (vertexIndex !== null) {
        const activeMesh = workspace.meshes.find((mesh) => mesh.id === meshId);
        const vertexCount = (activeMesh?.geometry.positions.length ?? 0) / 3;
        if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) return;
      }
      if (selectedVertex === vertexIndex && selectedRevision === (vertexIndex === null ? null : sceneRevision)) {
        return;
      }
      selectedVertex = vertexIndex;
      selectedRevision = vertexIndex === null ? null : sceneRevision;
      options.onChange(workspace, selectedVertex);
    },
    selectMesh: (meshId) => {
      if (disposed) return;
      const next = selectMesh(workspace, meshId);
      if (next === workspace) return;
      commit(next, null, sceneRevision + 1, null);
    },
    renameMesh: (meshId, name) => {
      if (disposed) return;
      const next = renameMesh(workspace, meshId, name);
      if (next === workspace) return;
      commit(next, selectedVertex, sceneRevision, selectedRevision);
    },
    replaceBase: (geometry) => {
      if (disposed) return;
      const next = replaceBaseMesh(workspace, geometry);
      if (next === workspace) {
        throw new Error("가져온 OBJ는 WebGL에서 안전하게 렌더링할 수 있는 geometry가 아닙니다.");
      }
      commit(next, null, sceneRevision + 1, null);
    },
    moveVertex: (meshId, requestedRevision, vertexIndex, axis, delta) => {
      if (disposed) return;
      if (workspace.activeMeshId !== meshId
        || requestedRevision !== sceneRevision
        || selectedRevision !== sceneRevision
        || selectedVertex !== vertexIndex) return;
      const next = moveWorkspaceVertex(workspace, meshId, vertexIndex, axis, delta);
      if (next === workspace) return;
      const nextRevision = sceneRevision + 1;
      commit(next, selectedVertex, nextRevision, nextRevision);
    },
    moveVertexByDelta: (meshId, requestedRevision, vertexIndex, delta) => {
      if (disposed) return;
      if (workspace.activeMeshId !== meshId
        || requestedRevision !== sceneRevision
        || selectedRevision !== sceneRevision
        || selectedVertex !== vertexIndex) return;
      const next = moveWorkspaceVertexByDelta(workspace, meshId, vertexIndex, delta);
      if (next === workspace) return;
      const nextRevision = sceneRevision + 1;
      commit(next, selectedVertex, nextRevision, nextRevision);
    },
    dispose: () => {
      disposed = true;
    },
  };
}
