import { describe, expect, it } from "vitest";

import type {
  CameraSnapshot,
  Mat4,
  MeshQuery,
  MeshSnapshot,
  SelectionSnapshot,
  Vec3,
} from "@octopoly/contracts";

import {
  calculateSelectedBounds,
  calculateSelectionFrame,
  cameraFacingGesturePlane,
  intersectRayPlane,
  selectedFacesAreaWeightedNormal,
  wellConditionedNormalDragPlane,
} from "../../../src/tools/basic/construction-plane";

const identity: Mat4 = {
  elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};

const camera: CameraSnapshot = {
  view: identity,
  projection: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0] },
  viewProjection: identity,
  position: { x: 0, y: 0, z: 5 },
};

const attributes: MeshSnapshot["attributes"] = {
  has: () => false,
  get: () => undefined,
};

function query(snapshot: MeshSnapshot): MeshQuery {
  return {
    snapshot: () => snapshot,
    vertex: (id) => snapshot.vertices.find((item) => item.id === id) ?? null,
    edge: (id) => snapshot.edges.find((item) => item.id === id) ?? null,
    corner: (id) => snapshot.corners.find((item) => item.id === id) ?? null,
    face: (id) => snapshot.faces.find((item) => item.id === id) ?? null,
    incidentEdges: () => [],
    incidentFaces: () => [],
    adjacentFaces: () => [],
    findEdge: () => null,
  };
}

const mesh = query({
  version: 1,
  vertices: [
    { id: 1, position: { x: -2, y: -1, z: 0 } },
    { id: 2, position: { x: 2, y: -1, z: 0 } },
    { id: 3, position: { x: 2, y: 1, z: 0 } },
    { id: 4, position: { x: -2, y: 1, z: 0 } },
  ],
  edges: [
    { id: 10, vertices: [1, 2] },
    { id: 11, vertices: [2, 3] },
    { id: 12, vertices: [3, 4] },
    { id: 13, vertices: [4, 1] },
  ],
  corners: [
    { id: 20, face: 30, vertex: 1, edge: 10 },
    { id: 21, face: 30, vertex: 2, edge: 11 },
    { id: 22, face: 30, vertex: 3, edge: 12 },
    { id: 23, face: 30, vertex: 4, edge: 13 },
  ],
  faces: [{ id: 30, corners: [20, 21, 22, 23] }],
  attributes,
});

function selection(overrides: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  return {
    version: 0,
    vertices: new Set(),
    edges: new Set(),
    faces: new Set(),
    ...overrides,
  };
}

function finite(vector: Vec3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

describe("construction plane math", () => {
  it("intersects a finite ray with a finite plane", () => {
    expect(
      intersectRayPlane(
        { origin: { x: 1, y: 2, z: 5 }, direction: { x: 0, y: 0, z: -1 } },
        { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      ),
    ).toEqual({ x: 1, y: 2, z: 0 });
  });

  it("rejects parallel, behind-ray, degenerate, and non-finite intersections", () => {
    const plane = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
    expect(intersectRayPlane({ origin: { x: 0, y: 0, z: 1 }, direction: { x: 1, y: 0, z: 0 } }, plane)).toBeNull();
    expect(intersectRayPlane({ origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: 1 } }, plane)).toBeNull();
    expect(intersectRayPlane({ origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } }, { ...plane, normal: { x: 0, y: 0, z: 0 } })).toBeNull();
    expect(intersectRayPlane({ origin: { x: Number.NaN, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } }, plane)).toBeNull();
  });

  it("creates a fixed camera-facing plane through the gesture anchor", () => {
    expect(cameraFacingGesturePlane({ x: 2, y: 3, z: 4 }, camera)).toEqual({
      point: { x: 2, y: 3, z: 4 },
      normal: { x: 0, y: 0, z: -1 },
    });
  });
});

describe("selection framing math", () => {
  it("deduplicates mixed selected vertices, edges, and faces into finite bounds", () => {
    const bounds = calculateSelectedBounds(
      mesh,
      selection({ vertices: new Set([1]), edges: new Set([10]), faces: new Set([30]) }),
    );
    expect(bounds).toEqual({
      minimum: { x: -2, y: -1, z: 0 },
      maximum: { x: 2, y: 1, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      radius: Math.sqrt(5),
      vertices: [1, 2, 3, 4],
    });
  });

  it("returns null for empty, missing, or non-finite selected elements", () => {
    expect(calculateSelectedBounds(mesh, selection())).toBeNull();
    expect(calculateSelectedBounds(mesh, selection({ vertices: new Set([999]) }))).toBeNull();
    const invalid = query({ ...mesh.snapshot(), vertices: [{ id: 1, position: { x: Infinity, y: 0, z: 0 } }] });
    expect(calculateSelectedBounds(invalid, selection({ vertices: new Set([1]) }))).toBeNull();
  });

  it("returns finite padded frame positions for flat geometry and extreme viewport aspects", () => {
    const bounds = calculateSelectedBounds(mesh, selection({ faces: new Set([30]) }));
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    for (const viewport of [
      { cssWidth: 100, cssHeight: 2000, devicePixelRatio: 1 },
      { cssWidth: 2000, cssHeight: 100, devicePixelRatio: 1 },
    ]) {
      const frame = calculateSelectionFrame(bounds, camera, viewport);
      expect(frame).not.toBeNull();
      expect(frame && finite(frame.position)).toBe(true);
      expect(frame && finite(frame.target)).toBe(true);
      expect(frame?.distance).toBeGreaterThan(bounds.radius);
      expect(frame?.paddingFraction).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("uses a finite minimum radius for a single vertex", () => {
    const bounds = calculateSelectedBounds(mesh, selection({ vertices: new Set([1]) }));
    expect(bounds?.radius).toBe(0);
    const frame = bounds && calculateSelectionFrame(bounds, camera, { cssWidth: 800, cssHeight: 600, devicePixelRatio: 1 });
    expect(frame?.distance).toBeGreaterThan(0);
    expect(frame && finite(frame.position)).toBe(true);
  });
});

describe("face-normal drag math", () => {
  it("computes the finite area-weighted normal from canonical MeshQuery records", () => {
    expect(selectedFacesAreaWeightedNormal(mesh, [30])).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("rejects degenerate faces and chooses a drag plane containing the face normal", () => {
    const degenerate = query({
      ...mesh.snapshot(),
      vertices: [
        { id: 1, position: { x: 0, y: 0, z: 0 } },
        { id: 2, position: { x: 1, y: 0, z: 0 } },
        { id: 3, position: { x: 2, y: 0, z: 0 } },
      ],
      faces: [{ id: 30, corners: [20, 21, 22] }],
      corners: mesh.snapshot().corners.slice(0, 3),
    });
    expect(selectedFacesAreaWeightedNormal(degenerate, [30])).toBeNull();

    const plane = wellConditionedNormalDragPlane(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { origin: { x: 0, y: 0, z: 5 }, direction: { x: 0.6, y: 0, z: -0.8 } },
    );
    expect(plane).not.toBeNull();
    expect(plane && plane.normal.x * 0 + plane.normal.y * 0 + plane.normal.z * 1).toBeCloseTo(0);
    expect(
      wellConditionedNormalDragPlane(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } },
      ),
    ).toBeNull();
    expect(
      wellConditionedNormalDragPlane(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { origin: { x: 0, y: 0, z: 5 }, direction: { x: 1e-8, y: 0, z: -1 } },
      ),
    ).toBeNull();
  });
});
