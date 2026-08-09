import { describe, expect, it } from "vitest";

import { SplitEdgeTool } from "../../../src/tools/edge";
import { createToolHarness, pointer } from "../basic/tool-context-fake";

describe("SplitEdgeTool", () => {
  it("splits a picked edge with one recorded mutation", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "edge",
      edge: 10,
      distance: 1,
      position: { x: 0.5, y: 0, z: 0 },
    });
    const tool = new SplitEdgeTool(harness.picking, 0.25);

    tool.pointer?.(pointer("down"), harness.context);
    tool.pointer?.(pointer("up"), harness.context);

    expect(harness.commands[0]?.[1]).toEqual({ kind: "splitEdge", edge: 10, t: 0.25 });
    expect(harness.transactions[0]?.recorded).toHaveLength(1);
    expect(harness.transactions[0]?.committed).toBe(1);
  });

  it("cleans preview and transaction on cancel", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "edge",
      edge: 10,
      distance: 1,
      position: { x: 0.5, y: 0, z: 0 },
    });
    const tool = new SplitEdgeTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    tool.pointer?.(pointer("cancel"), harness.context);

    expect(harness.commands).toHaveLength(0);
    expect(harness.transactions[0]?.rolledBack).toBe(1);
    expect(harness.transactions[0]?.committed).toBe(0);
    expect(harness.previews.at(-1)).toBeNull();
  });
});
