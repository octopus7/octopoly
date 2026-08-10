import { describe, expect, it } from "vitest";

import {
  CAT_RECIPE,
  DOG_RECIPE,
  FISH_RECIPE,
  COW_RECIPE,
  CUBE_RECIPE,
  DUCK_RECIPE,
  FROG_RECIPE,
  PIG_RECIPE,
  PLANE_RECIPE,
  RABBIT_RECIPE,
  TURTLE_RECIPE,
  ELEPHANT_RECIPE,
  CUP_RECIPE,
  CHAIR_RECIPE,
  FLOWERPOT_RECIPE,
  KETTLE_RECIPE,
  SNEAKER_RECIPE,
  BACKPACK_RECIPE,
  HELMET_RECIPE,
  GAMEPAD_RECIPE,
  CAMERA_RECIPE,
  BICYCLE_SADDLE_RECIPE,
  CAR_RECIPE,
  ROCKET_RECIPE,
  TREASURE_CHEST_RECIPE,
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
  const bounds = {
    x: [Math.min(...recipe.vertices.map(({ x }) => x)), Math.max(...recipe.vertices.map(({ x }) => x))],
    y: [Math.min(...recipe.vertices.map(({ y }) => y)), Math.max(...recipe.vertices.map(({ y }) => y))],
    z: [Math.min(...recipe.vertices.map(({ z }) => z)), Math.max(...recipe.vertices.map(({ z }) => z))],
  } as const;
  expect(Object.values(bounds).flat().every(Number.isFinite)).toBe(true);
  expect(bounds.x[1] - bounds.x[0]).toBeGreaterThan(0);
  expect(bounds.y[1] - bounds.y[0]).toBeGreaterThan(0);
  expect(bounds.z[1] - bounds.z[0]).toBeGreaterThan(0);

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

describe("TURTLE_RECIPE", () => {
  it("has distinct validated turtle landmarks", () => {
    validateClosedOutwardRecipe(TURTLE_RECIPE, { vertices: 56, edges: 84, corners: 168, faces: 42 }, 7);
    expect(TURTLE_RECIPE.vertices.filter(({ y }) => y > 0.45).length).toBeGreaterThanOrEqual(4);
    expect(TURTLE_RECIPE.vertices.filter(({ x }) => x > 1).length).toBeGreaterThanOrEqual(4);
    expect(TURTLE_RECIPE.vertices.filter(({ z }) => Math.abs(z) > 0.65).length).toBeGreaterThanOrEqual(8);
  });
});

describe("ELEPHANT_RECIPE", () => {
  it("has distinct validated elephant trunk, ears, and thick legs", () => {
    validateClosedOutwardRecipe(ELEPHANT_RECIPE, { vertices: 80, edges: 120, corners: 240, faces: 60 }, 10);
    expect(ELEPHANT_RECIPE.vertices.filter(({ x, y }) => x > 1.15 && y < -0.25).length).toBeGreaterThanOrEqual(8);
    expect(ELEPHANT_RECIPE.vertices.filter(({ z }) => Math.abs(z) > 0.65).length).toBeGreaterThanOrEqual(8);
    expect(ELEPHANT_RECIPE.vertices.filter(({ y }) => y < -0.75).length).toBeGreaterThanOrEqual(16);
  });
});

describe("CUP_RECIPE", () => {
  it("has distinct validated cup landmarks", () => {
    validateClosedOutwardRecipe(CUP_RECIPE, { vertices: 40, edges: 60, corners: 120, faces: 30 }, 5);
    expect(CUP_RECIPE.vertices.filter(({ y }) => y > 0.72).length).toBeGreaterThanOrEqual(4);
    expect(CUP_RECIPE.vertices.filter(({ x }) => x > 0.72).length).toBeGreaterThanOrEqual(8);
    const cupBody = CUP_RECIPE.vertices.slice(0, 8);
    expect(Math.max(...cupBody.filter(({ y }) => y > 0).map(({ z }) => Math.abs(z))))
      .toBeGreaterThan(Math.max(...cupBody.filter(({ y }) => y < 0).map(({ z }) => Math.abs(z))));
  });
});

describe("CHAIR_RECIPE", () => {
  it("has distinct validated chair landmarks", () => { validateClosedOutwardRecipe(CHAIR_RECIPE, { vertices: 48, edges: 72, corners: 144, faces: 36 }, 6); expect(Math.max(...CHAIR_RECIPE.vertices.map(({ y }) => y))).toBeGreaterThan(1.5); expect(CHAIR_RECIPE.vertices.filter(({ y }) => y < -1).length).toBeGreaterThanOrEqual(16); });
});

describe("FLOWERPOT_RECIPE", () => { it("has distinct validated flowerpot landmarks", () => { validateClosedOutwardRecipe(FLOWERPOT_RECIPE, { vertices: 16, edges: 24, corners: 48, faces: 12 }, 2); expect(Math.max(...FLOWERPOT_RECIPE.vertices.map(({ y }) => y))).toBeGreaterThan(0.7); expect(Math.max(...FLOWERPOT_RECIPE.vertices.map(({ z }) => z))).toBeGreaterThan(0.65); const body = FLOWERPOT_RECIPE.vertices.slice(0, 8); expect(Math.max(...body.filter(({ y }) => y > 0).map(({ z }) => Math.abs(z)))).toBeGreaterThan(Math.max(...body.filter(({ y }) => y < 0).map(({ z }) => Math.abs(z)))); }); });

describe("KETTLE_RECIPE", () => { it("has distinct validated kettle landmarks", () => { validateClosedOutwardRecipe(KETTLE_RECIPE, { vertices: 48, edges: 72, corners: 144, faces: 36 }, 6); expect(Math.max(...KETTLE_RECIPE.vertices.map(({ x }) => x))).toBeGreaterThan(1.6); expect(Math.max(...KETTLE_RECIPE.vertices.map(({ y }) => y))).toBeGreaterThan(1.3); }); });

describe("SNEAKER_RECIPE", () => { it("has distinct validated sneaker landmarks", () => { validateClosedOutwardRecipe(SNEAKER_RECIPE, { vertices: 32, edges: 48, corners: 96, faces: 24 }, 4); expect(Math.max(...SNEAKER_RECIPE.vertices.map(({ x }) => x))).toBeGreaterThan(1.35); expect(Math.min(...SNEAKER_RECIPE.vertices.map(({ y }) => y))).toBeLessThan(-0.45); expect(Math.max(...SNEAKER_RECIPE.vertices.map(({ y }) => y))).toBeGreaterThan(0.65); }); });

describe("BACKPACK_RECIPE",()=>{it("has distinct validated backpack landmarks",()=>{validateClosedOutwardRecipe(BACKPACK_RECIPE,{vertices:48,edges:72,corners:144,faces:36},6);expect(Math.max(...BACKPACK_RECIPE.vertices.map(({y})=>y))).toBeGreaterThan(1.2);expect(Math.max(...BACKPACK_RECIPE.vertices.map(({x})=>x))).toBeGreaterThan(0.85);expect(Math.max(...BACKPACK_RECIPE.vertices.map(({z})=>z))).toBeGreaterThan(0.65);});});

describe("HELMET_RECIPE",()=>{it("has distinct validated helmet landmarks",()=>{validateClosedOutwardRecipe(HELMET_RECIPE,{vertices:40,edges:60,corners:120,faces:28},4);expect(Math.max(...HELMET_RECIPE.vertices.map(({z})=>z))).toBeGreaterThan(0.8);expect(HELMET_RECIPE.vertices.filter(({x})=>x>0.75).length).toBeGreaterThanOrEqual(4);});});

describe("GAMEPAD_RECIPE",()=>{it("has distinct validated gamepad landmarks",()=>{validateClosedOutwardRecipe(GAMEPAD_RECIPE,{vertices:80,edges:120,corners:240,faces:56},8);expect(GAMEPAD_RECIPE.vertices.filter(({y})=>y>0.55).length).toBeGreaterThanOrEqual(16);expect(Math.max(...GAMEPAD_RECIPE.vertices.map(({x})=>x))).toBeGreaterThan(1);});});

describe("CAMERA_RECIPE",()=>{it("has distinct validated camera landmarks",()=>{validateClosedOutwardRecipe(CAMERA_RECIPE,{vertices:32,edges:48,corners:96,faces:22},3);expect(Math.max(...CAMERA_RECIPE.vertices.map(({x})=>x))).toBeGreaterThan(1);expect(CAMERA_RECIPE.faces.some((face)=>face.length===8)).toBe(true);});});

describe("BICYCLE_SADDLE_RECIPE",()=>{it("has distinct validated bicycle saddle landmarks",()=>{validateClosedOutwardRecipe(BICYCLE_SADDLE_RECIPE,{vertices:24,edges:36,corners:72,faces:18},3);expect(Math.max(...BICYCLE_SADDLE_RECIPE.vertices.map(({x})=>x))).toBeGreaterThan(1);expect(Math.max(...BICYCLE_SADDLE_RECIPE.vertices.map(({z})=>z))).toBeGreaterThan(0.7);});});

describe("CAR_RECIPE",()=>{it("has distinct validated car landmarks",()=>{validateClosedOutwardRecipe(CAR_RECIPE,{vertices:80,edges:120,corners:240,faces:52},6);expect(Math.max(...CAR_RECIPE.vertices.map(({x})=>x))).toBeGreaterThan(1.5);expect(CAR_RECIPE.faces.filter((face)=>face.length===8)).toHaveLength(8);});});

describe("ROCKET_RECIPE",()=>{it("has distinct validated rocket landmarks",()=>{validateClosedOutwardRecipe(ROCKET_RECIPE,{vertices:53,edges:80,corners:160,faces:39},6);expect(Math.max(...ROCKET_RECIPE.vertices.map(({y})=>y))).toBeGreaterThan(1.7);expect(ROCKET_RECIPE.faces.some((face)=>face.length===8)).toBe(true);expect(ROCKET_RECIPE.vertices.filter(({z})=>Math.abs(z)>0.65).length).toBeGreaterThanOrEqual(8);});});

describe("TREASURE_CHEST_RECIPE",()=>{it("has distinct validated treasure chest body, lid, and hinge landmarks",()=>{validateClosedOutwardRecipe(TREASURE_CHEST_RECIPE,{vertices:24,edges:36,corners:72,faces:18},3);expect(Math.max(...TREASURE_CHEST_RECIPE.vertices.map(({y})=>y))).toBeGreaterThan(0.75);expect(TREASURE_CHEST_RECIPE.vertices.filter(({x})=>x<-0.9).length).toBeGreaterThanOrEqual(4);});});

describe("FISH_RECIPE", () => {
  it("is a closed outward asymmetric-axis fish with body, tail, dorsal, and paired side fins", () => {
    validateClosedOutwardRecipe(FISH_RECIPE, { vertices: 40, edges: 60, corners: 120, faces: 30 }, 5);
    expect(Math.max(...FISH_RECIPE.vertices.map(({ x }) => x))).toBeGreaterThan(1.05);
    expect(Math.min(...FISH_RECIPE.vertices.map(({ x }) => x))).toBeLessThan(-1.35);
    expect(FISH_RECIPE.vertices.filter(({ y }) => y > 0.65).length).toBeGreaterThanOrEqual(4);
    const positive = FISH_RECIPE.vertices.filter(({ z }) => z > 0.55).length;
    const negative = FISH_RECIPE.vertices.filter(({ z }) => z < -0.55).length;
    expect(positive).toBe(negative);
  });
});

describe("DOG_RECIPE", () => {
  it("is a distinct closed outward dog with muzzle, floppy ears, four legs, and tail", () => {
    validateClosedOutwardRecipe(DOG_RECIPE, { vertices: 80, edges: 120, corners: 240, faces: 60 }, 10);
    expect(DOG_RECIPE.vertices.filter(({ x }) => x > 1.05).length).toBeGreaterThanOrEqual(8);
    expect(DOG_RECIPE.vertices.filter(({ y, z }) => y > 0.35 && Math.abs(z) > 0.38).length).toBeGreaterThanOrEqual(8);
    expect(DOG_RECIPE.vertices.filter(({ y }) => y < -0.55).length).toBeGreaterThanOrEqual(16);
  });
});

describe("CAT_RECIPE", () => {
  it("is a distinct closed outward cat with pointed ears, four legs, and a long tail", () => {
    validateClosedOutwardRecipe(CAT_RECIPE, { vertices: 74, edges: 112, corners: 224, faces: 58 }, 10);
    expect(CAT_RECIPE.vertices.filter(({ y, z }) => y > 0.85 && Math.abs(z) > 0.15).length).toBeGreaterThanOrEqual(2);
    expect(CAT_RECIPE.vertices.filter(({ y }) => y < -0.55).length).toBeGreaterThanOrEqual(16);
    expect(Math.min(...CAT_RECIPE.vertices.map(({ x }) => x))).toBeLessThan(-1.7);
  });
});
