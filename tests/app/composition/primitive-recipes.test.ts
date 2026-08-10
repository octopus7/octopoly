import { describe, expect, it } from "vitest";

import {
  CUBE_RECIPE,
  PLANE_RECIPE,
  type PrimitiveRecipe,
} from "../../../src/app/composition/primitive-recipes";

function signedZ(recipe: PrimitiveRecipe, face: ReadonlyArray<number>): number {
  const a = recipe.vertices[face[0]!]!;
  const b = recipe.vertices[face[1]!]!;
  const c = recipe.vertices[face[2]!]!;
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

describe("PLANE_RECIPE", () => {
  it("describes one unit XY quad centered at the origin with +Z winding", () => {
    expect(PLANE_RECIPE).toEqual({
      label: "Add plane",
      vertices: [
        { x: -0.5, y: -0.5, z: 0 },
        { x: 0.5, y: -0.5, z: 0 },
        { x: 0.5, y: 0.5, z: 0 },
        { x: -0.5, y: 0.5, z: 0 },
      ],
      faces: [[0, 1, 2, 3]],
      expected: { vertices: 4, edges: 4, corners: 4, faces: 1 },
    });
    expect(signedZ(PLANE_RECIPE, PLANE_RECIPE.faces[0]!)).toBeGreaterThan(0);
  });
});

describe("CUBE_RECIPE", () => {
  it("describes the exact centered unit cube topology with outward quad winding", () => {
    expect(CUBE_RECIPE).toEqual({
      label: "Add cube",
      vertices: [
        { x: -0.5, y: -0.5, z: -0.5 },
        { x: 0.5, y: -0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: -0.5 },
        { x: -0.5, y: 0.5, z: -0.5 },
        { x: -0.5, y: -0.5, z: 0.5 },
        { x: 0.5, y: -0.5, z: 0.5 },
        { x: 0.5, y: 0.5, z: 0.5 },
        { x: -0.5, y: 0.5, z: 0.5 },
      ],
      faces: [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [3, 7, 6, 2],
        [0, 4, 7, 3],
      ],
      expected: { vertices: 8, edges: 12, corners: 24, faces: 6 },
    });

    for (const face of CUBE_RECIPE.faces) {
      const a = CUBE_RECIPE.vertices[face[0]!]!;
      const b = CUBE_RECIPE.vertices[face[1]!]!;
      const c = CUBE_RECIPE.vertices[face[2]!]!;
      const center = face.reduce(
        (sum, index) => {
          const vertex = CUBE_RECIPE.vertices[index]!;
          return { x: sum.x + vertex.x / 4, y: sum.y + vertex.y / 4, z: sum.z + vertex.z / 4 };
        },
        { x: 0, y: 0, z: 0 },
      );
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const normal = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x,
      };
      expect(normal.x * center.x + normal.y * center.y + normal.z * center.z).toBeGreaterThan(0);
    }
  });
});
