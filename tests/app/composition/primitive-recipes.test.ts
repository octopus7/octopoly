import { describe, expect, it } from "vitest";

import {
  COW_RECIPE,
  CUBE_RECIPE,
  DUCK_RECIPE,
  FROG_RECIPE,
  PIG_RECIPE,
  PLANE_RECIPE,
  RABBIT_RECIPE,
  type PrimitiveRecipe,
} from "../../../src/app/composition/primitive-recipes";

function signedZ(recipe: PrimitiveRecipe, face: ReadonlyArray<number>): number {
  const a = recipe.vertices[face[0]!]!;
  const b = recipe.vertices[face[1]!]!;
  const c = recipe.vertices[face[2]!]!;
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function validateClosedOutwardRecipe(
  recipe: PrimitiveRecipe,
  expected: PrimitiveRecipe["expected"],
  expectedComponents: number,
): void {
  expect(recipe.expected).toEqual(expected);
  expect(recipe.vertices).toHaveLength(expected.vertices);
  expect(recipe.faces).toHaveLength(expected.faces);
  expect(recipe.vertices.every((vertex) => [vertex.x, vertex.y, vertex.z].every(Number.isFinite))).toBe(true);
  expect(new Set(recipe.vertices.map(({ x, y, z }) => `${x}:${y}:${z}`)).size).toBe(expected.vertices);

  const adjacency = recipe.vertices.map(() => new Set<number>());
  const edges = new Map<string, number>();
  for (const face of recipe.faces) {
    expect(face.length).toBeGreaterThanOrEqual(3);
    expect(new Set(face).size).toBe(face.length);
    for (const index of face) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(recipe.vertices.length);
    }
    for (let index = 0; index < face.length; index += 1) {
      const left = face[index]!;
      const right = face[(index + 1) % face.length]!;
      adjacency[left]!.add(right);
      adjacency[right]!.add(left);
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  expect(edges.size).toBe(expected.edges);
  expect([...edges.values()].every((uses) => uses === 2)).toBe(true);
  expect(recipe.faces.reduce((count, face) => count + face.length, 0)).toBe(expected.corners);

  const componentByVertex = new Array<number>(recipe.vertices.length).fill(-1);
  const components: number[][] = [];
  for (let root = 0; root < recipe.vertices.length; root += 1) {
    if (componentByVertex[root] !== -1) continue;
    const componentIndex = components.length;
    const component: number[] = [];
    const stack = [root];
    componentByVertex[root] = componentIndex;
    while (stack.length > 0) {
      const vertex = stack.pop()!;
      component.push(vertex);
      for (const next of adjacency[vertex]!) {
        if (componentByVertex[next] === -1) {
          componentByVertex[next] = componentIndex;
          stack.push(next);
        }
      }
    }
    components.push(component);
  }
  expect(components).toHaveLength(expectedComponents);

  const centers = components.map((component) => component.reduce(
    (sum, index) => {
      const vertex = recipe.vertices[index]!;
      return {
        x: sum.x + vertex.x / component.length,
        y: sum.y + vertex.y / component.length,
        z: sum.z + vertex.z / component.length,
      };
    },
    { x: 0, y: 0, z: 0 },
  ));
  for (const face of recipe.faces) {
    const a = recipe.vertices[face[0]!]!;
    const b = recipe.vertices[face[1]!]!;
    const c = recipe.vertices[face[2]!]!;
    const faceCenter = face.reduce((sum, index) => {
      const vertex = recipe.vertices[index]!;
      return {
        x: sum.x + vertex.x / face.length,
        y: sum.y + vertex.y / face.length,
        z: sum.z + vertex.z / face.length,
      };
    }, { x: 0, y: 0, z: 0 });
    const center = centers[componentByVertex[face[0]!]!]!;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const normal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    expect(
      normal.x * (faceCenter.x - center.x)
      + normal.y * (faceCenter.y - center.y)
      + normal.z * (faceCenter.z - center.z),
    ).toBeGreaterThan(0);
  }
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
    validateClosedOutwardRecipe(CUBE_RECIPE, CUBE_RECIPE.expected, 1);
  });
});

describe("DUCK_RECIPE", () => {
  it("is a closed outward low-poly duck with separate body, head, and beak", () => {
    validateClosedOutwardRecipe(
      DUCK_RECIPE,
      { vertices: 24, edges: 36, corners: 72, faces: 18 },
      3,
    );
    const extentX = Math.max(...DUCK_RECIPE.vertices.map(({ x }) => x)) - Math.min(...DUCK_RECIPE.vertices.map(({ x }) => x));
    const extentY = Math.max(...DUCK_RECIPE.vertices.map(({ y }) => y)) - Math.min(...DUCK_RECIPE.vertices.map(({ y }) => y));
    expect(extentX).toBeGreaterThan(extentY);
    expect(DUCK_RECIPE.vertices.some(({ x, y, z }) => x > 1 && y > 0.25 && Math.abs(z) < 0.4)).toBe(true);
  });
});

describe("FROG_RECIPE", () => {
  it("is a closed outward squat frog with two large eyes and four legs", () => {
    validateClosedOutwardRecipe(
      FROG_RECIPE,
      { vertices: 56, edges: 84, corners: 168, faces: 42 },
      7,
    );
    const eyeVertices = FROG_RECIPE.vertices.filter(({ y, z }) => y > 0.28 && Math.abs(z) > 0.15);
    const legVertices = FROG_RECIPE.vertices.filter(({ y, z }) => y < -0.25 && Math.abs(z) > 0.45);
    expect(eyeVertices.length).toBeGreaterThanOrEqual(8);
    expect(legVertices.length).toBeGreaterThanOrEqual(16);
  });
});

describe("PIG_RECIPE", () => {
  it("is a closed outward low-poly pig with snout, ears, and four legs", () => {
    validateClosedOutwardRecipe(
      PIG_RECIPE,
      { vertices: 64, edges: 96, corners: 192, faces: 48 },
      8,
    );
    expect(PIG_RECIPE.vertices.filter(({ x }) => x > 1).length).toBeGreaterThanOrEqual(4);
    expect(PIG_RECIPE.vertices.filter(({ y }) => y > 0.5).length).toBeGreaterThanOrEqual(8);
    expect(PIG_RECIPE.vertices.filter(({ y }) => y < -0.5).length).toBeGreaterThanOrEqual(16);
  });
});

describe("COW_RECIPE", () => {
  it("is a closed outward low-poly cow with muzzle, horns, and four legs", () => {
    validateClosedOutwardRecipe(
      COW_RECIPE,
      { vertices: 72, edges: 108, corners: 216, faces: 54 },
      9,
    );
    expect(COW_RECIPE.vertices.filter(({ x }) => x > 1.35).length).toBeGreaterThanOrEqual(4);
    expect(COW_RECIPE.vertices.filter(({ y }) => y > 0.8).length).toBeGreaterThanOrEqual(8);
    expect(COW_RECIPE.vertices.filter(({ y }) => y < -0.5).length).toBeGreaterThanOrEqual(16);
  });
});

describe("RABBIT_RECIPE", () => {
  it("is a closed outward low-poly rabbit with long ears and hind legs", () => {
    validateClosedOutwardRecipe(
      RABBIT_RECIPE,
      { vertices: 48, edges: 72, corners: 144, faces: 36 },
      6,
    );
    expect(RABBIT_RECIPE.vertices.filter(({ y }) => y > 1.2).length).toBeGreaterThanOrEqual(8);
    expect(RABBIT_RECIPE.vertices.filter(({ x, y }) => x < -0.5 && y < -0.4).length).toBeGreaterThanOrEqual(8);
  });
});
