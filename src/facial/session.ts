import type { FacialController } from "./controller";
import type { MeshGeometry, VertexAxis } from "./workspace";

export interface FacialSessionOptions {
  readonly controller: FacialController;
  readonly parseObjText: (source: string) => MeshGeometry;
}

export interface FacialSession {
  importObj(file: File): Promise<void>;
  duplicateBase(): void;
  selectMesh(meshId: string): void;
  renameMesh(meshId: string, name: string): void;
  selectVertex(meshId: string, sceneRevision: number, vertexIndex: number | null): void;
  moveVertex(
    meshId: string,
    sceneRevision: number,
    vertexIndex: number,
    axis: VertexAxis,
    delta: number,
  ): void;
  dispose(): void;
}

export function createFacialSession(options: FacialSessionOptions): FacialSession {
  let disposed = false;
  let importRevision = 0;
  return {
    importObj: async (file) => {
      if (disposed) return;
      const revision = ++importRevision;
      let source: string;
      try {
        source = await file.text();
      } catch (error) {
        if (disposed || revision !== importRevision) return;
        throw error;
      }
      if (disposed || revision !== importRevision) return;
      options.controller.replaceBase(options.parseObjText(source));
    },
    duplicateBase: () => {
      if (disposed) return;
      importRevision += 1;
      options.controller.duplicateBase();
    },
    selectMesh: (meshId) => {
      if (disposed) return;
      importRevision += 1;
      options.controller.selectMesh(meshId);
    },
    renameMesh: (meshId, name) => {
      if (disposed) return;
      importRevision += 1;
      options.controller.renameMesh(meshId, name);
    },
    selectVertex: (meshId, sceneRevision, vertexIndex) => {
      if (disposed) return;
      importRevision += 1;
      options.controller.selectVertex(meshId, sceneRevision, vertexIndex);
    },
    moveVertex: (meshId, sceneRevision, vertexIndex, axis, delta) => {
      if (disposed) return;
      importRevision += 1;
      options.controller.moveVertex(meshId, sceneRevision, vertexIndex, axis, delta);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      importRevision += 1;
      options.controller.dispose();
    },
  };
}
