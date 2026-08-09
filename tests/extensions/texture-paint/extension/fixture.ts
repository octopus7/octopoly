import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  CameraSnapshot,
  ImageAssetRef,
  MeshQuery,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangleHit,
  MeshTriangulationService,
  PickHit,
  PickingService,
  PointerSample,
  Ray,
  ToolContext,
  Vec2,
  ViewportSnapshot,
} from "@octopoly/contracts";

import { UV0_ATTRIBUTE_KEY } from "../../../../src/extensions/texture-paint/target";
import type { TextureImagePixelDecoder } from "../../../../src/extensions/texture-paint/image";
import {
  CONTRACT_TEST_CAMERA,
  CONTRACT_TEST_VIEWPORT,
} from "../../../../src/optional-sdk/testkit";
import { PaintHistoryFake } from "../session/history-fake";

export const PAINT_IMAGE: ImageAssetRef = Object.freeze({
  id: "paint-target",
  revision: 0,
  width: 32,
  height: 32,
  colorSpace: "srgb",
});

export const TRANSPARENT_PIXEL_DECODER: TextureImagePixelDecoder = Object.freeze({
  decode: async (_bitmap: ImageBitmap, ref: ImageAssetRef) => (
    new Uint8ClampedArray(ref.width * ref.height * 4)
  ),
});

const UVS = new Map<number, Vec2>([
  [21, Object.freeze({ x: 0, y: 0 })],
  [22, Object.freeze({ x: 1, y: 0 })],
  [23, Object.freeze({ x: 0, y: 1 })],
]);

class FixtureAttributes implements AttributeSnapshot {
  readonly #hasUv: boolean;
  constructor(hasUv: boolean) { this.#hasUv = hasUv; }
  has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return this.#hasUv && key.domain === "corner" && key.name === UV0_ATTRIBUTE_KEY.name;
  }
  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    return this.has(key) ? UVS.get(elementId) as T | undefined : undefined;
  }
}

export function meshSnapshot(hasUv = true): MeshSnapshot {
  return Object.freeze({
    version: 4,
    vertices: Object.freeze([
      Object.freeze({ id: 1, position: Object.freeze({ x: 0, y: 0, z: 0 }) }),
      Object.freeze({ id: 2, position: Object.freeze({ x: 1, y: 0, z: 0 }) }),
      Object.freeze({ id: 3, position: Object.freeze({ x: 0, y: 1, z: 0 }) }),
    ]),
    edges: Object.freeze([
      Object.freeze({ id: 11, vertices: Object.freeze([1, 2] as const) }),
      Object.freeze({ id: 12, vertices: Object.freeze([2, 3] as const) }),
      Object.freeze({ id: 13, vertices: Object.freeze([3, 1] as const) }),
    ]),
    corners: Object.freeze([
      Object.freeze({ id: 21, face: 31, vertex: 1, edge: 11 }),
      Object.freeze({ id: 22, face: 31, vertex: 2, edge: 12 }),
      Object.freeze({ id: 23, face: 31, vertex: 3, edge: 13 }),
    ]),
    faces: Object.freeze([Object.freeze({ id: 31, corners: Object.freeze([21, 22, 23]) })]),
    attributes: new FixtureAttributes(hasUv),
  });
}

export class PaintMeshQuery implements MeshQuery {
  readonly #snapshot: MeshSnapshot;
  constructor(hasUv = true) { this.#snapshot = meshSnapshot(hasUv); }
  snapshot(): MeshSnapshot { return this.#snapshot; }
  vertex(id: number) { return this.#snapshot.vertices.find((item) => item.id === id) ?? null; }
  edge(id: number) { return this.#snapshot.edges.find((item) => item.id === id) ?? null; }
  corner(id: number) { return this.#snapshot.corners.find((item) => item.id === id) ?? null; }
  face(id: number) { return this.#snapshot.faces.find((item) => item.id === id) ?? null; }
  incidentEdges(): ReadonlyArray<number> { return Object.freeze([]); }
  incidentFaces(): ReadonlyArray<number> { return Object.freeze([]); }
  adjacentFaces(): ReadonlyArray<number> { return Object.freeze([]); }
  findEdge(): number | null { return null; }
}

const TRIANGLE: MeshTriangle = Object.freeze({
  face: 31,
  corners: Object.freeze([21, 22, 23] as const),
  vertices: Object.freeze([1, 2, 3] as const),
  positions: Object.freeze([
    Object.freeze({ x: 0, y: 0, z: 0 }),
    Object.freeze({ x: 1, y: 0, z: 0 }),
    Object.freeze({ x: 0, y: 1, z: 0 }),
  ] as const),
});

export class PaintTriangulation implements MeshTriangulationService {
  #raycasts = 0;
  triangles(): ReadonlyArray<MeshTriangle> { return Object.freeze([TRIANGLE]); }
  raycast(_ray: Ray, mesh: MeshSnapshot): MeshTriangleHit {
    const step = this.#raycasts % 3;
    this.#raycasts += 1;
    const barycentric = step === 0
      ? Object.freeze({ x: 0.5, y: 0.25, z: 0.25 })
      : step === 1
        ? Object.freeze({ x: 0.25, y: 0.5, z: 0.25 })
        : Object.freeze({ x: 0.25, y: 0.25, z: 0.5 });
    return Object.freeze({
      ...TRIANGLE,
      meshVersion: mesh.version,
      position: Object.freeze({ x: 0.25, y: 0.25, z: 0 }),
      normal: Object.freeze({ x: 0, y: 0, z: 1 }),
      barycentric,
      distance: 1,
    });
  }
}

export class PaintPicking implements PickingService {
  rayFromScreen(point: Vec2): Ray {
    return Object.freeze({
      origin: Object.freeze({ x: point.x, y: point.y, z: 1 }),
      direction: Object.freeze({ x: 0, y: 0, z: -1 }),
    });
  }
  pick(): PickHit | null { return null; }
}

export function pointer(phase: PointerSample["phase"], timestamp: number): PointerSample {
  return Object.freeze({
    pointerId: 9,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: 10,
    y: 10,
    pressure: 0.75,
    tiltX: 0,
    tiltY: 0,
    buttons: phase === "up" || phase === "cancel" ? 0 : 1,
    modifiers: Object.freeze({ alt: false, ctrl: false, meta: false, shift: false }),
    timestamp,
    coalesced: false,
  });
}

export function toolContext(mesh: MeshQuery, history: PaintHistoryFake): ToolContext {
  return {
    mesh,
    mutations: {
      execute: () => { throw new Error("not used"); },
      validate: () => Object.freeze([]),
    },
    selection: {
      snapshot: () => Object.freeze({
        version: 0,
        vertices: new Set<number>(),
        edges: new Set<number>(),
        faces: new Set<number>(),
      }),
      update: () => {},
      clear: () => {},
      prune: () => {},
      subscribe: () => () => {},
    },
    history,
    surface: { raycast: () => null, nearest: () => null },
    getCamera: (): CameraSnapshot => CONTRACT_TEST_CAMERA,
    getViewport: (): ViewportSnapshot => CONTRACT_TEST_VIEWPORT,
    setPreview: () => {},
    requestRender: () => {},
  };
}
