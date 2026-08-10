import { describe, expect, it, vi } from "vitest";

import { ExtrudeFacesTool } from "../../../src/tools/face";
import { createToolHarness, pointer, surfaceHit } from "../basic/tool-context-fake";

describe("ExtrudeFacesTool", () => {
  it("extrudes selected faces along their normal on a frozen fallback drag plane", () => {
    const harness = createToolHarness();
    harness.setSelection([], [], [20]);
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    harness.setSurface(null);
    harness.picking.rayFromScreen.mockImplementation((point) => ({
      origin: { x: 0.2, y: 0.2, z: 5 + (point.x - 100) / 15 },
      direction: { x: 0.6, y: 0, z: -0.8 },
    }));
    const tool = new ExtrudeFacesTool(harness.picking);

    expect(tool.pointer?.(pointer("down"), harness.context)).toEqual({ handled: true, capturePointer: true });
    tool.pointer?.(pointer("move", { x: 130 }), harness.context);
    tool.pointer?.(pointer("up", { x: 130 }), harness.context);

    expect(harness.commands[0]?.[1]).toEqual({
      kind: "extrudeFaces",
      faces: [20],
      offset: { x: 0, y: 0, z: 2 },
    });
    expect(harness.transactions[0]?.committed).toBe(1);
  });

  it("freezes fallback mode instead of switching to a reference hit during extrusion", () => {
    const harness = createToolHarness();
    harness.setSelection([], [], [20]);
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    harness.setSurface(null);
    harness.picking.rayFromScreen.mockImplementation((point) => ({
      origin: { x: 0.2, y: 0.2, z: 5 + (point.x - 100) / 30 },
      direction: { x: 0.6, y: 0, z: -0.8 },
    }));
    const tool = new ExtrudeFacesTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    harness.setSurface(surfaceHit({ x: 99, y: 99, z: 99 }));
    tool.pointer?.(pointer("up", { x: 130 }), harness.context);

    expect(harness.commands[0]?.[1]).toEqual({
      kind: "extrudeFaces",
      faces: [20],
      offset: { x: 0, y: 0, z: 1 },
    });
  });

  it("rejects fallback when the selected face is degenerate", () => {
    const harness = createToolHarness();
    harness.setSelection([], [], [20]);
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    harness.setSurface(null);
    harness.picking.rayFromScreen.mockReturnValue({
      origin: { x: 0.2, y: 0.2, z: 5 },
      direction: { x: 0.6, y: 0, z: -0.8 },
    });
    const vertex = harness.context.mesh.vertex.bind(harness.context.mesh);
    vi.spyOn(harness.context.mesh, "vertex").mockImplementation((id) => {
      const record = vertex(id);
      return record === null ? null : { ...record, position: { x: id, y: 0, z: 0 } };
    });
    const tool = new ExtrudeFacesTool(harness.picking);

    expect(tool.pointer?.(pointer("down"), harness.context)).toEqual({ handled: false });
    expect(harness.transactions).toHaveLength(0);
    expect(harness.commands).toHaveLength(0);
    expect(harness.previews).toHaveLength(0);
  });

  it("rejects fallback when the camera ray is parallel to the face normal", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    harness.setSurface(null);
    const tool = new ExtrudeFacesTool(harness.picking);

    expect(tool.pointer?.(pointer("down"), harness.context)).toEqual({ handled: false });
    expect(harness.transactions).toHaveLength(0);
    expect(harness.previews).toHaveLength(0);
  });

  it("rolls back a zero-displacement fallback without mutation or stale preview", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    harness.setSurface(null);
    harness.picking.rayFromScreen.mockReturnValue({
      origin: { x: 0.2, y: 0.2, z: 5 },
      direction: { x: 0.6, y: 0, z: -0.8 },
    });
    const tool = new ExtrudeFacesTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    tool.pointer?.(pointer("up"), harness.context);

    expect(harness.commands).toHaveLength(0);
    expect(harness.transactions[0]?.rolledBack).toBe(1);
    expect(harness.transactions[0]?.committed).toBe(0);
    expect(harness.previews.at(-1)).toBeNull();
  });

  it("extrudes selected faces by the reference-surface delta", () => {
    const harness = createToolHarness();
    harness.setSelection([], [], [20]);
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    harness.setSurface(surfaceHit({ x: 0, y: 0, z: 0 }));
    const tool = new ExtrudeFacesTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    harness.setSurface(surfaceHit({ x: 0, y: 0, z: 2 }));
    tool.pointer?.(pointer("move"), harness.context);
    tool.pointer?.(pointer("up"), harness.context);

    expect(harness.commands[0]?.[1]).toEqual({
      kind: "extrudeFaces",
      faces: [20],
      offset: { x: 0, y: 0, z: 2 },
    });
    expect(harness.transactions[0]?.recorded).toHaveLength(1);
    expect(harness.transactions[0]?.committed).toBe(1);
  });

  it("rolls back without mutation when cancelled", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "face",
      face: 20,
      distance: 1,
      position: { x: 0.2, y: 0.2, z: 0 },
    });
    const tool = new ExtrudeFacesTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    tool.cancel?.(harness.context);

    expect(harness.commands).toHaveLength(0);
    expect(harness.transactions[0]?.rolledBack).toBe(1);
    expect(harness.previews.at(-1)).toBeNull();
  });
});
