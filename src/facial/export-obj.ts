import { isValidMeshGeometry, type FacialMesh, type FacialWorkspace } from "./workspace";

export type ObjExportScope = "active" | "all";

function objectName(mesh: FacialMesh): string {
  const normalized = mesh.name.normalize("NFKC").trim().replace(/[^\p{L}\p{N}._-]+/gu, "_");
  return normalized || `mesh_${mesh.id.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
}

function selectedMeshes(workspace: FacialWorkspace, scope: ObjExportScope): readonly FacialMesh[] {
  if (scope === "all") return workspace.meshes;
  const active = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId);
  if (!active) throw new Error("Active model is missing and cannot be exported.");
  return [active];
}

export function serializeWorkspaceObj(workspace: FacialWorkspace, scope: ObjExportScope): string {
  const meshes = selectedMeshes(workspace, scope);
  if (meshes.length === 0) throw new Error("Workspace has no models to export.");
  const lines = ["# OctoPoly OBJ export"];
  let vertexOffset = 0;
  let uvOffset = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    if (!isValidMeshGeometry(geometry)) throw new Error(`Model ${mesh.id} has invalid geometry.`);
    lines.push(`o ${objectName(mesh)}`);
    for (let index = 0; index < geometry.positions.length; index += 3) {
      lines.push(`v ${geometry.positions[index]} ${geometry.positions[index + 1]} ${geometry.positions[index + 2]}`);
    }
    const hasUvs = geometry.uvs !== undefined;
    if (geometry.uvs) {
      for (let index = 0; index < geometry.uvs.length; index += 2) {
        lines.push(`vt ${geometry.uvs[index]} ${geometry.uvs[index + 1]}`);
      }
    }
    for (let index = 0; index < geometry.indices.length; index += 3) {
      const face = [0, 1, 2].map((corner) => {
        const local = geometry.indices[index + corner]!;
        const vertex = vertexOffset + local + 1;
        return hasUvs ? `${vertex}/${uvOffset + local + 1}` : String(vertex);
      });
      lines.push(`f ${face.join(" ")}`);
    }
    vertexOffset += geometry.positions.length / 3;
    if (geometry.uvs) uvOffset += geometry.uvs.length / 2;
  }
  lines.push("");
  return lines.join("\n");
}
