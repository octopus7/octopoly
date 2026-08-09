import type {
  SerializedMesh,
  TriangleMeshSnapshot,
  Vec3,
} from "@octopoly/contracts";

export function isTriangleMeshSnapshot(
  source: TriangleMeshSnapshot | SerializedMesh,
): source is TriangleMeshSnapshot {
  return "positions" in source && "indices" in source;
}

function finiteVec3(value: Vec3, label: string): Vec3 {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new TypeError(`${label} must contain finite coordinates`);
  }
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

export function toTriangleMesh(
  source: TriangleMeshSnapshot | SerializedMesh,
): TriangleMeshSnapshot {
  if (isTriangleMeshSnapshot(source)) {
    const positions = source.positions.map((position, index) => finiteVec3(position, `position ${index}`));
    const indices = [...source.indices];
    if (indices.length === 0 || indices.length % 3 !== 0) {
      throw new TypeError("indices must be a non-empty triangle list");
    }
    for (const index of indices) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= positions.length) {
        throw new RangeError("triangle index is out of range");
      }
    }
    if (source.normals === undefined) {
      return Object.freeze({ version: source.version, positions: Object.freeze(positions), indices: Object.freeze(indices) });
    }
    if (source.normals.length !== positions.length) throw new TypeError("normal count must match position count");
    const normals = source.normals.map((normal, index) => finiteVec3(normal, `normal ${index}`));
    return Object.freeze({
      version: source.version,
      positions: Object.freeze(positions),
      normals: Object.freeze(normals),
      indices: Object.freeze(indices),
    });
  }

  if (!Number.isSafeInteger(source.version) || source.version < 0) throw new TypeError("mesh version is invalid");
  const vertexById = new Map<number, number>();
  const positions = source.vertices.map((vertex, index) => {
    if (!Number.isSafeInteger(vertex.id) || vertex.id < 0 || vertexById.has(vertex.id)) {
      throw new TypeError(`vertex ${index} has an invalid or duplicate id`);
    }
    vertexById.set(vertex.id, index);
    return finiteVec3(vertex.position, `vertex ${vertex.id}`);
  });
  const edgeIds = new Set<number>();
  for (const edge of source.edges) {
    if (!Number.isSafeInteger(edge.id) || edge.id < 0 || edgeIds.has(edge.id)) throw new TypeError("edge ids must be valid and unique");
    if (!vertexById.has(edge.vertices[0]) || !vertexById.has(edge.vertices[1])) throw new TypeError(`edge ${edge.id} references a missing vertex`);
    edgeIds.add(edge.id);
  }
  const faceIds = new Set<number>();
  for (const face of source.faces) {
    if (!Number.isSafeInteger(face.id) || face.id < 0 || faceIds.has(face.id)) throw new TypeError("face ids must be valid and unique");
    faceIds.add(face.id);
  }
  const cornerById = new Map<number, (typeof source.corners)[number]>();
  for (const corner of source.corners) {
    if (!Number.isSafeInteger(corner.id) || corner.id < 0 || cornerById.has(corner.id)) throw new TypeError("corner ids must be valid and unique");
    if (!faceIds.has(corner.face) || !vertexById.has(corner.vertex) || !edgeIds.has(corner.edge)) {
      throw new TypeError(`corner ${corner.id} has a missing reference`);
    }
    cornerById.set(corner.id, corner);
  }
  const indices: number[] = [];
  for (const face of source.faces) {
    if (face.corners.length < 3) throw new TypeError(`face ${face.id} has fewer than three corners`);
    const polygon = face.corners.map((cornerId) => {
      const corner = cornerById.get(cornerId);
      if (!corner || corner.face !== face.id) throw new TypeError(`face ${face.id} has an invalid corner`);
      const vertex = vertexById.get(corner.vertex);
      if (vertex === undefined) throw new TypeError(`corner ${corner.id} references a missing vertex`);
      return vertex;
    });
    for (let index = 1; index + 1 < polygon.length; index += 1) {
      indices.push(polygon[0]!, polygon[index]!, polygon[index + 1]!);
    }
  }
  if (indices.length === 0) throw new TypeError("mesh must contain at least one face");
  return Object.freeze({ version: source.version, positions: Object.freeze(positions), indices: Object.freeze(indices) });
}
