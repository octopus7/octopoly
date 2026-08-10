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

interface BoxPart {
  readonly center: Vec3;
  readonly size: Vec3;
}

function createBoxRecipe(label: string, parts: ReadonlyArray<BoxPart>): PrimitiveRecipe {
  const vertices: Vec3[] = [];
  const faces: ReadonlyArray<number>[] = [];
  for (const part of parts) {
    const base = vertices.length;
    const x0 = part.center.x - part.size.x / 2;
    const x1 = part.center.x + part.size.x / 2;
    const y0 = part.center.y - part.size.y / 2;
    const y1 = part.center.y + part.size.y / 2;
    const z0 = part.center.z - part.size.z / 2;
    const z1 = part.center.z + part.size.z / 2;
    vertices.push(
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    );
    faces.push(
      [base, base + 3, base + 2, base + 1],
      [base + 4, base + 5, base + 6, base + 7],
      [base, base + 1, base + 5, base + 4],
      [base + 1, base + 2, base + 6, base + 5],
      [base + 3, base + 7, base + 6, base + 2],
      [base, base + 4, base + 7, base + 3],
    );
  }
  return Object.freeze({
    label,
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    expected: Object.freeze({
      vertices: parts.length * 8,
      edges: parts.length * 12,
      corners: parts.length * 24,
      faces: parts.length * 6,
    }),
  });
}

export const DUCK_RECIPE = createBoxRecipe("Add duck", [
  { center: { x: 0, y: 0, z: 0 }, size: { x: 1.6, y: 0.8, z: 0.9 } },
  { center: { x: 0.75, y: 0.55, z: 0 }, size: { x: 0.7, y: 0.7, z: 0.7 } },
  { center: { x: 1.35, y: 0.48, z: 0 }, size: { x: 0.5, y: 0.24, z: 0.55 } },
]);

export const FROG_RECIPE = createBoxRecipe("Add frog", [
  { center: { x: 0, y: 0, z: 0 }, size: { x: 1.4, y: 0.55, z: 1.1 } },
  { center: { x: 0.5, y: 0.43, z: -0.34 }, size: { x: 0.3, y: 0.42, z: 0.3 } },
  { center: { x: 0.5, y: 0.43, z: 0.34 }, size: { x: 0.3, y: 0.42, z: 0.3 } },
  { center: { x: 0.48, y: -0.34, z: -0.75 }, size: { x: 0.55, y: 0.22, z: 0.42 } },
  { center: { x: 0.48, y: -0.34, z: 0.75 }, size: { x: 0.55, y: 0.22, z: 0.42 } },
  { center: { x: -0.48, y: -0.34, z: -0.75 }, size: { x: 0.65, y: 0.22, z: 0.42 } },
  { center: { x: -0.48, y: -0.34, z: 0.75 }, size: { x: 0.65, y: 0.22, z: 0.42 } },
]);

export const PIG_RECIPE = createBoxRecipe("Add pig", [
  { center: { x: 0, y: 0, z: 0 }, size: { x: 1.8, y: 0.9, z: 1 } },
  { center: { x: 1.13, y: 0.05, z: 0 }, size: { x: 0.46, y: 0.45, z: 0.56 } },
  { center: { x: 0.62, y: 0.66, z: -0.33 }, size: { x: 0.24, y: 0.38, z: 0.24 } },
  { center: { x: 0.62, y: 0.66, z: 0.33 }, size: { x: 0.24, y: 0.38, z: 0.24 } },
  { center: { x: 0.56, y: -0.65, z: -0.32 }, size: { x: 0.3, y: 0.5, z: 0.3 } },
  { center: { x: 0.56, y: -0.65, z: 0.32 }, size: { x: 0.3, y: 0.5, z: 0.3 } },
  { center: { x: -0.56, y: -0.65, z: -0.32 }, size: { x: 0.3, y: 0.5, z: 0.3 } },
  { center: { x: -0.56, y: -0.65, z: 0.32 }, size: { x: 0.3, y: 0.5, z: 0.3 } },
]);

export const COW_RECIPE = createBoxRecipe("Add cow", [
  { center: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 0.9, z: 1 } },
  { center: { x: 0.95, y: 0.35, z: 0 }, size: { x: 0.72, y: 0.78, z: 0.78 } },
  { center: { x: 1.46, y: 0.18, z: 0 }, size: { x: 0.36, y: 0.4, z: 0.56 } },
  { center: { x: 0.98, y: 0.92, z: -0.38 }, size: { x: 0.18, y: 0.44, z: 0.16 } },
  { center: { x: 0.98, y: 0.92, z: 0.38 }, size: { x: 0.18, y: 0.44, z: 0.16 } },
  { center: { x: 0.62, y: -0.7, z: -0.34 }, size: { x: 0.3, y: 0.6, z: 0.3 } },
  { center: { x: 0.62, y: -0.7, z: 0.34 }, size: { x: 0.3, y: 0.6, z: 0.3 } },
  { center: { x: -0.62, y: -0.7, z: -0.34 }, size: { x: 0.3, y: 0.6, z: 0.3 } },
  { center: { x: -0.62, y: -0.7, z: 0.34 }, size: { x: 0.3, y: 0.6, z: 0.3 } },
]);

export const RABBIT_RECIPE = createBoxRecipe("Add rabbit", [
  { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1.2, z: 0.9 } },
  { center: { x: 0.42, y: 0.86, z: 0 }, size: { x: 0.68, y: 0.68, z: 0.68 } },
  { center: { x: 0.4, y: 1.7, z: -0.22 }, size: { x: 0.24, y: 1, z: 0.2 } },
  { center: { x: 0.4, y: 1.7, z: 0.22 }, size: { x: 0.24, y: 1, z: 0.2 } },
  { center: { x: -0.48, y: -0.66, z: -0.48 }, size: { x: 0.66, y: 0.42, z: 0.48 } },
  { center: { x: -0.48, y: -0.66, z: 0.48 }, size: { x: 0.66, y: 0.42, z: 0.48 } },
]);
