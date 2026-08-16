export interface ProjectedPosition {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export function pickVertex(
  positions: readonly number[],
  matrix: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number | null {
  let selected: number | null = null;
  let nearestDistance = radius * radius;
  let nearestDepth = Number.POSITIVE_INFINITY;
  for (let vertexIndex = 0; vertexIndex < positions.length / 3; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    const projected = projectPosition([
      positions[offset] ?? 0,
      positions[offset + 1] ?? 0,
      positions[offset + 2] ?? 0,
    ], matrix, width, height);
    if (!projected || projected.depth < -1 || projected.depth > 1) continue;
    const distance = (projected.x - x) ** 2 + (projected.y - y) ** 2;
    if (distance < nearestDistance || (distance === nearestDistance && projected.depth < nearestDepth)) {
      selected = vertexIndex;
      nearestDistance = distance;
      nearestDepth = projected.depth;
    }
  }
  return selected;
}

export function projectPosition(
  position: readonly [number, number, number],
  matrix: Float32Array,
  width: number,
  height: number,
): ProjectedPosition | null {
  const [x, y, z] = position;
  const clipX = (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0);
  const clipY = (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0);
  const clipZ = (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0);
  const clipW = (matrix[3] ?? 0) * x + (matrix[7] ?? 0) * y + (matrix[11] ?? 0) * z + (matrix[15] ?? 0);
  if (!Number.isFinite(clipW) || clipW <= 0) return null;
  const normalizedX = clipX / clipW;
  const normalizedY = clipY / clipW;
  return {
    x: (normalizedX * 0.5 + 0.5) * width,
    y: (0.5 - normalizedY * 0.5) * height,
    depth: clipZ / clipW,
  };
}

export function interleavePositionsAndNormals(
  positions: readonly number[],
  indices: readonly number[],
): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = (indices[index] ?? 0) * 3;
    const b = (indices[index + 1] ?? 0) * 3;
    const c = (indices[index + 2] ?? 0) * 3;
    const abX = (positions[b] ?? 0) - (positions[a] ?? 0);
    const abY = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
    const abZ = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const acX = (positions[c] ?? 0) - (positions[a] ?? 0);
    const acY = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
    const acZ = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    const normal = [
      abY * acZ - abZ * acY,
      abZ * acX - abX * acZ,
      abX * acY - abY * acX,
    ];
    for (const vertexOffset of [a, b, c]) {
      normals[vertexOffset] = (normals[vertexOffset] ?? 0) + (normal[0] ?? 0);
      normals[vertexOffset + 1] = (normals[vertexOffset + 1] ?? 0) + (normal[1] ?? 0);
      normals[vertexOffset + 2] = (normals[vertexOffset + 2] ?? 0) + (normal[2] ?? 0);
    }
  }

  const interleaved = new Float32Array(positions.length * 2);
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const sourceOffset = vertex * 3;
    const targetOffset = vertex * 6;
    const normalLength = Math.hypot(
      normals[sourceOffset] ?? 0,
      normals[sourceOffset + 1] ?? 0,
      normals[sourceOffset + 2] ?? 0,
    ) || 1;
    interleaved.set(positions.slice(sourceOffset, sourceOffset + 3), targetOffset);
    interleaved[targetOffset + 3] = (normals[sourceOffset] ?? 0) / normalLength;
    interleaved[targetOffset + 4] = (normals[sourceOffset + 1] ?? 0) / normalLength;
    interleaved[targetOffset + 5] = (normals[sourceOffset + 2] ?? 1) / normalLength;
  }
  return interleaved;
}
