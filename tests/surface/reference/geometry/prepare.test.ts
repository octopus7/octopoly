import { describe, expect, it } from "vitest";

import type { Mat4, TriangleMeshSnapshot } from "@octopoly/contracts";

import { prepareReferenceGeometry } from "../../../../src/surface/reference/geometry/prepared-reference-geometry";

const identity: Mat4 = Object.freeze({
  elements: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
});

function triangle(overrides: Partial<TriangleMeshSnapshot> = {}): TriangleMeshSnapshot {
  return {
    version: 3,
    positions: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    normals: [
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
    indices: [0, 1, 2],
    ...overrides,
  };
}

function triangleWithoutNormals(
  overrides: Omit<Partial<TriangleMeshSnapshot>, "normals"> = {},
): TriangleMeshSnapshot {
  const { normals: _normals, ...withoutNormals } = triangle(overrides);
  return withoutNormals;
}

describe("prepareReferenceGeometry", () => {
  it("creates immutable identity geometry with stable triangle ids and bounds", () => {
    const source = triangle();
    const prepared = prepareReferenceGeometry(source, identity);

    expect(prepared.geometry).not.toBe(source);
    expect(prepared.geometry.positions).not.toBe(source.positions);
    expect(prepared.triangleCount).toBe(1);
    expect(prepared.validTriangleIds).toEqual([0]);
    expect(prepared.localBounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } });
    expect(prepared.bounds).toEqual(prepared.localBounds);
    expect(Object.isFrozen(prepared.geometry)).toBe(true);
    expect(Object.isFrozen(prepared.geometry.positions)).toBe(true);
    expect(prepared.triangle(0).id).toBe(0);
  });

  it("bakes translation and non-uniform scale and uses inverse-transpose normals", () => {
    const transform: Mat4 = {
      elements: [2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0.5, 0, 5, -2, 3, 1],
    };
    const prepared = prepareReferenceGeometry(triangle(), transform);

    expect(prepared.geometry.positions).toEqual([
      { x: 5, y: -2, z: 3 },
      { x: 7, y: -2, z: 3 },
      { x: 5, y: 2, z: 3 },
    ]);
    const expectedLength = Math.hypot(0.5, 0.25);
    expect(prepared.geometry.normals?.[0]?.x).toBeCloseTo(0.5 / expectedLength, 12);
    expect(prepared.geometry.normals?.[0]?.y).toBeCloseTo(0.25 / expectedLength, 12);
    expect(prepared.geometry.normals?.[0]?.z).toBe(0);
  });

  it("uses the column-major right-handed rotation convention", () => {
    const quarterTurnAroundZ: Mat4 = {
      elements: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    };
    const prepared = prepareReferenceGeometry(triangle(), quarterTurnAroundZ);
    const inverseSqrtTwo = 1 / Math.sqrt(2);

    expect(prepared.geometry.positions).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: -1, y: 0, z: 0 },
    ]);
    expect(prepared.geometry.normals?.[0]?.x).toBeCloseTo(-inverseSqrtTwo, 12);
    expect(prepared.geometry.normals?.[0]?.y).toBeCloseTo(inverseSqrtTwo, 12);
    expect(prepared.geometry.normals?.[0]?.z).toBe(0);
  });

  it("owns copies that are unaffected by source mutation", () => {
    const positions = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];
    const indices = [0, 1, 2];
    const prepared = prepareReferenceGeometry(triangleWithoutNormals({ positions, indices }), identity);

    positions[0]!.x = 99;
    indices[0] = 2;

    expect(prepared.geometry.positions[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(prepared.geometry.indices).toEqual([0, 1, 2]);
  });

  it("classifies degenerate triangles without changing stable ids", () => {
    const prepared = prepareReferenceGeometry(
      triangleWithoutNormals({
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        indices: [0, 1, 2, 0, 1, 3],
      }),
      identity,
    );

    expect(prepared.triangleCount).toBe(2);
    expect(prepared.triangle(0).degenerate).toBe(true);
    expect(prepared.triangle(1).degenerate).toBe(false);
    expect(prepared.validTriangleIds).toEqual([1]);
  });

  it("uses the ADR scene-scale area tolerance for very small and large fixtures", () => {
    const small = prepareReferenceGeometry(
      triangleWithoutNormals({
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1e-10, y: 0, z: 0 },
          { x: 0, y: 1e-10, z: 0 },
        ],
      }),
      identity,
    );
    const largeScene = prepareReferenceGeometry(
      triangleWithoutNormals({
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 1e9, y: 0, z: 0 },
        ],
      }),
      identity,
    );

    expect(small.triangle(0).degenerate).toBe(true);
    expect(largeScene.sceneScale).toBe(1e9);
    expect(largeScene.triangle(0).degenerate).toBe(true);
  });

  it.each([
    triangle({ indices: [0, 1] }),
    triangle({ indices: [0, 1, 3] }),
    triangle({ normals: [{ x: 0, y: 1, z: 0 }] }),
    triangleWithoutNormals({ positions: [{ x: Number.NaN, y: 0, z: 0 }], indices: [] }),
  ])("rejects invalid geometry before returning a prepared resource", (source) => {
    expect(() => prepareReferenceGeometry(source, identity)).toThrow();
  });

  it("rejects non-finite and singular transforms", () => {
    expect(() =>
      prepareReferenceGeometry(triangle(), {
        elements: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      }),
    ).toThrow("non-singular");
    expect(() =>
      prepareReferenceGeometry(triangle(), {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Number.POSITIVE_INFINITY, 0, 0, 1],
      }),
    ).toThrow("finite");
  });

  it("disposes idempotently and prevents triangle storage access", () => {
    const prepared = prepareReferenceGeometry(triangle(), identity);
    prepared.dispose();
    prepared.dispose();

    expect(() => prepared.triangle(0)).toThrow("disposed");
    expect(() => prepared.validTriangleIds).toThrow("disposed");
  });
});
