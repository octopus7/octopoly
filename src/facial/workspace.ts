export type MeshKind = "base" | "copy";

export interface MeshGeometry {
  readonly positions: number[];
  readonly indices: number[];
}

export interface FacialMesh {
  readonly id: string;
  readonly name: string;
  readonly kind: MeshKind;
  readonly geometry: MeshGeometry;
}

export interface FacialWorkspace {
  readonly version: 1;
  readonly activeMeshId: string;
  readonly meshes: FacialMesh[];
}

export function createPlaceholderMask(): MeshGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const vertexByCoordinate = new Map<string, number>();
  const columns = 12;
  const rows = 14;
  const step = 0.4;
  const halfWidth = columns * step / 2;
  const halfHeight = rows * step / 2;

  const vertexIndex = (column: number, row: number): number => {
    const x = -halfWidth + column * step;
    const y = -halfHeight + row * step;
    const key = `${column}:${row}`;
    const existing = vertexByCoordinate.get(key);
    if (existing !== undefined) return existing;
    const radial = Math.min(1, (x / halfWidth) ** 2 + (y / halfHeight) ** 2);
    const index = positions.length / 3;
    positions.push(x, y, 0.28 * (1 - radial));
    vertexByCoordinate.set(key, index);
    return index;
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const centerX = -halfWidth + (column + 0.5) * step;
      const centerY = -halfHeight + (row + 0.5) * step;
      const insideOuterMask = (centerX / 2.3) ** 2 + (centerY / 2.7) ** 2 <= 1;
      const insideEyeOpening = ((Math.abs(centerX) - 0.85) / 0.7) ** 2
        + ((centerY - 0.8) / 0.55) ** 2 < 1;
      const insideMouthOpening = (centerX / 1.05) ** 2
        + ((centerY + 0.8) / 0.45) ** 2 < 1;
      if (!insideOuterMask || insideEyeOpening || insideMouthOpening) continue;
      const bottomLeft = vertexIndex(column, row);
      const bottomRight = vertexIndex(column + 1, row);
      const topRight = vertexIndex(column + 1, row + 1);
      const topLeft = vertexIndex(column, row + 1);
      indices.push(bottomLeft, bottomRight, topRight, bottomLeft, topRight, topLeft);
    }
  }

  return { positions, indices };
}

export function replaceBaseMesh(
  _workspace: FacialWorkspace,
  geometry: MeshGeometry,
  name: string,
): FacialWorkspace {
  return {
    version: 1,
    activeMeshId: "base",
    meshes: [{
      id: "base",
      name: name.trim(),
      kind: "base",
      geometry: {
        positions: [...geometry.positions],
        indices: [...geometry.indices],
      },
    }],
  };
}

export type VertexAxis = "x" | "y" | "z";

export function moveVertex(
  workspace: FacialWorkspace,
  meshId: string,
  vertexIndex: number,
  axis: VertexAxis,
  delta: number,
): FacialWorkspace {
  const axisOffset: Record<VertexAxis, number> = { x: 0, y: 1, z: 2 };
  const positionIndex = vertexIndex * 3 + axisOffset[axis];
  return {
    ...workspace,
    meshes: workspace.meshes.map((mesh) => {
      if (mesh.id !== meshId || positionIndex < 0 || positionIndex >= mesh.geometry.positions.length) {
        return mesh;
      }
      const positions = [...mesh.geometry.positions];
      positions[positionIndex] = (positions[positionIndex] ?? 0) + delta;
      return {
        ...mesh,
        geometry: { ...mesh.geometry, positions },
      };
    }),
  };
}

export function selectMesh(workspace: FacialWorkspace, meshId: string): FacialWorkspace {
  return workspace.meshes.some((mesh) => mesh.id === meshId)
    ? { ...workspace, activeMeshId: meshId }
    : workspace;
}

export function renameMesh(
  workspace: FacialWorkspace,
  meshId: string,
  name: string,
): FacialWorkspace {
  return {
    ...workspace,
    meshes: workspace.meshes.map((mesh) =>
      mesh.id === meshId && mesh.kind === "copy" ? { ...mesh, name: name.trim() } : mesh),
  };
}

export function duplicateBaseMesh(workspace: FacialWorkspace, copyId: string): FacialWorkspace {
  const baseMesh = workspace.meshes.find((mesh) => mesh.kind === "base");
  if (!baseMesh) throw new Error("복제할 base mesh가 없습니다.");
  const copyNumber = workspace.meshes.filter((mesh) => mesh.kind === "copy").length + 1;
  const copy: FacialMesh = {
    id: copyId,
    name: `${baseMesh.name} Copy ${copyNumber}`,
    kind: "copy",
    geometry: {
      positions: [...baseMesh.geometry.positions],
      indices: [...baseMesh.geometry.indices],
    },
  };
  return {
    ...workspace,
    activeMeshId: copy.id,
    meshes: [...workspace.meshes, copy],
  };
}

export function createDefaultFacialWorkspace(): FacialWorkspace {
  return {
    version: 1,
    activeMeshId: "base",
    meshes: [{
      id: "base",
      name: "Base Mask",
      kind: "base",
      geometry: createPlaceholderMask(),
    }],
  };
}
