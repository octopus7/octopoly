import type { FacialWorkspace, MeshGeometry } from "./workspace";

export interface FacialViewportScene {
  readonly meshId: string;
  readonly textureKey: string;
  readonly sceneRevision: number;
  readonly geometry: MeshGeometry;
  readonly editable: true;
  readonly selectedVertex: number | null;
}

export function createFacialScene(
  workspace: FacialWorkspace,
  selectedVertex: number | null,
  sceneRevision: number,
): FacialViewportScene {
  const activeMesh = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId);
  if (!activeMesh) throw new Error("활성 페이셜 메시를 찾을 수 없습니다.");
  return {
    meshId: activeMesh.id,
    textureKey: activeMesh.id,
    sceneRevision,
    geometry: activeMesh.geometry,
    editable: true,
    selectedVertex,
  };
}
