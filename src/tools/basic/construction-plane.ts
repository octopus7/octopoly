import {
  NUMERIC_TOLERANCE_POLICY,
  type CameraSnapshot,
  type FaceId,
  type MeshQuery,
  type Ray,
  type SelectionSnapshot,
  type Vec3,
  type VertexId,
  type ViewportSnapshot,
} from "@octopoly/contracts";

export interface ConstructionPlane {
  readonly point: Vec3;
  readonly normal: Vec3;
}

export interface SelectedBounds {
  readonly minimum: Vec3;
  readonly maximum: Vec3;
  readonly center: Vec3;
  readonly radius: number;
  readonly vertices: ReadonlyArray<VertexId>;
}

export interface SelectionFrame {
  readonly target: Vec3;
  readonly position: Vec3;
  readonly distance: number;
  readonly paddingFraction: number;
}

const DEFAULT_FRAME_PADDING = 0.15;
const MINIMUM_FRAME_RADIUS = 1e-3;

function isFiniteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3): Vec3 | null {
  if (!isFiniteVec3(value)) return null;
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude <= NUMERIC_TOLERANCE_POLICY.normalizedVector) {
    return null;
  }
  return {
    x: value.x === 0 ? 0 : value.x / magnitude,
    y: value.y === 0 ? 0 : value.y / magnitude,
    z: value.z === 0 ? 0 : value.z / magnitude,
  };
}

export function intersectRayPlane(ray: Ray, plane: ConstructionPlane): Vec3 | null {
  if (!isFiniteVec3(ray.origin) || !isFiniteVec3(ray.direction) || !isFiniteVec3(plane.point)) {
    return null;
  }
  const rayLength = length(ray.direction);
  const normalLength = length(plane.normal);
  if (
    !Number.isFinite(rayLength) ||
    !Number.isFinite(normalLength) ||
    rayLength <= NUMERIC_TOLERANCE_POLICY.normalizedVector ||
    normalLength <= NUMERIC_TOLERANCE_POLICY.normalizedVector
  ) {
    return null;
  }
  const denominator = dot(ray.direction, plane.normal);
  if (
    !Number.isFinite(denominator) ||
    Math.abs(denominator) <=
      NUMERIC_TOLERANCE_POLICY.normalizedVector * rayLength * normalLength
  ) {
    return null;
  }
  const distance = dot(subtract(plane.point, ray.origin), plane.normal) / denominator;
  if (!Number.isFinite(distance) || distance < 0) return null;
  const intersection = {
    x: ray.origin.x + ray.direction.x * distance,
    y: ray.origin.y + ray.direction.y * distance,
    z: ray.origin.z + ray.direction.z * distance,
  };
  return isFiniteVec3(intersection) ? intersection : null;
}

function cameraForward(camera: CameraSnapshot): Vec3 | null {
  const elements = camera.view.elements;
  if (elements.length !== 16 || elements.some((value) => !Number.isFinite(value))) return null;
  return normalize({
    x: -(elements[2] as number),
    y: -(elements[6] as number),
    z: -(elements[10] as number),
  });
}

export function cameraFacingGesturePlane(
  anchor: Vec3,
  camera: CameraSnapshot,
): ConstructionPlane | null {
  if (!isFiniteVec3(anchor)) return null;
  const normal = cameraForward(camera);
  return normal === null ? null : { point: { ...anchor }, normal };
}

function collectSelectedVertexIds(
  mesh: MeshQuery,
  selection: SelectionSnapshot,
): ReadonlyArray<VertexId> {
  const ids = new Set<VertexId>();
  for (const id of selection.vertices) {
    if (mesh.vertex(id) !== null) ids.add(id);
  }
  for (const edgeId of selection.edges) {
    const edge = mesh.edge(edgeId);
    if (edge === null) continue;
    for (const id of edge.vertices) {
      if (mesh.vertex(id) !== null) ids.add(id);
    }
  }
  for (const faceId of selection.faces) {
    const face = mesh.face(faceId);
    if (face === null) continue;
    for (const cornerId of face.corners) {
      const corner = mesh.corner(cornerId);
      if (corner !== null && mesh.vertex(corner.vertex) !== null) ids.add(corner.vertex);
    }
  }
  return [...ids];
}

export function calculateSelectedBounds(
  mesh: MeshQuery,
  selection: SelectionSnapshot,
): SelectedBounds | null {
  const vertices = collectSelectedVertexIds(mesh, selection);
  if (vertices.length === 0) return null;

  let minimum = { x: Infinity, y: Infinity, z: Infinity };
  let maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  const positions: Vec3[] = [];
  for (const id of vertices) {
    const position = mesh.vertex(id)?.position;
    if (position === undefined || !isFiniteVec3(position)) return null;
    positions.push(position);
    minimum = {
      x: Math.min(minimum.x, position.x),
      y: Math.min(minimum.y, position.y),
      z: Math.min(minimum.z, position.z),
    };
    maximum = {
      x: Math.max(maximum.x, position.x),
      y: Math.max(maximum.y, position.y),
      z: Math.max(maximum.z, position.z),
    };
  }
  const center = {
    x: (minimum.x + maximum.x) / 2,
    y: (minimum.y + maximum.y) / 2,
    z: (minimum.z + maximum.z) / 2,
  };
  let radius = 0;
  for (const position of positions) radius = Math.max(radius, length(subtract(position, center)));
  if (!isFiniteVec3(center) || !Number.isFinite(radius)) return null;
  return { minimum, maximum, center, radius, vertices };
}

export function calculateSelectionFrame(
  bounds: SelectedBounds,
  camera: CameraSnapshot,
  viewport: ViewportSnapshot,
  paddingFraction = DEFAULT_FRAME_PADDING,
): SelectionFrame | null {
  if (
    !isFiniteVec3(bounds.center) ||
    !Number.isFinite(bounds.radius) ||
    bounds.radius < 0 ||
    !Number.isFinite(viewport.cssWidth) ||
    !Number.isFinite(viewport.cssHeight) ||
    viewport.cssWidth <= 0 ||
    viewport.cssHeight <= 0 ||
    !Number.isFinite(paddingFraction) ||
    paddingFraction < DEFAULT_FRAME_PADDING ||
    paddingFraction >= 0.5
  ) {
    return null;
  }
  const projection = camera.projection.elements;
  const focalY = projection[5];
  if (projection.length !== 16 || focalY === undefined || !Number.isFinite(focalY) || focalY === 0) {
    return null;
  }
  const forward = cameraForward(camera);
  if (forward === null) return null;

  const usable = 1 - 2 * paddingFraction;
  const tanHalfY = 1 / Math.abs(focalY);
  const tanHalfX = tanHalfY * (viewport.cssWidth / viewport.cssHeight);
  const limitingHalfAngle = Math.atan(Math.min(tanHalfX, tanHalfY) * usable);
  const sine = Math.sin(limitingHalfAngle);
  if (!Number.isFinite(sine) || sine <= NUMERIC_TOLERANCE_POLICY.angleRadians) return null;

  const radius = Math.max(bounds.radius, MINIMUM_FRAME_RADIUS);
  const distance = radius / sine;
  const position = {
    x: bounds.center.x - forward.x * distance,
    y: bounds.center.y - forward.y * distance,
    z: bounds.center.z - forward.z * distance,
  };
  if (!Number.isFinite(distance) || !isFiniteVec3(position)) return null;
  return {
    target: { ...bounds.center },
    position,
    distance,
    paddingFraction,
  };
}

function newellVector(points: ReadonlyArray<Vec3>): Vec3 | null {
  if (points.length < 3 || points.some((point) => !isFiniteVec3(point))) return null;
  const result = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index] as Vec3;
    const next = points[(index + 1) % points.length] as Vec3;
    result.x += (current.y - next.y) * (current.z + next.z);
    result.y += (current.z - next.z) * (current.x + next.x);
    result.z += (current.x - next.x) * (current.y + next.y);
  }
  return isFiniteVec3(result) ? result : null;
}

export function selectedFacesAreaWeightedNormal(
  mesh: MeshQuery,
  faces: ReadonlyArray<FaceId>,
): Vec3 | null {
  if (faces.length === 0) return null;
  const total = { x: 0, y: 0, z: 0 };
  let sceneScale = 0;
  for (const faceId of faces) {
    const face = mesh.face(faceId);
    if (face === null) return null;
    const positions: Vec3[] = [];
    for (const cornerId of face.corners) {
      const corner = mesh.corner(cornerId);
      const vertex = corner === null ? null : mesh.vertex(corner.vertex);
      if (vertex === null || !isFiniteVec3(vertex.position)) return null;
      positions.push(vertex.position);
      sceneScale = Math.max(sceneScale, Math.abs(vertex.position.x), Math.abs(vertex.position.y), Math.abs(vertex.position.z));
    }
    const vector = newellVector(positions);
    if (vector === null) return null;
    const faceScale = positions.reduce(
      (scale, position) =>
        Math.max(scale, Math.abs(position.x), Math.abs(position.y), Math.abs(position.z)),
      0,
    );
    if (
      length(vector) <=
      Math.max(1, faceScale * faceScale) * NUMERIC_TOLERANCE_POLICY.areaScaleFactor
    ) {
      return null;
    }
    total.x += vector.x;
    total.y += vector.y;
    total.z += vector.z;
  }
  const minimumArea = Math.max(1, sceneScale * sceneScale) * NUMERIC_TOLERANCE_POLICY.areaScaleFactor;
  if (!isFiniteVec3(total) || length(total) <= minimumArea) return null;
  return normalize(total);
}

export function wellConditionedNormalDragPlane(
  anchor: Vec3,
  faceNormal: Vec3,
  pointerRay: Ray,
): ConstructionPlane | null {
  if (!isFiniteVec3(anchor) || !isFiniteVec3(pointerRay.direction)) return null;
  const normal = normalize(faceNormal);
  const rayDirection = normalize(pointerRay.direction);
  if (normal === null || rayDirection === null) return null;
  const alongNormal = dot(rayDirection, normal);
  const projected = {
    x: rayDirection.x - normal.x * alongNormal,
    y: rayDirection.y - normal.y * alongNormal,
    z: rayDirection.z - normal.z * alongNormal,
  };
  if (length(projected) <= Math.sin(NUMERIC_TOLERANCE_POLICY.angleRadians)) return null;
  const planeNormal = normalize(projected);
  return planeNormal === null ? null : { point: { ...anchor }, normal: planeNormal };
}
