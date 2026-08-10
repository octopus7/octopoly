import type { Vec3 } from "@octopoly/contracts";

export interface PrimitiveRecipe {
  readonly label: string;
  readonly vertices: ReadonlyArray<Vec3>;
  readonly faces: ReadonlyArray<ReadonlyArray<number>>;
  readonly expected: Readonly<{
    vertices: number;
    edges: number;
    corners: number;
    faces: number;
  }>;
}

const PLANE_VERTICES: ReadonlyArray<Vec3> = Object.freeze([
  Object.freeze({ x: -0.5, y: -0.5, z: 0 }),
  Object.freeze({ x: 0.5, y: -0.5, z: 0 }),
  Object.freeze({ x: 0.5, y: 0.5, z: 0 }),
  Object.freeze({ x: -0.5, y: 0.5, z: 0 }),
]);

export const PLANE_RECIPE: PrimitiveRecipe = Object.freeze({
  label: "Add plane",
  vertices: PLANE_VERTICES,
  faces: Object.freeze([Object.freeze([0, 1, 2, 3])]),
  expected: Object.freeze({ vertices: 4, edges: 4, corners: 4, faces: 1 }),
});

const CUBE_VERTICES: ReadonlyArray<Vec3> = Object.freeze([
  Object.freeze({ x: -0.5, y: -0.5, z: -0.5 }),
  Object.freeze({ x: 0.5, y: -0.5, z: -0.5 }),
  Object.freeze({ x: 0.5, y: 0.5, z: -0.5 }),
  Object.freeze({ x: -0.5, y: 0.5, z: -0.5 }),
  Object.freeze({ x: -0.5, y: -0.5, z: 0.5 }),
  Object.freeze({ x: 0.5, y: -0.5, z: 0.5 }),
  Object.freeze({ x: 0.5, y: 0.5, z: 0.5 }),
  Object.freeze({ x: -0.5, y: 0.5, z: 0.5 }),
]);

export const CUBE_RECIPE: PrimitiveRecipe = Object.freeze({
  label: "Add cube",
  vertices: CUBE_VERTICES,
  faces: Object.freeze([
    Object.freeze([0, 3, 2, 1]),
    Object.freeze([4, 5, 6, 7]),
    Object.freeze([0, 1, 5, 4]),
    Object.freeze([1, 2, 6, 5]),
    Object.freeze([3, 7, 6, 2]),
    Object.freeze([0, 4, 7, 3]),
  ]),
  expected: Object.freeze({ vertices: 8, edges: 12, corners: 24, faces: 6 }),
});
