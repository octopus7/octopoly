import type {
  CornerId,
  FaceId,
  MeshSnapshot,
  Vec2,
  Vec3,
} from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

export interface UvProjectionService {
  planar(
    mesh: MeshSnapshot,
    normal: Vec3,
    faces?: ReadonlyArray<FaceId>,
  ): ReadonlyMap<CornerId, Vec2 | undefined>;
  box(
    mesh: MeshSnapshot,
    faces?: ReadonlyArray<FaceId>,
  ): ReadonlyMap<CornerId, Vec2 | undefined>;
}

interface PreparedCorner {
  readonly id: CornerId;
  readonly position: Vec3;
}

interface PreparedFace {
  readonly corners: ReadonlyArray<PreparedCorner>;
  readonly normal: Vec3;
}

class ImmutableReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #values: ReadonlyMap<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#values = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get(key: K): V | undefined {
    return this.#values.get(key);
  }

  has(key: K): boolean {
    return this.#values.has(key);
  }

  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#values.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  entries() {
    return this.#values.entries();
  }

  keys() {
    return this.#values.keys();
  }

  values() {
    return this.#values.values();
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

function emptyProjection(): ReadonlyMap<CornerId, Vec2 | undefined> {
  return new ImmutableReadonlyMap<CornerId, Vec2 | undefined>([]);
}

function isElementId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isFiniteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function normalize(value: Vec3): Vec3 | null {
  if (!isFiniteVec3(value)) {
    return null;
  }

  const maximum = Math.max(Math.abs(value.x), Math.abs(value.y), Math.abs(value.z));
  if (maximum <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
    return null;
  }

  const scaledX = value.x / maximum;
  const scaledY = value.y / maximum;
  const scaledZ = value.z / maximum;
  const scaledLength = Math.hypot(scaledX, scaledY, scaledZ);
  if (!Number.isFinite(scaledLength) || scaledLength === 0) {
    return null;
  }

  return Object.freeze({
    x: scaledX / scaledLength,
    y: scaledY / scaledLength,
    z: scaledZ / scaledLength,
  });
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function faceNormal(corners: ReadonlyArray<PreparedCorner>): Vec3 | null {
  let x = 0;
  let y = 0;
  let z = 0;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index]!.position;
    const next = corners[(index + 1) % corners.length]!.position;
    x += (current.y - next.y) * (current.z + next.z);
    y += (current.z - next.z) * (current.x + next.x);
    z += (current.x - next.x) * (current.y + next.y);
    minimumX = Math.min(minimumX, current.x);
    minimumY = Math.min(minimumY, current.y);
    minimumZ = Math.min(minimumZ, current.z);
    maximumX = Math.max(maximumX, current.x);
    maximumY = Math.max(maximumY, current.y);
    maximumZ = Math.max(maximumZ, current.z);
  }

  const length = Math.hypot(x, y, z);
  const extent = Math.max(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ);
  const minimumArea = Math.max(1, extent * extent) * NUMERIC_TOLERANCE_POLICY.areaScaleFactor;
  if (!Number.isFinite(length) || length <= minimumArea) {
    return null;
  }

  return Object.freeze({ x: x / length, y: y / length, z: z / length });
}

function prepareFaces(
  mesh: MeshSnapshot,
  selectedFaces: ReadonlyArray<FaceId> | undefined,
): ReadonlyArray<PreparedFace> | null {
  const vertices = new Map<number, Vec3>();
  for (const vertex of mesh.vertices) {
    if (!isElementId(vertex.id) || vertices.has(vertex.id) || !isFiniteVec3(vertex.position)) {
      return null;
    }
    vertices.set(vertex.id, vertex.position);
  }

  const edges = new Map<number, readonly [number, number]>();
  for (const edge of mesh.edges) {
    if (
      !isElementId(edge.id)
      || edges.has(edge.id)
      || !isElementId(edge.vertices[0])
      || !isElementId(edge.vertices[1])
      || edge.vertices[0] === edge.vertices[1]
      || !vertices.has(edge.vertices[0])
      || !vertices.has(edge.vertices[1])
    ) {
      return null;
    }
    edges.set(edge.id, edge.vertices);
  }

  const corners = new Map<number, (typeof mesh.corners)[number]>();
  for (const corner of mesh.corners) {
    const edge = edges.get(corner.edge);
    if (
      !isElementId(corner.id)
      || corners.has(corner.id)
      || !isElementId(corner.face)
      || !isElementId(corner.vertex)
      || !isElementId(corner.edge)
      || !vertices.has(corner.vertex)
      || edge === undefined
      || (edge[0] !== corner.vertex && edge[1] !== corner.vertex)
    ) {
      return null;
    }
    corners.set(corner.id, corner);
  }

  const faces = new Map<number, (typeof mesh.faces)[number]>();
  const referencedCorners = new Set<CornerId>();
  for (const face of mesh.faces) {
    if (!isElementId(face.id) || faces.has(face.id) || face.corners.length < 3) {
      return null;
    }

    const localCorners = new Set<CornerId>();
    for (let index = 0; index < face.corners.length; index += 1) {
      const cornerId = face.corners[index]!;
      const nextCornerId = face.corners[(index + 1) % face.corners.length]!;
      const corner = corners.get(cornerId);
      const nextCorner = corners.get(nextCornerId);
      if (
        localCorners.has(cornerId)
        || referencedCorners.has(cornerId)
        || corner?.face !== face.id
        || nextCorner?.face !== face.id
      ) {
        return null;
      }

      const edge = edges.get(corner.edge);
      if (
        edge === undefined
        || !(
          (edge[0] === corner.vertex && edge[1] === nextCorner.vertex)
          || (edge[1] === corner.vertex && edge[0] === nextCorner.vertex)
        )
      ) {
        return null;
      }

      localCorners.add(cornerId);
      referencedCorners.add(cornerId);
    }
    faces.set(face.id, face);
  }

  if (referencedCorners.size !== corners.size) {
    return null;
  }

  const ids = selectedFaces === undefined
    ? [...faces.keys()]
    : [...new Set(selectedFaces)];
  ids.sort((left, right) => left - right);

  const prepared: PreparedFace[] = [];
  for (const faceId of ids) {
    const face = faces.get(faceId);
    if (!isElementId(faceId) || face === undefined) {
      return null;
    }

    const preparedCorners = face.corners.map((cornerId): PreparedCorner => {
      const corner = corners.get(cornerId)!;
      return Object.freeze({ id: corner.id, position: vertices.get(corner.vertex)! });
    });
    const normal = faceNormal(preparedCorners);
    if (normal === null) {
      return null;
    }
    prepared.push(Object.freeze({ corners: Object.freeze(preparedCorners), normal }));
  }

  return Object.freeze(prepared);
}

function planarBasis(normal: Vec3): readonly [Vec3, Vec3] {
  const absoluteX = Math.abs(normal.x);
  const absoluteY = Math.abs(normal.y);
  const absoluteZ = Math.abs(normal.z);
  let reference: Vec3 = { x: 1, y: 0, z: 0 };
  let alignment = absoluteX;
  if (absoluteY < alignment) {
    reference = { x: 0, y: 1, z: 0 };
    alignment = absoluteY;
  }
  if (absoluteZ < alignment) {
    reference = { x: 0, y: 0, z: 1 };
  }

  const projection = dot(reference, normal);
  const tangent = normalize({
    x: reference.x - projection * normal.x,
    y: reference.y - projection * normal.y,
    z: reference.z - projection * normal.z,
  });
  if (tangent === null) {
    throw new RangeError("projection normal cannot produce a stable planar basis");
  }
  const bitangent = normalize(cross(normal, tangent));
  if (bitangent === null) {
    throw new RangeError("projection normal cannot produce a stable planar basis");
  }
  return Object.freeze([tangent, bitangent] as const);
}

function createProjection(
  entries: ReadonlyArray<readonly [CornerId, Vec2 | undefined]>,
): ReadonlyMap<CornerId, Vec2 | undefined> {
  return new ImmutableReadonlyMap(
    [...entries].sort((left, right) => left[0] - right[0]),
  );
}

class DefaultUvProjectionService implements UvProjectionService {
  planar(
    mesh: MeshSnapshot,
    requestedNormal: Vec3,
    selectedFaces?: ReadonlyArray<FaceId>,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    const normal = normalize(requestedNormal);
    if (normal === null) {
      throw new RangeError("projection normal must be finite and non-zero");
    }

    const preparedFaces = prepareFaces(mesh, selectedFaces);
    if (preparedFaces === null || preparedFaces.length === 0) {
      return emptyProjection();
    }

    const [tangent, bitangent] = planarBasis(normal);
    const entries: Array<readonly [CornerId, Vec2 | undefined]> = [];
    for (const face of preparedFaces) {
      for (const corner of face.corners) {
        const value = Object.freeze({
          x: dot(corner.position, tangent),
          y: dot(corner.position, bitangent),
        });
        if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
          return emptyProjection();
        }
        entries.push(Object.freeze([corner.id, value] as const));
      }
    }
    return createProjection(entries);
  }

  box(
    mesh: MeshSnapshot,
    selectedFaces?: ReadonlyArray<FaceId>,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    const preparedFaces = prepareFaces(mesh, selectedFaces);
    if (preparedFaces === null || preparedFaces.length === 0) {
      return emptyProjection();
    }

    const entries: Array<readonly [CornerId, Vec2 | undefined]> = [];
    for (const face of preparedFaces) {
      const absoluteX = Math.abs(face.normal.x);
      const absoluteY = Math.abs(face.normal.y);
      const absoluteZ = Math.abs(face.normal.z);
      for (const corner of face.corners) {
        const position = corner.position;
        let value: Vec2;
        if (absoluteX >= absoluteY && absoluteX >= absoluteZ) {
          value = { x: -Math.sign(face.normal.x) * position.z, y: position.y };
        } else if (absoluteY >= absoluteZ) {
          value = { x: position.x, y: -Math.sign(face.normal.y) * position.z };
        } else {
          value = { x: Math.sign(face.normal.z) * position.x, y: position.y };
        }
        if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
          return emptyProjection();
        }
        entries.push(Object.freeze([corner.id, Object.freeze(value)] as const));
      }
    }
    return createProjection(entries);
  }
}

export function createUvProjectionService(): UvProjectionService {
  return Object.freeze(new DefaultUvProjectionService());
}
