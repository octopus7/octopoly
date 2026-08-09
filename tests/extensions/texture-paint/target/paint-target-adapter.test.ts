import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeValue,
  ImageAssetRef,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangleHit,
  MeshTriangulationService,
  Vec2,
} from "@octopoly/contracts";
import {
  PaintEligibilityService,
  PaintTargetAdapter,
  UV0_ATTRIBUTE_KEY,
} from "../../../../src/extensions/texture-paint/target";

const TRIANGLES: ReadonlyArray<MeshTriangle> = Object.freeze([
  Object.freeze({
    face: 10,
    corners: Object.freeze([100, 101, 102] as const),
    vertices: Object.freeze([0, 1, 2] as const),
    positions: Object.freeze([
      Object.freeze({ x: 0, y: 0, z: 0 }),
      Object.freeze({ x: 1, y: 0, z: 0 }),
      Object.freeze({ x: 0, y: 1, z: 0 }),
    ] as const),
  }),
  Object.freeze({
    face: 11,
    corners: Object.freeze([103, 104, 105] as const),
    vertices: Object.freeze([1, 3, 2] as const),
    positions: Object.freeze([
      Object.freeze({ x: 1, y: 0, z: 0 }),
      Object.freeze({ x: 1, y: 1, z: 0 }),
      Object.freeze({ x: 0, y: 1, z: 0 }),
    ] as const),
  }),
]);

const COMPLETE_UVS = new Map<number, Vec2>([
  [100, { x: 0, y: 0 }],
  [101, { x: 0.5, y: 0 }],
  [102, { x: 0, y: 1 }],
  [103, { x: 0.75, y: 0 }],
  [104, { x: 1, y: 0 }],
  [105, { x: 1, y: 1 }],
]);

const IMAGE: ImageAssetRef = Object.freeze({
  id: "paint-image",
  revision: 2,
  width: 256,
  height: 128,
  colorSpace: "srgb",
});

function createAttributes(
  uvs: ReadonlyMap<number, AttributeValue>,
  declaresUv0 = true,
): MeshSnapshot["attributes"] {
  return Object.freeze({
    has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
      return declaresUv0 && key.domain === "corner" && key.name === "uv0";
    },
    get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
      if (key.domain !== "corner" || key.name !== "uv0") {
        return undefined;
      }
      return uvs.get(elementId) as T | undefined;
    },
  });
}

function createMesh(
  uvs: ReadonlyMap<number, AttributeValue> = COMPLETE_UVS,
  declaresUv0 = true,
): MeshSnapshot {
  return Object.freeze({
    version: 7,
    vertices: Object.freeze([
      Object.freeze({ id: 0, position: Object.freeze({ x: 0, y: 0, z: 0 }) }),
      Object.freeze({ id: 1, position: Object.freeze({ x: 1, y: 0, z: 0 }) }),
      Object.freeze({ id: 2, position: Object.freeze({ x: 0, y: 1, z: 0 }) }),
      Object.freeze({ id: 3, position: Object.freeze({ x: 1, y: 1, z: 0 }) }),
    ]),
    edges: Object.freeze([
      Object.freeze({ id: 20, vertices: Object.freeze([0, 1] as const) }),
      Object.freeze({ id: 21, vertices: Object.freeze([1, 2] as const) }),
      Object.freeze({ id: 22, vertices: Object.freeze([2, 0] as const) }),
      Object.freeze({ id: 23, vertices: Object.freeze([1, 3] as const) }),
      Object.freeze({ id: 24, vertices: Object.freeze([3, 2] as const) }),
    ]),
    corners: Object.freeze([
      Object.freeze({ id: 100, face: 10, vertex: 0, edge: 20 }),
      Object.freeze({ id: 101, face: 10, vertex: 1, edge: 21 }),
      Object.freeze({ id: 102, face: 10, vertex: 2, edge: 22 }),
      Object.freeze({ id: 103, face: 11, vertex: 1, edge: 23 }),
      Object.freeze({ id: 104, face: 11, vertex: 3, edge: 24 }),
      Object.freeze({ id: 105, face: 11, vertex: 2, edge: 21 }),
    ]),
    faces: Object.freeze([
      Object.freeze({ id: 10, corners: Object.freeze([100, 101, 102]) }),
      Object.freeze({ id: 11, corners: Object.freeze([103, 104, 105]) }),
    ]),
    attributes: createAttributes(uvs, declaresUv0),
  });
}

function createTriangulation(
  triangles: ReadonlyArray<MeshTriangle> = TRIANGLES,
): MeshTriangulationService {
  return Object.freeze({
    triangles(): ReadonlyArray<MeshTriangle> {
      return triangles;
    },
    raycast(): MeshTriangleHit | null {
      return null;
    },
  });
}

function createHit(
  triangle: MeshTriangle = TRIANGLES[0]!,
  overrides: Partial<MeshTriangleHit> = {},
): MeshTriangleHit {
  return Object.freeze({
    ...triangle,
    meshVersion: 7,
    position: Object.freeze({ x: 0.25, y: 0.25, z: 0 }),
    normal: Object.freeze({ x: 0, y: 0, z: 1 }),
    barycentric: Object.freeze({ x: 0.5, y: 0.25, z: 0.25 }),
    distance: 1,
    ...overrides,
  });
}

describe("PaintTargetAdapter", () => {
  const mesh = createMesh();
  const adapter = new PaintTargetAdapter(createTriangulation());

  it("validates the exact canonical face/corner/vertex tuple and mesh version", () => {
    const hit = createHit();

    expect(adapter.isCanonicalHit(mesh, hit)).toBe(true);
    expect(adapter.isCanonicalHit(mesh, createHit(TRIANGLES[0]!, { meshVersion: 6 }))).toBe(false);
    expect(adapter.isCanonicalHit(mesh, createHit(TRIANGLES[0]!, { face: 11 }))).toBe(false);
    expect(adapter.isCanonicalHit(mesh, createHit(TRIANGLES[0]!, { corners: [101, 100, 102] }))).toBe(false);
    expect(adapter.isCanonicalHit(mesh, createHit(TRIANGLES[0]!, { vertices: [1, 0, 2] }))).toBe(false);
    expect(adapter.isCanonicalHit(mesh, null)).toBe(false);
  });

  it("rejects triangulation mappings that do not exist in the current snapshot", () => {
    const staleTriangle: MeshTriangle = {
      ...TRIANGLES[0]!,
      corners: [100, 101, 999],
    };
    const staleAdapter = new PaintTargetAdapter(createTriangulation([staleTriangle]));

    expect(staleAdapter.hasPaintableTriangles(mesh)).toBe(false);
    expect(staleAdapter.isCanonicalHit(mesh, createHit(staleTriangle))).toBe(false);
    expect(staleAdapter.resolveCornerUvs(mesh, createHit(staleTriangle))).toBeNull();
  });

  it("requires complete finite uv0 on every canonical triangle corner", () => {
    expect(adapter.hasPaintableTriangles(mesh)).toBe(true);
    expect(adapter.hasCompleteUv0(mesh)).toBe(true);
    expect(adapter.hasCompleteUv0(createMesh(COMPLETE_UVS, false))).toBe(false);

    const partial = new Map(COMPLETE_UVS);
    partial.delete(105);
    expect(adapter.hasCompleteUv0(createMesh(partial))).toBe(false);

    const nonFinite = new Map(COMPLETE_UVS);
    nonFinite.set(104, { x: Number.NaN, y: 0 });
    expect(adapter.hasCompleteUv0(createMesh(nonFinite))).toBe(false);

    const wrongVectorShape = new Map<number, AttributeValue>(COMPLETE_UVS);
    wrongVectorShape.set(104, { x: 1, y: 0, z: 0 });
    expect(adapter.hasCompleteUv0(createMesh(wrongVectorShape))).toBe(false);
  });

  it("resolves corner-domain seam charts only from the selected canonical triangle", () => {
    const first = adapter.resolveCornerUvs(mesh, createHit(TRIANGLES[0]!));
    const second = adapter.resolveCornerUvs(mesh, createHit(TRIANGLES[1]!));

    expect(first).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(second).toEqual([
      { x: 0.75, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.[0])).toBe(true);
  });

  it("validates the active image against the exact current project-stable ref", () => {
    expect(adapter.isCurrentImage(IMAGE, IMAGE)).toBe(true);
    expect(adapter.isCurrentImage(null, IMAGE)).toBe(false);
    expect(adapter.isCurrentImage(IMAGE, null)).toBe(false);
    expect(adapter.isCurrentImage(IMAGE, { ...IMAGE, revision: 3 })).toBe(false);
    expect(adapter.isCurrentImage(IMAGE, { ...IMAGE, width: 512 })).toBe(false);
    expect(adapter.isCurrentImage({ ...IMAGE, width: 0 }, { ...IMAGE, width: 0 })).toBe(false);
  });

  it("publishes only the canonical read-only uv0 attribute key", () => {
    expect(UV0_ATTRIBUTE_KEY).toEqual({ domain: "corner", name: "uv0" });
    expect(Object.isFrozen(UV0_ATTRIBUTE_KEY)).toBe(true);
  });
});

describe("PaintEligibilityService", () => {
  const mesh = createMesh();
  const adapter = new PaintTargetAdapter(createTriangulation());
  const eligibility = new PaintEligibilityService(adapter);

  it("enables only a current image and a fully mapped, complete target", () => {
    expect(eligibility.evaluate(mesh, IMAGE, IMAGE)).toEqual({ enabled: true });
    expect(eligibility.evaluate(mesh, null, null)).toEqual({
      enabled: false,
      reason: "missing-image",
    });
    expect(eligibility.evaluate(mesh, IMAGE, { ...IMAGE, revision: 3 })).toEqual({
      enabled: false,
      reason: "missing-image",
    });
  });

  it("distinguishes an unmapped target from missing or incomplete uv0", () => {
    const noTriangles = new PaintEligibilityService(
      new PaintTargetAdapter(createTriangulation([])),
    );
    const partial = new Map(COMPLETE_UVS);
    partial.delete(102);

    expect(noTriangles.evaluate(mesh, IMAGE, IMAGE)).toEqual({
      enabled: false,
      reason: "unmapped-target",
    });
    expect(eligibility.evaluate(createMesh(partial), IMAGE, IMAGE)).toEqual({
      enabled: false,
      reason: "missing-uv",
    });
    expect(eligibility.evaluate(createMesh(COMPLETE_UVS, false), IMAGE, IMAGE)).toEqual({
      enabled: false,
      reason: "missing-uv",
    });
  });

  it("applies a separate per-hit mapping gate without mutating target state", () => {
    expect(eligibility.evaluateHit(mesh, createHit(), IMAGE, IMAGE)).toEqual({ enabled: true });
    expect(eligibility.evaluateHit(mesh, null, IMAGE, IMAGE)).toEqual({
      enabled: false,
      reason: "unmapped-target",
    });
    expect(eligibility.evaluateHit(
      mesh,
      createHit(TRIANGLES[0]!, { meshVersion: 8 }),
      IMAGE,
      IMAGE,
    )).toEqual({
      enabled: false,
      reason: "unmapped-target",
    });
  });
});
