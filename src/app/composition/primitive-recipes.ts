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

interface RecipeComponent {
  readonly vertices: ReadonlyArray<Vec3>;
  readonly faces: ReadonlyArray<ReadonlyArray<number>>;
}

function boxComponent(center: Vec3, size: Vec3): RecipeComponent {
  const x0 = center.x - size.x / 2;
  const x1 = center.x + size.x / 2;
  const y0 = center.y - size.y / 2;
  const y1 = center.y + size.y / 2;
  const z0 = center.z - size.z / 2;
  const z1 = center.z + size.z / 2;
  return {
    vertices: [
      { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 },
    ],
    faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [3, 7, 6, 2], [0, 4, 7, 3]],
  };
}

function orientComponent(component: RecipeComponent): RecipeComponent {
  const center = component.vertices.reduce((sum, vertex) => ({
    x: sum.x + vertex.x / component.vertices.length,
    y: sum.y + vertex.y / component.vertices.length,
    z: sum.z + vertex.z / component.vertices.length,
  }), { x: 0, y: 0, z: 0 });
  return {
    vertices: component.vertices,
    faces: component.faces.map((face) => {
      const a = component.vertices[face[0]!]!;
      const b = component.vertices[face[1]!]!;
      const c = component.vertices[face[2]!]!;
      const faceCenter = face.reduce((sum, index) => {
        const vertex = component.vertices[index]!;
        return { x: sum.x + vertex.x / face.length, y: sum.y + vertex.y / face.length, z: sum.z + vertex.z / face.length };
      }, { x: 0, y: 0, z: 0 });
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const normal = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
      const outward = normal.x * (faceCenter.x - center.x) + normal.y * (faceCenter.y - center.y) + normal.z * (faceCenter.z - center.z);
      return outward > 0 ? face : [...face].reverse();
    }),
  };
}

function pyramidYComponent(center: Vec3, size: Vec3): RecipeComponent {
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  return orientComponent({
    vertices: [
      { x: center.x - halfX, y: center.y - size.y / 2, z: center.z - halfZ },
      { x: center.x + halfX, y: center.y - size.y / 2, z: center.z - halfZ },
      { x: center.x + halfX, y: center.y - size.y / 2, z: center.z + halfZ },
      { x: center.x - halfX, y: center.y - size.y / 2, z: center.z + halfZ },
      { x: center.x, y: center.y + size.y / 2, z: center.z },
    ],
    faces: [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]],
  });
}

function createComponentRecipe(label: string, components: ReadonlyArray<RecipeComponent>): PrimitiveRecipe {
  const vertices: Vec3[] = [];
  const faces: ReadonlyArray<number>[] = [];
  const edges = new Set<string>();
  let corners = 0;
  for (const component of components) {
    const base = vertices.length;
    vertices.push(...component.vertices);
    for (const localFace of component.faces) {
      const face = localFace.map((index) => base + index);
      faces.push(face);
      corners += face.length;
      for (let index = 0; index < face.length; index += 1) {
        const left = face[index]!;
        const right = face[(index + 1) % face.length]!;
        edges.add(left < right ? `${left}:${right}` : `${right}:${left}`);
      }
    }
  }
  return Object.freeze({
    label,
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    expected: Object.freeze({ vertices: vertices.length, edges: edges.size, corners, faces: faces.length }),
  });
}

function wedgeXComponent(center: Vec3, length: number, leftHeight: number, rightHeight: number, leftDepth: number, rightDepth: number): RecipeComponent {
  const x0 = center.x - length / 2;
  const x1 = center.x + length / 2;
  return orientComponent({
    vertices: [
      { x: x0, y: center.y - leftHeight / 2, z: center.z - leftDepth / 2 },
      { x: x1, y: center.y - rightHeight / 2, z: center.z - rightDepth / 2 },
      { x: x1, y: center.y + rightHeight / 2, z: center.z - rightDepth / 2 },
      { x: x0, y: center.y + leftHeight / 2, z: center.z - leftDepth / 2 },
      { x: x0, y: center.y - leftHeight / 2, z: center.z + leftDepth / 2 },
      { x: x1, y: center.y - rightHeight / 2, z: center.z + rightDepth / 2 },
      { x: x1, y: center.y + rightHeight / 2, z: center.z + rightDepth / 2 },
      { x: x0, y: center.y + leftHeight / 2, z: center.z + leftDepth / 2 },
    ],
    faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [3, 7, 6, 2], [0, 4, 7, 3]],
  });
}

function frustumYComponent(center: Vec3, height: number, bottomWidth: number, bottomDepth: number, topWidth: number, topDepth: number): RecipeComponent {
  const y0 = center.y - height / 2;
  const y1 = center.y + height / 2;
  return orientComponent({
    vertices: [
      { x: center.x - bottomWidth / 2, y: y0, z: center.z - bottomDepth / 2 },
      { x: center.x + bottomWidth / 2, y: y0, z: center.z - bottomDepth / 2 },
      { x: center.x + topWidth / 2, y: y1, z: center.z - topDepth / 2 },
      { x: center.x - topWidth / 2, y: y1, z: center.z - topDepth / 2 },
      { x: center.x - bottomWidth / 2, y: y0, z: center.z + bottomDepth / 2 },
      { x: center.x + bottomWidth / 2, y: y0, z: center.z + bottomDepth / 2 },
      { x: center.x + topWidth / 2, y: y1, z: center.z + topDepth / 2 },
      { x: center.x - topWidth / 2, y: y1, z: center.z + topDepth / 2 },
    ],
    faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [3, 7, 6, 2], [0, 4, 7, 3]],
  });
}

export const TURTLE_RECIPE = createComponentRecipe("Add turtle", [
  wedgeXComponent({ x: 0, y: 0.18, z: 0 }, 1.9, 0.65, 0.75, 1.35, 1.15),
  boxComponent({ x: 1.15, y: 0.18, z: 0 }, { x: 0.48, y: 0.46, z: 0.48 }),
  boxComponent({ x: 0.55, y: -0.28, z: -0.72 }, { x: 0.46, y: 0.22, z: 0.38 }),
  boxComponent({ x: 0.55, y: -0.28, z: 0.72 }, { x: 0.46, y: 0.22, z: 0.38 }),
  boxComponent({ x: -0.55, y: -0.28, z: -0.72 }, { x: 0.46, y: 0.22, z: 0.38 }),
  boxComponent({ x: -0.55, y: -0.28, z: 0.72 }, { x: 0.46, y: 0.22, z: 0.38 }),
  wedgeXComponent({ x: -1.18, y: 0.06, z: 0 }, 0.48, 0.28, 0.1, 0.24, 0.08),
]);

export const ELEPHANT_RECIPE = createComponentRecipe("Add elephant", [
  boxComponent({ x: 0, y: 0, z: 0 }, { x: 2.1, y: 1.05, z: 1.15 }),
  boxComponent({ x: 1.05, y: 0.38, z: 0 }, { x: 0.88, y: 0.9, z: 0.86 }),
  boxComponent({ x: 1.46, y: -0.18, z: 0 }, { x: 0.28, y: 0.9, z: 0.3 }),
  boxComponent({ x: 1.48, y: -0.78, z: 0 }, { x: 0.26, y: 0.38, z: 0.28 }),
  boxComponent({ x: 0.9, y: 0.45, z: -0.72 }, { x: 0.3, y: 0.85, z: 0.62 }),
  boxComponent({ x: 0.9, y: 0.45, z: 0.72 }, { x: 0.3, y: 0.85, z: 0.62 }),
  boxComponent({ x: 0.62, y: -0.82, z: -0.36 }, { x: 0.42, y: 0.7, z: 0.42 }),
  boxComponent({ x: 0.62, y: -0.82, z: 0.36 }, { x: 0.42, y: 0.7, z: 0.42 }),
  boxComponent({ x: -0.62, y: -0.82, z: -0.36 }, { x: 0.42, y: 0.7, z: 0.42 }),
  boxComponent({ x: -0.62, y: -0.82, z: 0.36 }, { x: 0.42, y: 0.7, z: 0.42 }),
]);

export const CUP_RECIPE = createComponentRecipe("Add cup", [
  frustumYComponent({ x: 0, y: 0, z: 0 }, 1.2, 0.78, 0.72, 1.08, 1.02),
  boxComponent({ x: 0, y: 0.72, z: 0 }, { x: 1.02, y: 0.16, z: 1.14 }),
  boxComponent({ x: 0.72, y: 0.28, z: 0 }, { x: 0.18, y: 0.72, z: 0.2 }),
  boxComponent({ x: 0.58, y: 0.62, z: 0 }, { x: 0.42, y: 0.18, z: 0.18 }),
  boxComponent({ x: 0.58, y: -0.08, z: 0 }, { x: 0.42, y: 0.18, z: 0.18 }),
]);

export const CHAIR_RECIPE = createComponentRecipe("Add chair", [
  boxComponent({ x: 0, y: 0.15, z: 0 }, { x: 1.2, y: 0.18, z: 1.1 }),
  boxComponent({ x: -0.48, y: 1.0, z: 0 }, { x: 0.18, y: 1.5, z: 1.1 }),
  boxComponent({ x: 0.45, y: -0.65, z: -0.4 }, { x: 0.2, y: 1.4, z: 0.2 }),
  boxComponent({ x: 0.45, y: -0.65, z: 0.4 }, { x: 0.2, y: 1.4, z: 0.2 }),
  boxComponent({ x: -0.45, y: -0.65, z: -0.4 }, { x: 0.2, y: 1.4, z: 0.2 }),
  boxComponent({ x: -0.45, y: -0.65, z: 0.4 }, { x: 0.2, y: 1.4, z: 0.2 }),
]);

export const FLOWERPOT_RECIPE = createComponentRecipe("Add flowerpot", [
  frustumYComponent({ x: 0, y: 0, z: 0 }, 1.25, 0.72, 0.7, 1.15, 1.12),
  boxComponent({ x: 0, y: 0.66, z: 0 }, { x: 1.32, y: 0.18, z: 1.38 }),
]);

export const KETTLE_RECIPE = createComponentRecipe("Add kettle", [
  wedgeXComponent({ x: 0, y: 0, z: 0 }, 1.45, 1.2, 1.4, 1.15, 1.28),
  boxComponent({ x: -0.55, y: 0.92, z: 0 }, { x: 0.2, y: 0.7, z: 0.2 }),
  boxComponent({ x: 0, y: 1.22, z: 0 }, { x: 1.15, y: 0.18, z: 0.18 }),
  boxComponent({ x: 0.55, y: 0.92, z: 0 }, { x: 0.2, y: 0.7, z: 0.2 }),
  wedgeXComponent({ x: 1.0, y: 0.25, z: 0 }, 0.75, 0.5, 0.32, 0.45, 0.28),
  wedgeXComponent({ x: 1.48, y: 0.45, z: 0 }, 0.42, 0.32, 0.18, 0.28, 0.16),
]);

export const SNEAKER_RECIPE = createComponentRecipe("Add sneaker", [
  wedgeXComponent({ x: 0, y: -0.38, z: 0 }, 2.5, 0.22, 0.18, 0.82, 0.64),
  wedgeXComponent({ x: 0.15, y: 0.05, z: 0 }, 2.0, 0.85, 0.42, 0.72, 0.55),
  wedgeXComponent({ x: -0.8, y: 0.38, z: 0 }, 0.62, 0.72, 0.48, 0.68, 0.54),
  wedgeXComponent({ x: 1.15, y: -0.05, z: 0 }, 0.52, 0.38, 0.2, 0.56, 0.42),
]);

export const BACKPACK_RECIPE=createComponentRecipe("Add backpack",[
boxComponent({x:0,y:0.2,z:0},{x:1.2,y:2.1,z:1.4}),
boxComponent({x:0.72,y:-0.15,z:0},{x:0.34,y:0.82,z:0.88}),
boxComponent({x:-0.62,y:0.45,z:-0.48},{x:0.18,y:1.25,z:0.18}),
boxComponent({x:-0.62,y:0.45,z:0.48},{x:0.18,y:1.25,z:0.18}),
boxComponent({x:-0.48,y:-0.32,z:-0.48},{x:0.46,y:0.18,z:0.18}),
boxComponent({x:-0.48,y:-0.32,z:0.48},{x:0.46,y:0.18,z:0.18}),
]);

function cylinderComponent(center: Vec3, radius: number, length: number, axis: "x" | "y" | "z", segments = 8): RecipeComponent {
  const vertices: Vec3[]=[];
  for(let side=0;side<2;side+=1){for(let index=0;index<segments;index+=1){const angle=2*Math.PI*index/segments;const radialA=Math.cos(angle)*radius;const radialB=Math.sin(angle)*radius;const axial=(side===0?-1:1)*length/2;vertices.push(axis==="x"?{x:center.x+axial,y:center.y+radialA,z:center.z+radialB}:axis==="y"?{x:center.x+radialA,y:center.y+axial,z:center.z+radialB}:{x:center.x+radialA,y:center.y+radialB,z:center.z+axial});}}
  const faces: number[][]=[Array.from({length:segments},(_,i)=>segments-1-i),Array.from({length:segments},(_,i)=>segments+i)];
  for(let i=0;i<segments;i+=1){const next=(i+1)%segments;faces.push([i,next,segments+next,segments+i]);}
  return orientComponent({vertices,faces});
}

export const HELMET_RECIPE=createComponentRecipe("Add helmet",[
cylinderComponent({x:0,y:0.25,z:0},0.86,1.05,"y"),
boxComponent({x:0.72,y:0.18,z:0},{x:0.28,y:0.58,z:1.15}),
boxComponent({x:0.18,y:-0.36,z:-0.72},{x:1.05,y:0.18,z:0.18}),
boxComponent({x:0.18,y:-0.36,z:0.72},{x:1.05,y:0.18,z:0.18}),
]);

export const GAMEPAD_RECIPE=createComponentRecipe("Add gamepad",[
wedgeXComponent({x:-0.55,y:0,z:0},1.25,0.52,0.72,1.1,0.88),
wedgeXComponent({x:0.55,y:0,z:0},1.25,0.72,0.52,0.88,1.1),
boxComponent({x:0.35,y:0.52,z:-0.28},{x:0.18,y:0.16,z:0.18}),
boxComponent({x:0.58,y:0.52,z:-0.1},{x:0.18,y:0.16,z:0.18}),
boxComponent({x:0.35,y:0.52,z:0.08},{x:0.18,y:0.16,z:0.18}),
boxComponent({x:-0.55,y:0.5,z:0},{x:0.42,y:0.14,z:0.14}),
cylinderComponent({x:-0.15,y:0.52,z:-0.28},0.16,0.18,"y"),
cylinderComponent({x:0.05,y:0.52,z:0.3},0.16,0.18,"y"),
]);

export const CAMERA_RECIPE=createComponentRecipe("Add camera",[
boxComponent({x:0,y:0,z:0},{x:1.8,y:1.15,z:1.2}),
cylinderComponent({x:1.12,y:0,z:0},0.46,0.62,"x"),
boxComponent({x:-0.45,y:0.72,z:-0.28},{x:0.28,y:0.2,z:0.28}),
]);

export const BICYCLE_SADDLE_RECIPE=createComponentRecipe("Add bicycle saddle",[
wedgeXComponent({x:0,y:0.15,z:0},2.15,0.42,0.22,1.5,0.72),
wedgeXComponent({x:-0.58,y:-0.18,z:0},0.85,0.24,0.18,1.32,0.64),
wedgeXComponent({x:0.72,y:0.05,z:0},0.62,0.3,0.16,0.78,0.42),
]);

export const CAR_RECIPE=createComponentRecipe("Add car",[
wedgeXComponent({x:0,y:0,z:0},3.1,0.72,0.62,1.35,1.15),
wedgeXComponent({x:-0.15,y:0.68,z:0},1.55,0.62,0.46,1.05,0.88),
cylinderComponent({x:0.85,y:-0.52,z:-0.68},0.34,0.24,"z"),
cylinderComponent({x:0.85,y:-0.52,z:0.68},0.34,0.24,"z"),
cylinderComponent({x:-0.85,y:-0.52,z:-0.68},0.34,0.24,"z"),
cylinderComponent({x:-0.85,y:-0.52,z:0.68},0.34,0.24,"z"),
]);

export const ROCKET_RECIPE=createComponentRecipe("Add rocket",[
cylinderComponent({x:0,y:0,z:0},0.52,2.35,"y"),
pyramidYComponent({x:0,y:1.48,z:0},{x:1.02,y:0.72,z:1.02}),
wedgeXComponent({x:0.62,y:-0.85,z:0},0.75,0.65,0.28,0.18,0.12),
wedgeXComponent({x:-0.62,y:-0.85,z:0},0.75,0.28,0.65,0.12,0.18),
boxComponent({x:0,y:-0.85,z:-0.68},{x:0.16,y:0.68,z:0.52}),
boxComponent({x:0,y:-0.85,z:0.68},{x:0.16,y:0.68,z:0.52}),
]);

export const TREASURE_CHEST_RECIPE=createComponentRecipe("Add treasure chest",[
boxComponent({x:0,y:-0.2,z:0},{x:1.9,y:0.95,z:1.15}),
wedgeXComponent({x:0,y:0.62,z:0},1.9,0.65,0.65,1.15,0.82),
boxComponent({x:-1.0,y:0.38,z:0},{x:0.16,y:0.22,z:0.62}),
]);

export const FISH_RECIPE = createComponentRecipe("Add fish", [
  wedgeXComponent({ x: 0, y: 0, z: 0 }, 2.2, 0.72, 0.94, 0.78, 1.08),
  wedgeXComponent({ x: -1.32, y: 0, z: 0 }, 0.65, 1.15, 0.28, 0.18, 0.12),
  wedgeXComponent({ x: -0.12, y: 0.72, z: 0 }, 0.72, 0.55, 0.18, 0.14, 0.1),
  wedgeXComponent({ x: 0.15, y: -0.05, z: -0.68 }, 0.75, 0.42, 0.2, 0.34, 0.16),
  wedgeXComponent({ x: 0.15, y: -0.05, z: 0.68 }, 0.75, 0.42, 0.2, 0.34, 0.16),
]);

export const DOG_RECIPE = createComponentRecipe("Add dog", [
  boxComponent({ x: 0, y: 0, z: 0 }, { x: 1.8, y: 0.82, z: 0.86 }),
  boxComponent({ x: 0.82, y: 0.48, z: 0 }, { x: 0.72, y: 0.72, z: 0.7 }),
  boxComponent({ x: 1.3, y: 0.32, z: 0 }, { x: 0.42, y: 0.34, z: 0.48 }),
  boxComponent({ x: 0.75, y: 0.38, z: -0.48 }, { x: 0.26, y: 0.62, z: 0.24 }),
  boxComponent({ x: 0.75, y: 0.38, z: 0.48 }, { x: 0.26, y: 0.62, z: 0.24 }),
  boxComponent({ x: 0.58, y: -0.64, z: -0.29 }, { x: 0.28, y: 0.54, z: 0.26 }),
  boxComponent({ x: 0.58, y: -0.64, z: 0.29 }, { x: 0.28, y: 0.54, z: 0.26 }),
  boxComponent({ x: -0.58, y: -0.64, z: -0.29 }, { x: 0.28, y: 0.54, z: 0.26 }),
  boxComponent({ x: -0.58, y: -0.64, z: 0.29 }, { x: 0.28, y: 0.54, z: 0.26 }),
  boxComponent({ x: -1.18, y: 0.38, z: 0.04 }, { x: 0.72, y: 0.2, z: 0.2 }),
]);

export const CAT_RECIPE = createComponentRecipe("Add cat", [
  boxComponent({ x: 0, y: 0, z: 0 }, { x: 1.7, y: 0.78, z: 0.82 }),
  boxComponent({ x: 0.78, y: 0.52, z: 0 }, { x: 0.7, y: 0.7, z: 0.68 }),
  pyramidYComponent({ x: 0.78, y: 1.02, z: -0.22 }, { x: 0.28, y: 0.5, z: 0.24 }),
  pyramidYComponent({ x: 0.78, y: 1.02, z: 0.22 }, { x: 0.28, y: 0.5, z: 0.24 }),
  boxComponent({ x: 0.55, y: -0.62, z: -0.28 }, { x: 0.24, y: 0.52, z: 0.24 }),
  boxComponent({ x: 0.55, y: -0.62, z: 0.28 }, { x: 0.24, y: 0.52, z: 0.24 }),
  boxComponent({ x: -0.55, y: -0.62, z: -0.28 }, { x: 0.24, y: 0.52, z: 0.24 }),
  boxComponent({ x: -0.55, y: -0.62, z: 0.28 }, { x: 0.24, y: 0.52, z: 0.24 }),
  boxComponent({ x: -1.15, y: 0.2, z: 0.08 }, { x: 0.72, y: 0.18, z: 0.18 }),
  boxComponent({ x: -1.65, y: 0.55, z: 0.08 }, { x: 0.18, y: 0.82, z: 0.18 }),
]);
