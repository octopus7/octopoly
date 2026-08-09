import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  RenderSceneSnapshot,
  ToolPreview,
} from "@octopoly/contracts";
import { PreviewRenderPass } from "../../../src/renderer/preview/preview-pass";
import { FakeWebGL2 } from "../retopo/fake-webgl2";

const attributes: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
};

function preview(revision = 1): ToolPreview {
  return {
    id: "stroke",
    revision,
    primitives: [
      {
        kind: "points",
        positions: [{ x: 0, y: 1, z: 2 }],
        color: { x: 1, y: 0, z: 0, w: 1 },
        sizeCssPx: 3,
      },
      {
        kind: "polyline",
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
        color: { x: 0, y: 1, z: 0, w: 1 },
        widthCssPx: 4,
      },
      {
        kind: "triangles",
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        color: { x: 0, y: 0, z: 1, w: 0.5 },
      },
    ],
  };
}

function scene(toolPreview?: ToolPreview): RenderSceneSnapshot {
  const identity = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  const base: RenderSceneSnapshot = {
    camera: {
      view: identity,
      projection: identity,
      viewProjection: identity,
      position: { x: 0, y: 0, z: 5 },
    },
    viewport: { cssWidth: 100, cssHeight: 80, devicePixelRatio: 2 },
    retopo: {
      version: 0,
      vertices: [],
      edges: [],
      corners: [],
      faces: [],
      attributes,
    },
    selection: {
      version: 0,
      vertices: new Set(),
      edges: new Set(),
      faces: new Set(),
    },
  };
  return toolPreview === undefined ? base : { ...base, preview: toolPreview };
}

describe("PreviewRenderPass", () => {
  it("renders every ToolPreview primitive as a visible editing overlay", () => {
    const fake = new FakeWebGL2();
    const pass = new PreviewRenderPass();
    expect(pass.phase).toBe("overlay");
    pass.initialize(fake.asContext());

    pass.render(fake.asContext(), scene(preview()), 2);

    expect(fake.uploads).toHaveLength(3);
    expect(fake.uploads.every((upload) => upload.usage === fake.DYNAMIC_DRAW)).toBe(true);
    expect(fake.draws.map(({ mode, count }) => [mode, count])).toEqual([
      [fake.POINTS, 1],
      [fake.LINE_STRIP, 2],
      [fake.TRIANGLES, 3],
    ]);
    expect(fake.draws.every((draw) => !draw.depthEnabled && draw.blendEnabled)).toBe(true);
    expect(fake.pointSizes[0]).toBe(6);
    expect(fake.lineWidths.filter((width) => width !== 1)).toEqual([8]);
  });

  it("reuses a revision and converts CSS point/line sizes exactly once for each DPR", () => {
    const fake = new FakeWebGL2();
    const pass = new PreviewRenderPass();
    pass.initialize(fake.asContext());

    pass.render(fake.asContext(), scene(preview()), 2);
    pass.render(fake.asContext(), scene(preview()), 3);

    expect(fake.uploads).toHaveLength(3);
    expect(fake.pointSizes.filter((size) => size !== 1)).toEqual([6, 9]);
    expect(fake.lineWidths.filter((width) => width !== 1)).toEqual([8, 12]);
  });

  it("atomically replaces revisions and removes stale preview buffers", () => {
    const fake = new FakeWebGL2();
    const pass = new PreviewRenderPass();
    pass.initialize(fake.asContext());
    pass.render(fake.asContext(), scene(preview()), 1);

    const replacement: ToolPreview = {
      id: "stroke",
      revision: 2,
      primitives: [
        {
          kind: "points",
          positions: [{ x: 4, y: 5, z: 6 }],
          color: { x: 1, y: 1, z: 0, w: 1 },
          sizeCssPx: 2,
        },
      ],
    };
    pass.render(fake.asContext(), scene(replacement), 1);
    expect(fake.uploads).toHaveLength(4);
    expect(fake.deletedBuffers).toHaveLength(3);
    expect([...fake.uploads[3]!.data]).toEqual([4, 5, 6]);

    const drawCount = fake.draws.length;
    pass.render(fake.asContext(), scene(), 1);
    expect(fake.deletedBuffers).toHaveLength(4);
    expect(fake.draws).toHaveLength(drawCount);
  });

  it("retains the latest CPU preview across context invalidation and restores its buffers", () => {
    const first = new FakeWebGL2();
    const pass = new PreviewRenderPass();
    pass.initialize(first.asContext());
    pass.render(first.asContext(), scene(preview()), 1);
    pass.invalidate();

    expect(() => pass.render(first.asContext(), scene(preview()), 1)).toThrow(/initialized/);
    const restored = new FakeWebGL2();
    pass.initialize(restored.asContext());
    expect(restored.uploads).toHaveLength(3);
    pass.render(restored.asContext(), scene(preview()), 1);
    expect(restored.uploads).toHaveLength(3);

    pass.dispose();
    pass.dispose();
    expect(restored.deletedBuffers).toHaveLength(3);
    expect(restored.deletedPrograms).toHaveLength(1);
  });

  it("rejects malformed replacements without deleting the active revision", () => {
    const fake = new FakeWebGL2();
    const pass = new PreviewRenderPass();
    pass.initialize(fake.asContext());
    pass.render(fake.asContext(), scene(preview()), 1);

    const malformed: ToolPreview = {
      id: "stroke",
      revision: 2,
      primitives: [
        {
          kind: "triangles",
          positions: [{ x: 0, y: 0, z: 0 }],
          color: { x: 1, y: 1, z: 1, w: 1 },
        },
      ],
    };
    expect(() => pass.render(fake.asContext(), scene(malformed), 1)).toThrow(/complete triangles/);
    expect(fake.deletedBuffers).toHaveLength(0);
    expect(fake.uploads).toHaveLength(3);
  });

  it("rejects invalid lifecycle and DPR before changing resources", () => {
    const pass = new PreviewRenderPass();
    const fake = new FakeWebGL2();
    expect(() => pass.render(fake.asContext(), scene(preview()), 1)).toThrow(/initialized/);
    pass.initialize(fake.asContext());
    expect(() => pass.render(fake.asContext(), scene(preview()), Number.NaN)).toThrow(
      /devicePixelRatio/,
    );
    expect(fake.uploads).toHaveLength(0);
    pass.dispose();
    expect(() => pass.initialize(fake.asContext())).toThrow(/disposed/);
  });
});
