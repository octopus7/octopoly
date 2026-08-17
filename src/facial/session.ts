import type { FacialController } from "./controller";
import type { MeshGeometry, VertexAxis, VertexDelta } from "./workspace";

export interface FacialSessionOptions {
  readonly controller: FacialController;
  readonly parseObjText: (source: string) => MeshGeometry;
}

export interface ObjTextSource {
  text(): Promise<string>;
}

export interface FacialSession {
  importObj(source: ObjTextSource): Promise<void>;
  duplicateBase(): void;
  deleteMesh(meshId: string): void;
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
  moveVertexByDelta(
    meshId: string,
    sceneRevision: number,
    vertexIndex: number,
    delta: VertexDelta,
  ): void;
  dispose(): void;
}

export function createFacialSession(options: FacialSessionOptions): FacialSession {
  let disposed = false;
  let importRevision = 0;
  return {
    importObj: async (textSource) => {
      if (disposed) return;
      const revision = ++importRevision;
      let source: string;
      try {
        source = await textSource.text();
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
    deleteMesh: (meshId) => {
      if (disposed) return;
      importRevision += 1;
      options.controller.deleteMesh(meshId);
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
    moveVertexByDelta: (meshId, sceneRevision, vertexIndex, delta) => {
      if (disposed) return;
      importRevision += 1;
      options.controller.moveVertexByDelta(meshId, sceneRevision, vertexIndex, delta);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      importRevision += 1;
      options.controller.dispose();
    },
  };
}
