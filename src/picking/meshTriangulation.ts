import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
  type CornerRecord,
  type FaceRecord,
  type MeshSnapshot,
  type MeshTriangle,
  type MeshTriangleHit,
  type MeshTriangulationService,
  type Ray,
  type Vec3,
  type VertexRecord,
} from "@octopoly/contracts";

import {
  crossVec3,
  dotVec3,
  immutableVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subtractVec3,
  addVec3,
} from "../transforms";

function finiteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function sceneScale(vertices: ReadonlyArray<VertexRecord>): number {
  if (vertices.length === 0) {
    return 1;
  }
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const vertex of vertices) {
    if (!finiteVec3(vertex.position)) {
      throw new RangeError(`vertex ${vertex.id} has a non-finite position`);
    }
    minimumX = Math.min(minimumX, vertex.position.x);
    minimumY = Math.min(minimumY, vertex.position.y);
    minimumZ = Math.min(minimumZ, vertex.position.z);
    maximumX = Math.max(maximumX, vertex.position.x);
    maximumY = Math.max(maximumY, vertex.position.y);
    maximumZ = Math.max(maximumZ, vertex.position.z);
  }
  return Math.max(
    1,
    Math.hypot(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ),
  );
}

function areaTolerance(scale: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance ** 2,
    NUMERIC_TOLERANCE_POLICY.areaScaleFactor * scale ** 2,
  );
}

function triangleFromCorners(
  face: FaceRecord,
  corners: readonly [CornerRecord, CornerRecord, CornerRecord],
  vertices: ReadonlyMap<number, VertexRecord>,
): MeshTriangle {
  const first = vertices.get(corners[0].vertex);
  const second = vertices.get(corners[1].vertex);
  const third = vertices.get(corners[2].vertex);
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error(`face ${face.id} references a missing vertex`);
  }
  return Object.freeze({
    face: face.id,
    corners: Object.freeze([corners[0].id, corners[1].id, corners[2].id] as const),
    vertices: Object.freeze([first.id, second.id, third.id] as const),
    positions: Object.freeze([
      immutableVec3(first.position.x, first.position.y, first.position.z),
      immutableVec3(second.position.x, second.position.y, second.position.z),
      immutableVec3(third.position.x, third.position.y, third.position.z),
    ] as const),
  });
}

function validateRay(ray: Ray): void {
  if (!finiteVec3(ray.origin) || !finiteVec3(ray.direction)) {
    throw new RangeError("ray origin and direction must be finite");
  }
  const directionLength = lengthVec3(ray.direction);
  if (Math.abs(directionLength - 1) > NUMERIC_TOLERANCE_POLICY.normalizedVector) {
    throw new RangeError("ray direction must be normalized");
  }
}

function distanceTolerance(first: number, second: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * Math.max(Math.abs(first), Math.abs(second)),
  );
}

export class DeterministicMeshTriangulationService implements MeshTriangulationService {
  triangles(mesh: MeshSnapshot): ReadonlyArray<MeshTriangle> {
    assertNonNegativeSafeInteger(mesh.version, "mesh version");
    const vertices = new Map<number, VertexRecord>();
    for (const vertex of mesh.vertices) {
      assertNonNegativeSafeInteger(vertex.id, "vertex id");
      if (vertices.has(vertex.id)) {
        throw new Error(`duplicate vertex id ${vertex.id}`);
      }
      vertices.set(vertex.id, vertex);
    }
    const corners = new Map<number, CornerRecord>();
    for (const corner of mesh.corners) {
      assertNonNegativeSafeInteger(corner.id, "corner id");
      assertNonNegativeSafeInteger(corner.face, "corner face id");
      assertNonNegativeSafeInteger(corner.vertex, "corner vertex id");
      assertNonNegativeSafeInteger(corner.edge, "corner edge id");
      if (corners.has(corner.id)) {
        throw new Error(`duplicate corner id ${corner.id}`);
      }
      corners.set(corner.id, corner);
    }

    const threshold = areaTolerance(sceneScale(mesh.vertices));
    const result: MeshTriangle[] = [];
    const faces = [...mesh.faces].sort((first, second) => first.id - second.id);
    const faceIds = new Set<number>();
    for (const face of faces) {
      assertNonNegativeSafeInteger(face.id, "face id");
      if (faceIds.has(face.id)) {
        throw new Error(`duplicate face id ${face.id}`);
      }
      faceIds.add(face.id);
      if (face.corners.length < 3) {
        continue;
      }
      const faceCorners = face.corners.map((cornerId) => {
        const corner = corners.get(cornerId);
        if (corner === undefined || corner.face !== face.id) {
          throw new Error(`face ${face.id} references an invalid corner ${cornerId}`);
        }
        return corner;
      });
      const first = faceCorners[0];
      if (first === undefined) {
        continue;
      }
      for (let index = 1; index + 1 < faceCorners.length; index += 1) {
        const second = faceCorners[index];
        const third = faceCorners[index + 1];
        if (second === undefined || third === undefined) {
          continue;
        }
        const triangle = triangleFromCorners(face, [first, second, third], vertices);
        const edgeOne = subtractVec3(triangle.positions[1], triangle.positions[0]);
        const edgeTwo = subtractVec3(triangle.positions[2], triangle.positions[0]);
        if (lengthVec3(crossVec3(edgeOne, edgeTwo)) / 2 <= threshold) {
          continue;
        }
        result.push(triangle);
      }
    }
    return Object.freeze(result);
  }

  raycast(ray: Ray, mesh: MeshSnapshot, maxDistance = Number.POSITIVE_INFINITY): MeshTriangleHit | null {
    validateRay(ray);
    if (Number.isNaN(maxDistance) || maxDistance < 0) {
      throw new RangeError("max distance must be non-negative");
    }
    let closest: MeshTriangleHit | null = null;
    for (const triangle of this.triangles(mesh)) {
      const edgeOne = subtractVec3(triangle.positions[1], triangle.positions[0]);
      const edgeTwo = subtractVec3(triangle.positions[2], triangle.positions[0]);
      const areaMagnitude = lengthVec3(crossVec3(edgeOne, edgeTwo));
      const perpendicular = crossVec3(ray.direction, edgeTwo);
      const determinant = dotVec3(edgeOne, perpendicular);
      if (Math.abs(determinant) <= NUMERIC_TOLERANCE_POLICY.angleRadians * areaMagnitude) {
        continue;
      }
      const inverseDeterminant = 1 / determinant;
      const originOffset = subtractVec3(ray.origin, triangle.positions[0]);
      const secondWeight = dotVec3(originOffset, perpendicular) * inverseDeterminant;
      const barycentricTolerance = NUMERIC_TOLERANCE_POLICY.barycentric;
      if (secondWeight < -barycentricTolerance || secondWeight > 1 + barycentricTolerance) {
        continue;
      }
      const crossOffset = crossVec3(originOffset, edgeOne);
      const thirdWeight = dotVec3(ray.direction, crossOffset) * inverseDeterminant;
      if (
        thirdWeight < -barycentricTolerance ||
        secondWeight + thirdWeight > 1 + barycentricTolerance
      ) {
        continue;
      }
      const distance = dotVec3(edgeTwo, crossOffset) * inverseDeterminant;
      if (
        distance < -NUMERIC_TOLERANCE_POLICY.absoluteDistance ||
        distance > maxDistance + NUMERIC_TOLERANCE_POLICY.absoluteDistance
      ) {
        continue;
      }
      const firstWeight = 1 - secondWeight - thirdWeight;
      const position = addVec3(
        addVec3(
          scaleVec3(triangle.positions[0], firstWeight),
          scaleVec3(triangle.positions[1], secondWeight),
        ),
        scaleVec3(triangle.positions[2], thirdWeight),
      );
      const hit: MeshTriangleHit = Object.freeze({
        ...triangle,
        meshVersion: mesh.version,
        position,
        normal: normalizeVec3(crossVec3(edgeOne, edgeTwo)),
        barycentric: immutableVec3(firstWeight, secondWeight, thirdWeight),
        distance: Math.max(0, distance),
      });
      if (
        closest === null ||
        hit.distance < closest.distance - distanceTolerance(hit.distance, closest.distance)
      ) {
        closest = hit;
      }
    }
    return closest;
  }
}

export function createMeshTriangulationService(): MeshTriangulationService {
  return new DeterministicMeshTriangulationService();
}
