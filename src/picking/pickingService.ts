import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
  type CameraSnapshot,
  type EdgeRecord,
  type MeshSnapshot,
  type MeshTriangulationService,
  type PickHit,
  type PickingService,
  type Ray,
  type Vec2,
  type Vec3,
  type ViewportSnapshot,
} from "@octopoly/contracts";

import {
  addVec3,
  dotVec3,
  immutableVec3,
  invertMat4,
  normalizeVec3,
  projectWorldToScreen,
  scaleVec3,
  subtractVec3,
  transformPoint,
  unprojectScreenPoint,
} from "../transforms";
import { createMeshTriangulationService } from "./meshTriangulation";

function squaredScreenDistance(first: Vec2, second: Vec2): number {
  return (first.x - second.x) ** 2 + (first.y - second.y) ** 2;
}

function segmentParameter(point: Vec2, start: Vec2, end: Vec2): number {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const lengthSquared = x * x + y * y;
  if (lengthSquared <= NUMERIC_TOLERANCE_POLICY.absoluteDistance ** 2) {
    return 0;
  }
  return Math.max(0, Math.min(1, ((point.x - start.x) * x + (point.y - start.y) * y) / lengthSquared));
}

function depthAlongRay(ray: Ray, position: Vec3): number {
  return dotVec3(subtractVec3(position, ray.origin), ray.direction);
}

function distanceTolerance(first: number, second: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * Math.max(Math.abs(first), Math.abs(second)),
  );
}

function hitId(hit: PickHit): number {
  return hit.vertex ?? hit.edge ?? hit.face ?? Number.MAX_SAFE_INTEGER;
}

function hitKindOrder(hit: PickHit): number {
  return hit.kind === "vertex" ? 0 : hit.kind === "edge" ? 1 : 2;
}

function isPreferred(candidate: PickHit, current: PickHit | null): boolean {
  if (current === null) {
    return true;
  }
  const tolerance = distanceTolerance(candidate.distance, current.distance);
  if (candidate.distance < current.distance - tolerance) {
    return true;
  }
  if (Math.abs(candidate.distance - current.distance) > tolerance) {
    return false;
  }
  const kindDifference = hitKindOrder(candidate) - hitKindOrder(current);
  return kindDifference < 0 || (kindDifference === 0 && hitId(candidate) < hitId(current));
}

function immutableHit(hit: PickHit): PickHit {
  return Object.freeze({ ...hit, position: immutableVec3(hit.position.x, hit.position.y, hit.position.z) });
}

export class ScreenPickingService implements PickingService {
  constructor(private readonly triangulation: MeshTriangulationService = createMeshTriangulationService()) {}

  rayFromScreen(point: Vec2, camera: CameraSnapshot, viewport: ViewportSnapshot): Ray {
    const inverse = invertMat4(camera.viewProjection);
    const farPoint = unprojectScreenPoint(point, 1, inverse, viewport);
    const origin = immutableVec3(camera.position.x, camera.position.y, camera.position.z);
    return Object.freeze({ origin, direction: normalizeVec3(subtractVec3(farPoint, origin)) });
  }

  pick(
    point: Vec2,
    camera: CameraSnapshot,
    viewport: ViewportSnapshot,
    mesh: MeshSnapshot,
    radiusCssPx: number,
  ): PickHit | null {
    if (!Number.isFinite(radiusCssPx) || radiusCssPx < 0) {
      throw new RangeError("pick radius must be non-negative and finite");
    }
    const ray = this.rayFromScreen(point, camera, viewport);
    const radiusSquared = radiusCssPx ** 2;
    let selected: PickHit | null = null;

    for (const vertex of [...mesh.vertices].sort((first, second) => first.id - second.id)) {
      assertNonNegativeSafeInteger(vertex.id, "vertex id");
      const viewPosition = transformPoint(camera.view, vertex.position);
      if (viewPosition.z >= -NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
        continue;
      }
      const screen = projectWorldToScreen(vertex.position, camera.viewProjection, viewport);
      if (squaredScreenDistance(point, screen) > radiusSquared) {
        continue;
      }
      const distance = depthAlongRay(ray, vertex.position);
      if (distance < -NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
        continue;
      }
      const hit = immutableHit({
        kind: "vertex",
        distance: Math.max(0, distance),
        position: vertex.position,
        vertex: vertex.id,
      });
      if (isPreferred(hit, selected)) {
        selected = hit;
      }
    }

    const vertices = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex]));
    for (const edge of [...mesh.edges].sort((first, second) => first.id - second.id)) {
      assertNonNegativeSafeInteger(edge.id, "edge id");
      const candidate = this.edgeHit(point, ray, edge, vertices, camera, viewport, radiusSquared);
      if (candidate !== null && isPreferred(candidate, selected)) {
        selected = candidate;
      }
    }

    const faceHit = this.triangulation.raycast(ray, mesh);
    if (faceHit !== null) {
      const candidate = immutableHit({
        kind: "face",
        distance: faceHit.distance,
        position: faceHit.position,
        face: faceHit.face,
      });
      if (isPreferred(candidate, selected)) {
        selected = candidate;
      }
    }
    return selected;
  }

  private edgeHit(
    point: Vec2,
    ray: Ray,
    edge: EdgeRecord,
    vertices: ReadonlyMap<number, MeshSnapshot["vertices"][number]>,
    camera: CameraSnapshot,
    viewport: ViewportSnapshot,
    radiusSquared: number,
  ): PickHit | null {
    const first = vertices.get(edge.vertices[0]);
    const second = vertices.get(edge.vertices[1]);
    if (first === undefined || second === undefined) {
      throw new Error(`edge ${edge.id} references a missing vertex`);
    }
    const firstView = transformPoint(camera.view, first.position);
    const secondView = transformPoint(camera.view, second.position);
    if (
      firstView.z >= -NUMERIC_TOLERANCE_POLICY.absoluteDistance ||
      secondView.z >= -NUMERIC_TOLERANCE_POLICY.absoluteDistance
    ) {
      return null;
    }
    const firstScreen = projectWorldToScreen(first.position, camera.viewProjection, viewport);
    const secondScreen = projectWorldToScreen(second.position, camera.viewProjection, viewport);
    const parameter = segmentParameter(point, firstScreen, secondScreen);
    const closestScreen = Object.freeze({
      x: firstScreen.x + (secondScreen.x - firstScreen.x) * parameter,
      y: firstScreen.y + (secondScreen.y - firstScreen.y) * parameter,
    });
    if (squaredScreenDistance(point, closestScreen) > radiusSquared) {
      return null;
    }
    const position = addVec3(
      scaleVec3(first.position, 1 - parameter),
      scaleVec3(second.position, parameter),
    );
    const distance = depthAlongRay(ray, position);
    if (distance < -NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
      return null;
    }
    return immutableHit({
      kind: "edge",
      distance: Math.max(0, distance),
      position,
      edge: edge.id,
    });
  }
}

export function createPickingService(
  triangulation?: MeshTriangulationService,
): PickingService {
  return new ScreenPickingService(triangulation);
}
