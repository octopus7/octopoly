import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeValue,
  CameraSnapshot,
  MeshSnapshot,
  Ray,
  ViewportSnapshot,
} from "@octopoly/contracts";
import { createPerspectiveCameraSnapshot } from "../../src/camera";
import { createMeshTriangulationService, createPickingService } from "../../src/picking";

const attributes = Object.freeze({
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
});

const mesh: MeshSnapshot = Object.freeze({
  version: 7,
  vertices: Object.freeze([
    Object.freeze({ id: 0, position: Object.freeze({ x: -1, y: -1, z: 0 }) }),
    Object.freeze({ id: 1, position: Object.freeze({ x: 1, y: -1, z: 0 }) }),
    Object.freeze({ id: 2, position: Object.freeze({ x: 0, y: 1, z: 0 }) }),
    Object.freeze({ id: 3, position: Object.freeze({ x: 3, y: 3, z: 0 }) }),
  ]),
  edges: Object.freeze([
    Object.freeze({ id: 10, vertices: Object.freeze([0, 1] as const) }),
    Object.freeze({ id: 11, vertices: Object.freeze([1, 2] as const) }),
    Object.freeze({ id: 12, vertices: Object.freeze([2, 0] as const) }),
  ]),
  corners: Object.freeze([
    Object.freeze({ id: 100, face: 20, vertex: 0, edge: 10 }),
    Object.freeze({ id: 101, face: 20, vertex: 1, edge: 11 }),
    Object.freeze({ id: 102, face: 20, vertex: 2, edge: 12 }),
    Object.freeze({ id: 200, face: 30, vertex: 3, edge: 10 }),
    Object.freeze({ id: 201, face: 30, vertex: 3, edge: 10 }),
    Object.freeze({ id: 202, face: 30, vertex: 3, edge: 10 }),
  ]),
  faces: Object.freeze([
    Object.freeze({ id: 30, corners: Object.freeze([200, 201, 202]) }),
    Object.freeze({ id: 20, corners: Object.freeze([100, 101, 102]) }),
  ]),
  attributes,
});

const viewport: ViewportSnapshot = Object.freeze({ cssWidth: 200, cssHeight: 200, devicePixelRatio: 1 });
const camera: CameraSnapshot = createPerspectiveCameraSnapshot(
  { x: 0, y: 0, z: 5 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  Math.PI / 2,
  0.1,
  100,
  viewport,
);

describe("deterministic mesh triangulation", () => {
  it("preserves canonical face/corner mapping and excludes degenerate triangles", () => {
    const triangles = createMeshTriangulationService().triangles(mesh);

    expect(triangles).toHaveLength(1);
    expect(triangles[0]).toMatchObject({
      face: 20,
      corners: [100, 101, 102],
      vertices: [0, 1, 2],
    });
    expect(Object.isFrozen(triangles)).toBe(true);
    expect(Object.isFrozen(triangles[0]?.positions)).toBe(true);
  });

  it("returns barycentrics in corner order and the exact mesh version", () => {
    const ray: Ray = Object.freeze({
      origin: Object.freeze({ x: 0, y: 0, z: 5 }),
      direction: Object.freeze({ x: 0, y: 0, z: -1 }),
    });
    const service = createMeshTriangulationService();
    const hit = service.raycast(ray, mesh);

    expect(hit?.meshVersion).toBe(7);
    expect(hit?.face).toBe(20);
    expect(hit?.distance).toBeCloseTo(5, 12);
    expect(hit?.barycentric.x).toBeCloseTo(0.25, 12);
    expect(hit?.barycentric.y).toBeCloseTo(0.25, 12);
    expect(hit?.barycentric.z).toBeCloseTo(0.5, 12);
    expect(hit?.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(service.raycast(ray, mesh, 4)).toBeNull();
  });

  it("treats invalid ray direction as a programmer error", () => {
    expect(() => createMeshTriangulationService().raycast({
      origin: { x: 0, y: 0, z: 5 },
      direction: { x: 0, y: 0, z: -2 },
    }, mesh)).toThrow(RangeError);
  });
});

describe("screen picking", () => {
  it("selects known vertex, edge, and face fixtures with stable priority", () => {
    const picking = createPickingService();

    expect(picking.pick({ x: 80, y: 120 }, camera, viewport, mesh, 1)).toMatchObject({ kind: "vertex", vertex: 0 });
    expect(picking.pick({ x: 100, y: 120 }, camera, viewport, mesh, 1)).toMatchObject({ kind: "edge", edge: 10 });
    expect(picking.pick({ x: 100, y: 96 }, camera, viewport, mesh, 1)).toMatchObject({ kind: "face", face: 20 });
    expect(picking.pick({ x: 190, y: 190 }, camera, viewport, mesh, 1)).toBeNull();
  });

  it("uses CSS pixels and is independent of devicePixelRatio", () => {
    const picking = createPickingService();
    const highDensity = Object.freeze({ ...viewport, devicePixelRatio: 4 });

    expect(picking.pick({ x: 80, y: 120 }, camera, highDensity, mesh, 1)).toEqual(
      picking.pick({ x: 80, y: 120 }, camera, viewport, mesh, 1),
    );
    expect(picking.pick({ x: 77.9, y: 120 }, camera, viewport, mesh, 2)).not.toMatchObject({ kind: "vertex" });
    expect(picking.pick({ x: 78.1, y: 120 }, camera, viewport, mesh, 2)).toMatchObject({ kind: "vertex", vertex: 0 });
  });
});
