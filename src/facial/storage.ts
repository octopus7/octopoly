import {
  createDefaultFacialWorkspace,
  isValidMeshGeometry,
  type FacialWorkspace,
  type MeshGeometry,
} from "./workspace";

export const FACIAL_WORKSPACE_STORAGE_KEY = "octopoly:facial-workspace:v1";

interface ReadStorage {
  getItem(key: string): string | null;
}

interface WriteStorage {
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFacialWorkspace(value: unknown): value is FacialWorkspace {
  if (!isRecord(value) || value.version !== 1 || typeof value.activeMeshId !== "string") return false;
  if (!Array.isArray(value.meshes) || value.meshes.length === 0) return false;
  let baseCount = 0;
  const ids = new Set<string>();
  for (const mesh of value.meshes) {
    if (!isRecord(mesh) || typeof mesh.id !== "string" || typeof mesh.name !== "string") return false;
    if (mesh.kind !== "base" && mesh.kind !== "copy") return false;
    if (!mesh.id.trim() || !mesh.name.trim()) return false;
    if (mesh.kind === "base") {
      if (mesh.id !== "base" || mesh.name !== "Base Mask") return false;
      baseCount += 1;
    }
    if (ids.has(mesh.id) || !isRecord(mesh.geometry)) return false;
    ids.add(mesh.id);
    if (!isValidMeshGeometry(mesh.geometry as unknown as MeshGeometry)) return false;
  }
  return baseCount === 1 && ids.has(value.activeMeshId);
}

export function loadFacialWorkspace(storage: ReadStorage): FacialWorkspace {
  try {
    const serialized = storage.getItem(FACIAL_WORKSPACE_STORAGE_KEY);
    if (!serialized) return createDefaultFacialWorkspace();
    const parsed: unknown = JSON.parse(serialized);
    return isFacialWorkspace(parsed) ? parsed : createDefaultFacialWorkspace();
  } catch {
    return createDefaultFacialWorkspace();
  }
}

export function saveFacialWorkspace(storage: WriteStorage, workspace: FacialWorkspace): void {
  storage.setItem(FACIAL_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}
