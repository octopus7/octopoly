import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
  type Disposable,
  type Mat4,
  type SurfaceTriangleId,
  type TriangleMeshSnapshot,
  type Vec3,
} from "@octopoly/contracts";

export interface AxisAlignedBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface PreparedTriangle {
  readonly id: SurfaceTriangleId;
  readonly vertexIndices: readonly [number, number, number];
  readonly positions: readonly [Vec3, Vec3, Vec3];
  readonly normals?: readonly [Vec3, Vec3, Vec3];
  readonly bounds: AxisAlignedBounds;
  readonly centroid: Vec3;
  readonly degenerate: boolean;
}

export interface PreparedReferenceGeometry extends Disposable {
  /** Immutable world-space geometry shared by rendering and surface queries. */
  readonly geometry: TriangleMeshSnapshot;
  /** Bounds of the validated project/local-space input, or null when it is empty. */
  readonly localBounds: AxisAlignedBounds | null;
  /** Bounds of the baked world-space geometry, or null when it is empty. */
  readonly bounds: AxisAlignedBounds | null;
  readonly sceneScale: number;
  readonly triangleCount: number;
  /** Stable input-order triangle IDs with degenerate triangles excluded. */
  readonly validTriangleIds: ReadonlyArray<SurfaceTriangleId>;
  triangle(id: SurfaceTriangleId): PreparedTriangle;
  assertUsable(): void;
}

interface PreparedState {
  readonly geometry: TriangleMeshSnapshot;
  readonly localBounds: AxisAlignedBounds | null;
  readonly bounds: AxisAlignedBounds | null;
  readonly sceneScale: number;
  readonly triangleCount: number;
  readonly validTriangleIds: ReadonlyArray<SurfaceTriangleId>;
  readonly degenerateTriangles: Uint8Array;
}

interface NormalTransform {
  readonly c00: number;
  readonly c01: number;
  readonly c02: number;
  readonly c10: number;
  readonly c11: number;
  readonly c12: number;
  readonly c20: number;
  readonly c21: number;
  readonly c22: number;
  readonly inverseDeterminant: number;
}

export function prepareReferenceGeometry(
  source: TriangleMeshSnapshot,
  worldTransform: Mat4,
): PreparedReferenceGeometry {
  validateSnapshot(source);
  const normalTransform = validateTransform(worldTransform);

  const localPositions = source.positions.map(copyFiniteVec3);
  const localBounds = boundsOf(localPositions);
  const worldPositions = localPositions.map((position) =>
    freezeVec3(transformPosition(position, worldTransform.elements)),
  );
  const worldBounds = boundsOf(worldPositions);
  const sceneScale = sceneScaleOf(worldBounds);
  const worldNormals = source.normals?.map((normal) =>
    freezeVec3(transformNormal(normal, normalTransform)),
  );
  const indices = Object.freeze([...source.indices]);
  const triangleCount = indices.length / 3;
  const degenerateTriangles = new Uint8Array(triangleCount);
  const validTriangleIds: SurfaceTriangleId[] = [];
  const areaTolerance = Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance ** 2,
    NUMERIC_TOLERANCE_POLICY.areaScaleFactor * sceneScale ** 2,
  );

  for (let triangleId = 0; triangleId < triangleCount; triangleId += 1) {
    const offset = triangleId * 3;
    const a = worldPositions[indices[offset] as number] as Vec3;
    const b = worldPositions[indices[offset + 1] as number] as Vec3;
    const c = worldPositions[indices[offset + 2] as number] as Vec3;
    const twiceArea = crossLength(subtract(b, a), subtract(c, a));
    const degenerate = !Number.isFinite(twiceArea) || twiceArea <= areaTolerance;
    degenerateTriangles[triangleId] = degenerate ? 1 : 0;
    if (!degenerate) {
      validTriangleIds.push(triangleId);
    }
  }

  const geometry = Object.freeze({
    version: source.version,
    positions: Object.freeze(worldPositions),
    ...(worldNormals === undefined ? {} : { normals: Object.freeze(worldNormals) }),
    indices,
  }) satisfies TriangleMeshSnapshot;

  return new PreparedReferenceGeometryImpl({
    geometry,
    localBounds,
    bounds: worldBounds,
    sceneScale,
    triangleCount,
    validTriangleIds: Object.freeze(validTriangleIds),
    degenerateTriangles,
  });
}

class PreparedReferenceGeometryImpl implements PreparedReferenceGeometry {
  private state: PreparedState | null;

  public constructor(state: PreparedState) {
    this.state = state;
  }

  public get geometry(): TriangleMeshSnapshot {
    return this.usableState().geometry;
  }

  public get localBounds(): AxisAlignedBounds | null {
    return this.usableState().localBounds;
  }

  public get bounds(): AxisAlignedBounds | null {
    return this.usableState().bounds;
  }

  public get sceneScale(): number {
    return this.usableState().sceneScale;
  }

  public get triangleCount(): number {
    return this.usableState().triangleCount;
  }

  public get validTriangleIds(): ReadonlyArray<SurfaceTriangleId> {
    return this.usableState().validTriangleIds;
  }

  public triangle(id: SurfaceTriangleId): PreparedTriangle {
    assertNonNegativeSafeInteger(id, "triangle id");
    const state = this.usableState();
    if (id >= state.triangleCount) {
      throw new RangeError(`triangle id ${id} is out of range`);
    }

    const offset = id * 3;
    const aIndex = state.geometry.indices[offset] as number;
    const bIndex = state.geometry.indices[offset + 1] as number;
    const cIndex = state.geometry.indices[offset + 2] as number;
    const a = state.geometry.positions[aIndex] as Vec3;
    const b = state.geometry.positions[bIndex] as Vec3;
    const c = state.geometry.positions[cIndex] as Vec3;
    const positions = Object.freeze([a, b, c]) as readonly [Vec3, Vec3, Vec3];
    const sourceNormals = state.geometry.normals;
    const normals =
      sourceNormals === undefined
        ? undefined
        : (Object.freeze([
            sourceNormals[aIndex] as Vec3,
            sourceNormals[bIndex] as Vec3,
            sourceNormals[cIndex] as Vec3,
          ]) as readonly [Vec3, Vec3, Vec3]);

    return Object.freeze({
      id,
      vertexIndices: Object.freeze([aIndex, bIndex, cIndex]) as readonly [number, number, number],
      positions,
      ...(normals === undefined ? {} : { normals }),
      bounds: triangleBounds(a, b, c),
      centroid: freezeVec3({
        x: (a.x + b.x + c.x) / 3,
        y: (a.y + b.y + c.y) / 3,
        z: (a.z + b.z + c.z) / 3,
      }),
      degenerate: state.degenerateTriangles[id] === 1,
    });
  }

  public assertUsable(): void {
    void this.usableState();
  }

  public dispose(): void {
    this.state = null;
  }

  private usableState(): PreparedState {
    if (this.state === null) {
      throw new Error("prepared reference geometry is disposed");
    }
    return this.state;
  }
}

function validateSnapshot(source: TriangleMeshSnapshot): void {
  assertNonNegativeSafeInteger(source.version, "geometry version");
  if (source.indices.length % 3 !== 0) {
    throw new RangeError("geometry indices must contain a triangle list");
  }
  if (source.normals !== undefined && source.normals.length !== source.positions.length) {
    throw new RangeError("geometry normals must match the position count");
  }

  source.positions.forEach((position, index) => assertFiniteVec3(position, `position ${index}`));
  source.normals?.forEach((normal, index) => {
    assertFiniteVec3(normal, `normal ${index}`);
    if (length(normal) <= NUMERIC_TOLERANCE_POLICY.normalizedVector) {
      throw new RangeError(`normal ${index} must be normalizable`);
    }
  });
  source.indices.forEach((index, offset) => {
    assertNonNegativeSafeInteger(index, `geometry index ${offset}`);
    if (index >= source.positions.length) {
      throw new RangeError(`geometry index ${offset} is out of range`);
    }
  });
}

function validateTransform(transform: Mat4): NormalTransform {
  const elements = transform.elements;
  if (elements.length !== 16) {
    throw new RangeError("world transform must contain 16 elements");
  }
  elements.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new RangeError(`world transform element ${index} must be finite`);
    }
  });
  if (
    Math.abs(elements[3] as number) > NUMERIC_TOLERANCE_POLICY.absoluteDistance ||
    Math.abs(elements[7] as number) > NUMERIC_TOLERANCE_POLICY.absoluteDistance ||
    Math.abs(elements[11] as number) > NUMERIC_TOLERANCE_POLICY.absoluteDistance ||
    Math.abs((elements[15] as number) - 1) > NUMERIC_TOLERANCE_POLICY.absoluteDistance
  ) {
    throw new RangeError("world transform must be affine");
  }

  const a00 = elements[0] as number;
  const a01 = elements[4] as number;
  const a02 = elements[8] as number;
  const a10 = elements[1] as number;
  const a11 = elements[5] as number;
  const a12 = elements[9] as number;
  const a20 = elements[2] as number;
  const a21 = elements[6] as number;
  const a22 = elements[10] as number;

  const c00 = a11 * a22 - a12 * a21;
  const c01 = a12 * a20 - a10 * a22;
  const c02 = a10 * a21 - a11 * a20;
  const c10 = a02 * a21 - a01 * a22;
  const c11 = a00 * a22 - a02 * a20;
  const c12 = a01 * a20 - a00 * a21;
  const c20 = a01 * a12 - a02 * a11;
  const c21 = a02 * a10 - a00 * a12;
  const c22 = a00 * a11 - a01 * a10;
  const determinant = a00 * c00 + a01 * c01 + a02 * c02;
  const columnProduct =
    Math.hypot(a00, a10, a20) * Math.hypot(a01, a11, a21) * Math.hypot(a02, a12, a22);
  if (
    !Number.isFinite(determinant) ||
    !Number.isFinite(columnProduct) ||
    columnProduct === 0 ||
    Math.abs(determinant) <= NUMERIC_TOLERANCE_POLICY.normalizedVector * columnProduct
  ) {
    throw new RangeError("world transform must have a non-singular linear component");
  }

  return {
    c00,
    c01,
    c02,
    c10,
    c11,
    c12,
    c20,
    c21,
    c22,
    inverseDeterminant: 1 / determinant,
  };
}

function transformPosition(position: Vec3, matrix: ReadonlyArray<number>): Vec3 {
  const transformed = {
    x:
      (matrix[0] as number) * position.x +
      (matrix[4] as number) * position.y +
      (matrix[8] as number) * position.z +
      (matrix[12] as number),
    y:
      (matrix[1] as number) * position.x +
      (matrix[5] as number) * position.y +
      (matrix[9] as number) * position.z +
      (matrix[13] as number),
    z:
      (matrix[2] as number) * position.x +
      (matrix[6] as number) * position.y +
      (matrix[10] as number) * position.z +
      (matrix[14] as number),
  };
  assertFiniteVec3(transformed, "transformed position");
  return transformed;
}

function transformNormal(normal: Vec3, transform: NormalTransform): Vec3 {
  const transformed = {
    x:
      (transform.c00 * normal.x + transform.c01 * normal.y + transform.c02 * normal.z) *
      transform.inverseDeterminant,
    y:
      (transform.c10 * normal.x + transform.c11 * normal.y + transform.c12 * normal.z) *
      transform.inverseDeterminant,
    z:
      (transform.c20 * normal.x + transform.c21 * normal.y + transform.c22 * normal.z) *
      transform.inverseDeterminant,
  };
  assertFiniteVec3(transformed, "transformed normal");
  const magnitude = length(transformed);
  if (!Number.isFinite(magnitude) || magnitude <= NUMERIC_TOLERANCE_POLICY.normalizedVector) {
    throw new RangeError("transformed normal must be normalizable");
  }
  return {
    x: transformed.x / magnitude,
    y: transformed.y / magnitude,
    z: transformed.z / magnitude,
  };
}

function boundsOf(positions: ReadonlyArray<Vec3>): AxisAlignedBounds | null {
  const first = positions[0];
  if (first === undefined) {
    return null;
  }
  let minX = first.x;
  let minY = first.y;
  let minZ = first.z;
  let maxX = first.x;
  let maxY = first.y;
  let maxZ = first.z;
  for (let index = 1; index < positions.length; index += 1) {
    const position = positions[index] as Vec3;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  return freezeBounds(minX, minY, minZ, maxX, maxY, maxZ);
}

function triangleBounds(a: Vec3, b: Vec3, c: Vec3): AxisAlignedBounds {
  return freezeBounds(
    Math.min(a.x, b.x, c.x),
    Math.min(a.y, b.y, c.y),
    Math.min(a.z, b.z, c.z),
    Math.max(a.x, b.x, c.x),
    Math.max(a.y, b.y, c.y),
    Math.max(a.z, b.z, c.z),
  );
}

function freezeBounds(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): AxisAlignedBounds {
  return Object.freeze({
    min: freezeVec3({ x: minX, y: minY, z: minZ }),
    max: freezeVec3({ x: maxX, y: maxY, z: maxZ }),
  });
}

function sceneScaleOf(bounds: AxisAlignedBounds | null): number {
  if (bounds === null) {
    return 1;
  }
  return Math.max(
    1,
    Math.hypot(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ),
  );
}

function assertFiniteVec3(value: Vec3, label: string): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new RangeError(`${label} must contain finite components`);
  }
}

function copyFiniteVec3(value: Vec3): Vec3 {
  return freezeVec3({ x: value.x, y: value.y, z: value.z });
}

function freezeVec3(value: Vec3): Vec3 {
  return Object.freeze(value);
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function crossLength(a: Vec3, b: Vec3): number {
  return Math.hypot(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}
