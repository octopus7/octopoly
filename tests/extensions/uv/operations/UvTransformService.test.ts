import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  MeshSnapshot,
  Vec2,
} from "@octopoly/contracts";

import { UvTransformService } from "../../../../src/extensions/uv/operations/UvTransformService";

class UvAttributes implements AttributeSnapshot {
  constructor(private readonly values: ReadonlyMap<number, Vec2>) {}

  has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return key.domain === "corner" && key.name === "uv0" && this.values.size > 0;
  }

  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    if (key.domain !== "corner" || key.name !== "uv0") {
      return undefined;
    }
    return this.values.get(elementId) as T | undefined;
  }
}

function snapshot(values: ReadonlyMap<number, Vec2>): MeshSnapshot {
  return {
    version: 1,
    vertices: [
      { id: 0, position: { x: 0, y: 0, z: 0 } },
      { id: 1, position: { x: 1, y: 0, z: 0 } },
      { id: 2, position: { x: 0, y: 1, z: 0 } },
      { id: 3, position: { x: 1, y: 1, z: 0 } },
    ],
    edges: [
      { id: 0, vertices: [0, 1] },
      { id: 1, vertices: [1, 3] },
      { id: 2, vertices: [2, 3] },
      { id: 3, vertices: [0, 2] },
    ],
    corners: [
      { id: 0, face: 0, vertex: 0, edge: 0 },
      { id: 1, face: 0, vertex: 1, edge: 1 },
      { id: 2, face: 0, vertex: 3, edge: 2 },
      { id: 3, face: 0, vertex: 2, edge: 3 },
    ],
    faces: [{ id: 0, corners: [0, 1, 2, 3] }],
    attributes: new UvAttributes(values),
  };
}

describe("UvTransformService", () => {
  it("moves only live selected corners and preserves explicit undefined values", () => {
    const source = new Map<number, Vec2>([
      [0, { x: 0, y: 0 }],
      [1, { x: 2, y: 0 }],
    ]);
    const result = new UvTransformService().move(snapshot(source), [0, 1, 2, 99, 1], { x: 3, y: -1 });

    expect(new Map(result)).toEqual(new Map([
      [0, { x: 3, y: -1 }],
      [1, { x: 5, y: -1 }],
      [2, undefined],
    ]));
    expect(source).toEqual(new Map([
      [0, { x: 0, y: 0 }],
      [1, { x: 2, y: 0 }],
    ]));
  });

  it("rotates and scales around deterministic pivots", () => {
    const source = snapshot(new Map([
      [0, { x: 0, y: 0 }],
      [1, { x: 2, y: 0 }],
    ]));
    const service = new UvTransformService();

    const rotated = service.rotate(source, [0, 1], Math.PI / 2);
    expect(rotated.get(0)?.x).toBeCloseTo(1);
    expect(rotated.get(0)?.y).toBeCloseTo(-1);
    expect(rotated.get(1)?.x).toBeCloseTo(1);
    expect(rotated.get(1)?.y).toBeCloseTo(1);

    expect(new Map(service.scale(source, [0, 1], { x: 2, y: 3 }, { x: 0, y: 0 }))).toEqual(new Map([
      [0, { x: 0, y: 0 }],
      [1, { x: 4, y: 0 }],
    ]));
  });

  it("normalizes into a padded unit square while preserving aspect ratio", () => {
    const source = snapshot(new Map([
      [0, { x: 0, y: 0 }],
      [1, { x: 2, y: 0 }],
      [2, { x: 2, y: 1 }],
      [3, { x: 0, y: 1 }],
    ]));

    expect(new Map(new UvTransformService().normalize(source, [0, 1, 2, 3], 0.1))).toEqual(new Map([
      [0, { x: 0.09999999999999998, y: 0.3 }],
      [1, { x: 0.9, y: 0.3 }],
      [2, { x: 0.9, y: 0.7 }],
      [3, { x: 0.09999999999999998, y: 0.7 }],
    ]));
  });

  it("centers a degenerate selection and rejects non-finite inputs before producing output", () => {
    const service = new UvTransformService();
    const degenerate = snapshot(new Map([
      [0, { x: 4, y: -2 }],
      [1, { x: 4, y: -2 }],
    ]));

    expect(new Map(service.normalize(degenerate, [0, 1]))).toEqual(new Map([
      [0, { x: 0.5, y: 0.5 }],
      [1, { x: 0.5, y: 0.5 }],
    ]));
    expect(() => service.move(degenerate, [0], { x: Number.NaN, y: 0 })).toThrow("finite");
    expect(() => service.rotate(degenerate, [0], Number.POSITIVE_INFINITY)).toThrow("finite");
    expect(() => service.normalize(degenerate, [0], 0.5)).toThrow("[0, 0.5)");

    const invalid = snapshot(new Map([[0, { x: Number.NaN, y: 0 }]]));
    expect(() => service.scale(invalid, [0], 1)).toThrow("corner 0");
  });

  it("returns an immutable ReadonlyMap boundary instead of a cast mutable Map", () => {
    const result = new UvTransformService().move(
      snapshot(new Map([[0, { x: 1, y: 2 }]])),
      [0],
      { x: 3, y: 4 },
    );

    expect(result).not.toBeInstanceOf(Map);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => (result as unknown as Map<number, Vec2>).set(0, { x: 99, y: 99 })).toThrow(TypeError);
    expect(result.get(0)).toEqual({ x: 4, y: 6 });
  });
});
