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

export function isValidMeshGeometry(geometry: MeshGeometry): boolean {
  if (!Array.isArray(geometry.positions)
    || geometry.positions.length < 9
    || geometry.positions.length % 3 !== 0
    || !Array.isArray(geometry.indices)
    || geometry.indices.length < 3
    || geometry.indices.length % 3 !== 0) return false;
  for (let index = 0; index < geometry.positions.length; index += 1) {
    const coordinate = geometry.positions[index];
    if (typeof coordinate !== "number"
      || !Number.isFinite(coordinate)
      || !Number.isFinite(Math.fround(coordinate))) return false;
  }
  const minimum = [geometry.positions[0]!, geometry.positions[1]!, geometry.positions[2]!];
  const maximum = [...minimum];
  for (let offset = 0; offset < geometry.positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, geometry.positions[offset + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, geometry.positions[offset + axis]!);
    }
  }
  const center = minimum.map((coordinate, axis) => (coordinate + maximum[axis]!) / 2);
  let radius = 0;
  for (let offset = 0; offset < geometry.positions.length; offset += 3) {
    radius = Math.max(radius, Math.hypot(
      geometry.positions[offset]! - center[0]!,
      geometry.positions[offset + 1]! - center[1]!,
      geometry.positions[offset + 2]! - center[2]!,
    ));
  }
  const requiredFrameDistance = radius * 1.1 / Math.sin(Math.PI / 8);
  if (!Number.isFinite(Math.fround(requiredFrameDistance))) return false;
  const vertexCount = geometry.positions.length / 3;
  for (let index = 0; index < geometry.indices.length; index += 1) {
    const vertexIndex = geometry.indices[index];
    if (typeof vertexIndex !== "number"
      || !Number.isInteger(vertexIndex)
      || vertexIndex < 0
      || vertexIndex >= vertexCount) return false;
  }
  const accumulatedNormals = new Float32Array(geometry.positions.length);
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const a = geometry.indices[index]! * 3;
    const b = geometry.indices[index + 1]! * 3;
    const c = geometry.indices[index + 2]! * 3;
    const ab = [
      geometry.positions[b]! - geometry.positions[a]!,
      geometry.positions[b + 1]! - geometry.positions[a + 1]!,
      geometry.positions[b + 2]! - geometry.positions[a + 2]!,
    ] as const;
    const ac = [
      geometry.positions[c]! - geometry.positions[a]!,
      geometry.positions[c + 1]! - geometry.positions[a + 1]!,
      geometry.positions[c + 2]! - geometry.positions[a + 2]!,
    ] as const;
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ] as const;
    if (normal.some((component) => !Number.isFinite(Math.fround(component)))) return false;
    for (const vertexOffset of [a, b, c]) {
      for (let component = 0; component < 3; component += 1) {
        const next = accumulatedNormals[vertexOffset + component]! + normal[component]!;
        if (!Number.isFinite(Math.fround(next))) return false;
        accumulatedNormals[vertexOffset + component] = next;
      }
    }
  }
  return true;
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
  workspace: FacialWorkspace,
  geometry: MeshGeometry,
): FacialWorkspace {
  if (!isValidMeshGeometry(geometry)) return workspace;
  return {
    version: 1,
    activeMeshId: "base",
    meshes: [{
      id: "base",
      name: "Base Mask",
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
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || !Number.isFinite(delta)) return workspace;
  const positionIndex = vertexIndex * 3 + axisOffset[axis];
  const targetMesh = workspace.meshes.find((mesh) => mesh.id === meshId);
  if (!targetMesh) return workspace;
  const current = targetMesh.geometry.positions[positionIndex];
  if (current === undefined) return workspace;
  const nextCoordinate = current + delta;
  if (!Number.isFinite(nextCoordinate) || !Number.isFinite(Math.fround(nextCoordinate))) return workspace;
  const positions = [...targetMesh.geometry.positions];
  positions[positionIndex] = nextCoordinate;
  const geometry = { ...targetMesh.geometry, positions };
  if (!isValidMeshGeometry(geometry)) return workspace;
  return {
    ...workspace,
    meshes: workspace.meshes.map((mesh) =>
      mesh.id === meshId ? { ...mesh, geometry } : mesh),
  };
}

export function selectMesh(workspace: FacialWorkspace, meshId: string): FacialWorkspace {
  if (workspace.activeMeshId === meshId) return workspace;
  return workspace.meshes.some((mesh) => mesh.id === meshId)
    ? { ...workspace, activeMeshId: meshId }
    : workspace;
}

export function renameMesh(
  workspace: FacialWorkspace,
  meshId: string,
  name: string,
): FacialWorkspace {
  const trimmedName = name.trim();
  const target = workspace.meshes.find((mesh) => mesh.id === meshId && mesh.kind === "copy");
  if (!trimmedName || !target || target.name === trimmedName) return workspace;
  return {
    ...workspace,
    meshes: workspace.meshes.map((mesh) =>
      mesh.id === meshId ? { ...mesh, name: trimmedName } : mesh),
  };
}

export function duplicateBaseMesh(workspace: FacialWorkspace, copyId: string): FacialWorkspace {
  if (!copyId.trim() || workspace.meshes.some((mesh) => mesh.id === copyId)) return workspace;
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
