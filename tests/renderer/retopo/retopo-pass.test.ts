import { describe, expect, it, vi } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangulationService,
  RenderSceneSnapshot,
  SelectionSnapshot,
} from "@octopoly/contracts";
import {
  createRetopoRenderPasses,
  RetopoRenderPass,
} from "../../../src/renderer/retopo/retopo-pass";
import { FakeWebGL2 } from "./fake-webgl2";

const attributes: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
};

function mesh(version = 4): MeshSnapshot {
  return {
    version,
    vertices: [
      { id: 10, position: { x: 0, y: 0, z: 0 } },
      { id: 11, position: { x: 2, y: 0, z: 0 } },
      { id: 12, position: { x: 0, y: 3, z: 0 } },
    ],
    edges: [
      { id: 20, vertices: [10, 11] },
      { id: 21, vertices: [11, 12] },
      { id: 22, vertices: [12, 10] },
    ],
    corners: [
      { id: 30, face: 40, vertex: 10, edge: 20 },
      { id: 31, face: 40, vertex: 11, edge: 21 },
      { id: 32, face: 40, vertex: 12, edge: 22 },
    ],
    faces: [{ id: 40, corners: [30, 31, 32] }],
    attributes,
  };
}

function selection(version = 7): SelectionSnapshot {
  return {
    version,
    vertices: new Set([12]),
    edges: new Set([21]),
    faces: new Set([40]),
  };
}

function triangle(meshVersion: number): MeshTriangle {
  return {
    face: 40,
    corners: [32, 30, 31],
    vertices: [12, 10, 11],
    positions: [
      { x: 0, y: 3, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  } satisfies MeshTriangle;
}

function scene(
  retopo: MeshSnapshot = mesh(),
  selected: SelectionSnapshot = selection(),
): RenderSceneSnapshot {
  const identity = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  return {
    camera: {
      view: identity,
      projection: identity,
      viewProjection: identity,
      position: { x: 0, y: 0, z: 5 },
    },
    viewport: { cssWidth: 100, cssHeight: 80, devicePixelRatio: 2 },
    retopo,
    selection: selected,
  };
}

function triangulationFixture(): MeshTriangulationService & {
  triangles: ReturnType<typeof vi.fn>;
} {
  return {
    triangles: vi.fn((snapshot: MeshSnapshot) => [triangle(snapshot.version)]),
    raycast: vi.fn(() => null),
  };
}

describe("RetopoRenderPass", () => {
  it("splits provider-skippable solid and always-on overlay phases over one GPU cache", () => {
    const triangulation = triangulationFixture();
    const fake = new FakeWebGL2();
    const passes = createRetopoRenderPasses(triangulation);

    expect(passes.solid.phase).toBe("fallback");
    expect(passes.overlay.phase).toBe("overlay");
    passes.solid.initialize(fake.asContext());
    passes.overlay.initialize(fake.asContext());
    expect(fake.createdPrograms).toHaveLength(1);
    expect(fake.createdBuffers).toHaveLength(6);

    passes.solid.render(fake.asContext(), scene(), 2);
    passes.overlay.render(fake.asContext(), scene(), 2);
    expect(triangulation.triangles).toHaveBeenCalledTimes(1);
    expect(fake.uploads).toHaveLength(6);
    expect(fake.draws.map(({ mode }) => mode)).toEqual([
      fake.TRIANGLES,
      fake.LINES,
      fake.POINTS,
      fake.TRIANGLES,
      fake.LINES,
      fake.POINTS,
    ]);
  });

  it("keeps topology overlays active when a provider skips the solid fallback", () => {
    const triangulation = triangulationFixture();
    const fake = new FakeWebGL2();
    const passes = createRetopoRenderPasses(triangulation);
    passes.solid.initialize(fake.asContext());
    passes.overlay.initialize(fake.asContext());

    passes.overlay.render(fake.asContext(), scene(), 2);
    expect(fake.uploads).toHaveLength(5);
    expect(fake.draws.map(({ mode }) => mode)).toEqual([
      fake.LINES,
      fake.POINTS,
      fake.TRIANGLES,
      fake.LINES,
      fake.POINTS,
    ]);

    passes.solid.render(fake.asContext(), scene(), 2);
    expect(fake.uploads).toHaveLength(6);
    expect(fake.draws.at(-1)?.mode).toBe(fake.TRIANGLES);
    expect(triangulation.triangles).toHaveBeenCalledTimes(1);
  });

  it("keeps shared resources until both phased pass owners are disposed", () => {
    const fake = new FakeWebGL2();
    const passes = createRetopoRenderPasses(triangulationFixture());
    passes.solid.initialize(fake.asContext());
    passes.overlay.initialize(fake.asContext());
    passes.overlay.render(fake.asContext(), scene(), 1);

    passes.solid.dispose();
    expect(fake.deletedBuffers).toHaveLength(0);
    passes.overlay.render(fake.asContext(), scene(), 1);

    passes.overlay.dispose();
    passes.overlay.dispose();
    expect(fake.deletedBuffers).toHaveLength(6);
    expect(fake.deletedPrograms).toHaveLength(1);
  });

  it("invalidates and restores one shared resource set for both phases", () => {
    const triangulation = triangulationFixture();
    const first = new FakeWebGL2();
    const passes = createRetopoRenderPasses(triangulation);
    passes.solid.initialize(first.asContext());
    passes.overlay.initialize(first.asContext());
    passes.solid.render(first.asContext(), scene(), 1);
    passes.overlay.render(first.asContext(), scene(), 1);

    passes.solid.invalidate();
    passes.overlay.invalidate();
    const restored = new FakeWebGL2();
    passes.solid.initialize(restored.asContext());
    passes.overlay.initialize(restored.asContext());
    expect(restored.createdPrograms).toHaveLength(1);
    expect(restored.createdBuffers).toHaveLength(6);
    expect(restored.uploads).toHaveLength(6);

    passes.solid.render(restored.asContext(), scene(), 1);
    passes.overlay.render(restored.asContext(), scene(), 1);
    expect(restored.uploads).toHaveLength(6);
    expect(triangulation.triangles).toHaveBeenCalledTimes(1);

    passes.solid.dispose();
    passes.overlay.dispose();
    expect(restored.deletedBuffers).toHaveLength(6);
    expect(restored.deletedPrograms).toHaveLength(1);
  });

  it("expands faces only through canonical triangulation and draws solid/editing paths", () => {
    const triangulation = triangulationFixture();
    const fake = new FakeWebGL2();
    const pass = new RetopoRenderPass(triangulation);
    pass.initialize(fake.asContext());

    pass.render(fake.asContext(), scene(), 2);

    expect(triangulation.triangles).toHaveBeenCalledTimes(1);
    expect(fake.uploads).toHaveLength(6);
    expect([...fake.uploads[0]!.data]).toEqual([0, 3, 0, 0, 0, 0, 2, 0, 0]);
    expect(fake.draws.map(({ mode, count }) => [mode, count])).toEqual([
      [fake.TRIANGLES, 3],
      [fake.LINES, 6],
      [fake.POINTS, 3],
      [fake.TRIANGLES, 3],
      [fake.LINES, 2],
      [fake.POINTS, 1],
    ]);
    expect(fake.draws.slice(0, 3).every((draw) => draw.depthEnabled)).toBe(true);
    expect(fake.draws.slice(3).every((draw) => !draw.depthEnabled)).toBe(true);
    expect(fake.draws[3]!.blendEnabled).toBe(true);
    expect(fake.pointSizes).toContain(10);
    expect(fake.pointSizes).toContain(16);
  });

  it("uploads mesh and selection data only when their immutable versions change", () => {
    const triangulation = triangulationFixture();
    const fake = new FakeWebGL2();
    const pass = new RetopoRenderPass(triangulation);
    pass.initialize(fake.asContext());

    pass.render(fake.asContext(), scene(), 1);
    const initialUploads = fake.uploads.length;
    pass.render(fake.asContext(), scene(), 1);
    expect(fake.uploads).toHaveLength(initialUploads);
    expect(triangulation.triangles).toHaveBeenCalledTimes(1);

    pass.render(fake.asContext(), scene(mesh(), selection(8)), 1);
    expect(fake.uploads).toHaveLength(initialUploads + 3);
    expect(triangulation.triangles).toHaveBeenCalledTimes(1);

    pass.render(fake.asContext(), scene(mesh(5), selection(8)), 1);
    expect(fake.uploads).toHaveLength(initialUploads + 9);
    expect(triangulation.triangles).toHaveBeenCalledTimes(2);
  });

  it("retains CPU descriptors across context invalidation and disposes restored resources once", () => {
    const triangulation = triangulationFixture();
    const first = new FakeWebGL2();
    const pass = new RetopoRenderPass(triangulation);
    pass.initialize(first.asContext());
    pass.render(first.asContext(), scene(), 1);

    pass.invalidate();
    expect(() => pass.render(first.asContext(), scene(), 1)).toThrow(/initialized/);

    const restored = new FakeWebGL2();
    pass.initialize(restored.asContext());
    pass.render(restored.asContext(), scene(), 1);
    expect(restored.uploads).toHaveLength(6);
    expect(triangulation.triangles).toHaveBeenCalledTimes(1);

    pass.dispose();
    pass.dispose();
    expect(restored.deletedBuffers).toHaveLength(6);
    expect(restored.deletedPrograms).toHaveLength(1);
    expect(() => pass.initialize(restored.asContext())).toThrow(/disposed/);
  });

  it("rejects invalid lifecycle and DPR before drawing", () => {
    const pass = new RetopoRenderPass(triangulationFixture());
    const fake = new FakeWebGL2();
    expect(() => pass.render(fake.asContext(), scene(), 1)).toThrow(/initialized/);
    pass.initialize(fake.asContext());
    expect(() => pass.render(fake.asContext(), scene(), 0)).toThrow(/devicePixelRatio/);
    expect(fake.draws).toHaveLength(0);
  });
});
