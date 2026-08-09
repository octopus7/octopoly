import type {
  AttributeKey,
  AttributeValue,
  RenderSceneSnapshot,
  TriangleMeshSnapshot,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { ReferenceRenderPass } from "../../../src/renderer/reference";
import { FakeWebGL2 } from "./fake-webgl2";

const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function triangle(version = 0, normals = true): TriangleMeshSnapshot {
  const base = {
    version,
    positions: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    indices: [0, 1, 2],
  } as const;

  return normals
    ? { ...base, normals: [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }] }
    : base;
}

function scene(reference?: TriangleMeshSnapshot): RenderSceneSnapshot {
  return {
    camera: {
      view: { elements: IDENTITY_MATRIX },
      projection: { elements: IDENTITY_MATRIX },
      viewProjection: { elements: IDENTITY_MATRIX },
      position: { x: 0, y: 0, z: 4 },
    },
    viewport: { cssWidth: 640, cssHeight: 480, devicePixelRatio: 2 },
    ...(reference === undefined ? {} : { reference }),
    retopo: {
      version: 0,
      vertices: [],
      edges: [],
      corners: [],
      faces: [],
      attributes: {
        has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
          return false;
        },
        get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
          return undefined;
        },
      },
    },
    selection: { version: 0, vertices: new Set(), edges: new Set(), faces: new Set() },
  };
}

describe("ReferenceRenderPass", () => {
  it("uploads positions, indices, and optional normals and draws the fixed Core solid policy", () => {
    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();

    pass.initialize(fake.context);
    pass.render(fake.context, scene(triangle()), 2);

    expect(fake.uploads).toHaveLength(3);
    expect(fake.uploads.map((upload) => upload.target)).toEqual([
      fake.ARRAY_BUFFER,
      fake.ARRAY_BUFFER,
      fake.ELEMENT_ARRAY_BUFFER,
    ]);
    expect(Array.from(fake.uploads[0]!.data)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(fake.uploads[1]!.data)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(Array.from(fake.uploads[2]!.data)).toEqual([0, 1, 2]);
    expect(fake.draws).toEqual([[fake.TRIANGLES, 3, fake.UNSIGNED_INT, 0]]);
    expect(fake.enabled).toContain(fake.DEPTH_TEST);
    expect(fake.depthFunctions).toEqual([fake.LEQUAL]);
    expect(fake.depthMasks).toEqual([true]);
    expect(fake.disabled).toEqual(expect.arrayContaining([fake.BLEND, fake.CULL_FACE]));
    expect(fake.uniform4fValues).toEqual([[0.58, 0.64, 0.72, 1]]);
    expect(fake.uniform1iValues).toEqual([1]);
    expect(fake.shaderSources.join("\n")).not.toMatch(/pbr|matcap|wgsl/i);
  });

  it("uses the shader's face-normal fallback when normals are absent", () => {
    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();

    pass.initialize(fake.context);
    pass.render(fake.context, scene(triangle(0, false)), 1);

    expect(fake.uploads).toHaveLength(2);
    expect(fake.vertexAttrib3fCalls).toEqual([[1, 0, 1, 0]]);
    expect(fake.uniform1iValues).toEqual([0]);
    expect(fake.draws).toHaveLength(1);
  });

  it("reuses a stable version and replaces GPU buffers only when the version changes", () => {
    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();
    pass.initialize(fake.context);

    pass.render(fake.context, scene(triangle(4)), 1);
    const uploadsAfterFirstFrame = fake.uploads.length;
    pass.render(fake.context, scene(triangle(4)), 1);

    expect(fake.uploads).toHaveLength(uploadsAfterFirstFrame);
    expect(fake.deletedBuffers).toHaveLength(0);

    pass.render(fake.context, scene(triangle(5)), 1);
    expect(fake.uploads).toHaveLength(uploadsAfterFirstFrame * 2);
    expect(fake.deletedBuffers).toHaveLength(3);
    expect(fake.deletedVertexArrays).toHaveLength(1);
  });

  it("recreates programs and buffers from the CPU snapshot after context invalidation", () => {
    const first = new FakeWebGL2();
    const restored = new FakeWebGL2();
    const pass = new ReferenceRenderPass();
    const frame = scene(triangle(9));

    pass.initialize(first.context);
    pass.render(first.context, frame, 1);
    pass.invalidate();
    expect(() => pass.render(first.context, frame, 1)).toThrow(/not initialized/i);

    pass.initialize(restored.context);
    expect(restored.uploads).toHaveLength(3);
    pass.render(restored.context, frame, 1);
    expect(restored.uploads).toHaveLength(3);
    expect(restored.draws).toHaveLength(1);
    expect(first.deletedBuffers).toHaveLength(0);
  });

  it("removes a stale reference when the frame omits it", () => {
    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();
    pass.initialize(fake.context);
    pass.render(fake.context, scene(triangle()), 1);

    pass.render(fake.context, scene(), 1);
    pass.render(fake.context, scene(), 1);

    expect(fake.deletedBuffers).toHaveLength(3);
    expect(fake.deletedVertexArrays).toHaveLength(1);
    expect(fake.draws).toHaveLength(1);
  });

  it("rejects malformed updates before replacing the last valid GPU mesh", () => {
    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();
    const valid = scene(triangle(2));
    pass.initialize(fake.context);
    pass.render(fake.context, valid, 1);

    const malformed: TriangleMeshSnapshot = {
      version: 3,
      positions: triangle().positions,
      normals: [{ x: 0, y: 0, z: 1 }],
      indices: [0, 1, 7],
    };
    expect(() => pass.render(fake.context, scene(malformed), 1)).toThrow(RangeError);
    expect(fake.deletedBuffers).toHaveLength(0);

    pass.render(fake.context, valid, 1);
    expect(fake.draws).toHaveLength(2);
    expect(fake.uploads).toHaveLength(3);
  });

  it("filters degenerate triangles instead of issuing an invalid draw", () => {
    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();
    const degenerate: TriangleMeshSnapshot = {
      version: 1,
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      indices: [0, 1, 2],
    };

    pass.initialize(fake.context);
    pass.render(fake.context, scene(degenerate), 1);

    expect(Array.from(fake.uploads.at(-1)!.data)).toEqual([]);
    expect(fake.draws).toHaveLength(0);
  });

  it("cleans up failed allocations and disposes valid resources exactly once", () => {
    const failed = new FakeWebGL2();
    failed.failBufferAllocationAt = 2;
    const failedPass = new ReferenceRenderPass();
    failedPass.initialize(failed.context);
    expect(() => failedPass.render(failed.context, scene(triangle()), 1)).toThrow(/allocate/i);
    expect(failed.deletedBuffers).toHaveLength(2);
    expect(failed.deletedVertexArrays).toHaveLength(1);

    const fake = new FakeWebGL2();
    const pass = new ReferenceRenderPass();
    pass.initialize(fake.context);
    pass.render(fake.context, scene(triangle()), 1);
    pass.dispose();
    pass.dispose();

    expect(fake.deletedBuffers).toHaveLength(3);
    expect(fake.deletedVertexArrays).toHaveLength(1);
    expect(fake.deletedPrograms).toHaveLength(1);
    expect(() => pass.render(fake.context, scene(triangle()), 1)).toThrow(/disposed/i);
  });
});
