import { describe, expect, it } from "vitest";

import { CreateVertexTool } from "../../../src/tools/vertex";
import { createToolHarness, pointer, surfaceHit } from "../basic/tool-context-fake";

describe("CreateVertexTool", () => {
  it("commits the latest surface position in one transaction", () => {
    const harness = createToolHarness();
    harness.setSurface(surfaceHit({ x: 1, y: 1, z: 0 }));
    const tool = new CreateVertexTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    harness.setSurface(surfaceHit({ x: 2, y: 3, z: 0 }));
    tool.pointer?.(pointer("move"), harness.context);
    tool.pointer?.(pointer("up"), harness.context);

    expect(harness.commands[0]?.[1]).toEqual({
      kind: "createVertex",
      position: { x: 2, y: 3, z: 0 },
    });
    expect(harness.transactions[0]?.recorded).toHaveLength(1);
    expect(harness.transactions[0]?.committed).toBe(1);
    expect(harness.previews.at(-1)).toBeNull();
  });

  it("treats surface miss as unhandled and cancel as rollback", () => {
    const miss = createToolHarness();
    miss.setSurface(null);
    const missTool = new CreateVertexTool(miss.picking);
    expect(missTool.pointer?.(pointer("down"), miss.context)).toEqual({ handled: false });
    expect(miss.transactions).toHaveLength(0);

    const cancel = createToolHarness();
    const cancelTool = new CreateVertexTool(cancel.picking);
    cancelTool.pointer?.(pointer("down"), cancel.context);
    cancelTool.cancel?.(cancel.context);
    expect(cancel.commands).toHaveLength(0);
    expect(cancel.transactions[0]?.rolledBack).toBe(1);
    expect(cancel.transactions[0]?.committed).toBe(0);
    expect(cancel.previews.at(-1)).toBeNull();
  });
});
