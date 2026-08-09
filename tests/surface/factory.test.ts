import { describe, expect, it } from "vitest";

import type { Mat4, Ray, TriangleMeshSnapshot, Vec3 } from "@octopoly/contracts";

import {
  ReferenceSurfaceFactoryImpl,
  createReferenceSurfaceFactory,
} from "../../src/surface";

const identity: Mat4 = Object.freeze({
  elements: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
});

function snapshot(): TriangleMeshSnapshot {
  return {
    version: 7,
    positions: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 0, z: 2 },
      { x: 2, y: 0, z: 2 },
      { x: 0, y: 2, z: 2 },
    ],
    indices: [0, 1, 2, 3, 4, 5],
  };
}

function down(origin: Vec3): Ray {
  return { origin, direction: { x: 0, y: 0, z: -1 } };
}

describe("ReferenceSurfaceFactoryImpl", () => {
  it("composes baked geometry, acceleration, raycast, and nearest query", () => {
    const surface = new ReferenceSurfaceFactoryImpl().create("fixture", snapshot(), identity);

    expect(surface.id).toBe("fixture");
    expect(surface.geometry.version).toBe(7);
    expect(surface.query.raycast(down({ x: 0.25, y: 0.25, z: 4 }))?.triangleId).toBe(1);
    expect(surface.query.nearest({ x: 0.25, y: 0.25, z: 1.75 })?.triangleId).toBe(1);
  });

  it("keeps the public baked snapshot immutable and detached from the source", () => {
    const source = snapshot();
    const mutablePositions = source.positions as Array<Vec3>;
    const mutableIndices = source.indices as number[];
    const surface = createReferenceSurfaceFactory().create("immutable", source, identity);

    mutablePositions[0] = { x: 100, y: 100, z: 100 };
    mutableIndices[0] = 5;

    expect(surface.geometry.positions[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(surface.geometry.indices[0]).toBe(0);
    expect(Object.isFrozen(surface.geometry)).toBe(true);
    expect(Object.isFrozen(surface.geometry.positions)).toBe(true);
    expect(Object.isFrozen(surface.geometry.indices)).toBe(true);
  });

  it("places baked geometry and query hits in the same transformed world space", () => {
    const transform: Mat4 = {
      elements: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0.5, 0, 10, -4, 5, 1],
    };
    const surface = createReferenceSurfaceFactory().create("world", snapshot(), transform);
    const hit = surface.query.raycast(down({ x: 10.5, y: -3.5, z: 9 }));

    expect(surface.geometry.positions[0]).toEqual({ x: 10, y: -4, z: 5 });
    expect(surface.geometry.positions[3]).toEqual({ x: 10, y: -4, z: 6 });
    expect(hit?.triangleId).toBe(1);
    expect(hit?.position).toEqual({ x: 10.5, y: -3.5, z: 6 });
    expect(hit?.distance).toBe(3);
  });

  it("returns null for empty, miss, and max-distance-outside fixtures", () => {
    const factory = createReferenceSurfaceFactory();
    const empty = factory.create(
      "empty",
      { version: 0, positions: [], indices: [] },
      identity,
    );
    const surface = factory.create("miss", snapshot(), identity);

    expect(empty.query.raycast(down({ x: 0, y: 0, z: 1 }))).toBeNull();
    expect(empty.query.nearest({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(surface.query.raycast(down({ x: 5, y: 5, z: 4 }))).toBeNull();
    expect(surface.query.raycast(down({ x: 0.25, y: 0.25, z: 4 }), 1)).toBeNull();
    expect(surface.query.nearest({ x: 10, y: 10, z: 10 }, 1)).toBeNull();
  });

  it("rejects invalid creation atomically", () => {
    const factory = createReferenceSurfaceFactory();

    expect(() =>
      factory.create("invalid-index", { version: 0, positions: [], indices: [0, 0, 0] }, identity),
    ).toThrow(RangeError);
    expect(() =>
      factory.create("singular", snapshot(), {
        elements: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      }),
    ).toThrow(RangeError);
  });

  it("disposes idempotently and makes its query stale-proof", () => {
    const surface = createReferenceSurfaceFactory().create("disposed", snapshot(), identity);
    const bakedGeometry = surface.geometry;

    surface.dispose();
    surface.dispose();

    expect(() => surface.query.raycast(down({ x: 0.25, y: 0.25, z: 4 }))).toThrow("disposed");
    expect(() => surface.query.nearest({ x: 0, y: 0, z: 0 })).toThrow("disposed");
    expect(bakedGeometry.positions).toHaveLength(6);
  });
});
