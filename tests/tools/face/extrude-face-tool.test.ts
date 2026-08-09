import { describe, expect, it } from "vitest";

import { ExtrudeFacesTool } from "../../../src/tools/face";
import { createToolHarness, pointer, surfaceHit } from "../basic/tool-context-fake";

describe("ExtrudeFacesTool", () => {
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
