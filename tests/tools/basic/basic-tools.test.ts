import { describe, expect, it } from "vitest";

import { DeleteElementsTool, MoveVerticesTool, SelectTool } from "../../../src/tools/basic";
import { createToolHarness, pointer, surfaceHit } from "./tool-context-fake";

describe("basic tools", () => {
  it("selects a canonical pick through ToolContext selection", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "vertex",
      vertex: 1,
      distance: 1,
      position: { x: 0, y: 0, z: 0 },
    });
    const tool = new SelectTool(harness.picking);

    expect(tool.pointer?.(pointer("down"), harness.context)).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(tool.pointer?.(pointer("up"), harness.context)).toEqual({
      handled: true,
      releasePointer: true,
    });

    expect(harness.selectionUpdates).toHaveLength(1);
    expect(harness.selectionUpdates[0]?.[0]).toBe("replace");
    expect(harness.selectionUpdates[0]?.[1].vertices).toEqual(new Set([1]));
    expect(harness.previews.at(-1)).toBeNull();
  });

  it("moves selected vertices in one committed transaction", () => {
    const harness = createToolHarness();
    harness.setSelection([1, 2]);
    harness.setPick({
      kind: "vertex",
      vertex: 1,
      distance: 1,
      position: { x: 0, y: 0, z: 0 },
    });
    harness.setSurface(surfaceHit({ x: 0, y: 0, z: 0 }));
    const tool = new MoveVerticesTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    harness.setSurface(surfaceHit({ x: 0, y: 2, z: 0 }));
    tool.pointer?.(pointer("move", { x: 130 }), harness.context);
    tool.pointer?.(pointer("up", { x: 130 }), harness.context);

    expect(harness.commands).toHaveLength(1);
    const command = harness.commands[0]?.[1];
    expect(command?.kind).toBe("setVertexPositions");
    if (command?.kind !== "setVertexPositions") throw new Error("unexpected command");
    expect(command.positions.get(1)).toEqual({ x: 0, y: 2, z: 0 });
    expect(command.positions.get(2)).toEqual({ x: 1, y: 2, z: 0 });
    expect(harness.transactions[0]?.recorded).toHaveLength(1);
    expect(harness.transactions[0]?.committed).toBe(1);
    expect(harness.transactions[0]?.rolledBack).toBe(0);
    expect(harness.previews.at(-1)).toBeNull();
  });

  it("rolls back move on pointer cancel without mutating", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "vertex",
      vertex: 1,
      distance: 1,
      position: { x: 0, y: 0, z: 0 },
    });
    const tool = new MoveVerticesTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    tool.pointer?.(pointer("cancel"), harness.context);

    expect(harness.commands).toHaveLength(0);
    expect(harness.transactions[0]?.committed).toBe(0);
    expect(harness.transactions[0]?.rolledBack).toBe(1);
    expect(harness.previews.at(-1)).toBeNull();
  });

  it("deletes selection in one transaction and prunes it afterward", () => {
    const harness = createToolHarness();
    harness.setSelection([], [10]);
    const tool = new DeleteElementsTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);
    tool.pointer?.(pointer("up"), harness.context);

    expect(harness.commands).toHaveLength(1);
    const command = harness.commands[0]?.[1];
    expect(command).toEqual({ kind: "deleteElements", elements: { vertices: [], edges: [10], faces: [] } });
    expect(harness.transactions[0]?.recorded).toHaveLength(1);
    expect(harness.transactions[0]?.committed).toBe(1);
    expect(harness.selection.prune).toHaveBeenCalledWith(harness.context.mesh);
  });

  it("rolls back delete when mutation fails and leaves no committed transaction", () => {
    const harness = createToolHarness();
    harness.setSelection([], [10]);
    harness.mutations.execute.mockImplementationOnce(() => {
      throw new Error("mutation rejected");
    });
    const tool = new DeleteElementsTool(harness.picking);

    tool.pointer?.(pointer("down"), harness.context);

    expect(() => tool.pointer?.(pointer("up"), harness.context)).toThrow("mutation rejected");
    expect(harness.transactions[0]?.committed).toBe(0);
    expect(harness.transactions[0]?.rolledBack).toBe(1);
    expect(harness.transactions[0]?.recorded).toHaveLength(0);
    expect(harness.previews.at(-1)).toBeNull();
  });

  it("does not mistake touch navigation for modeling input", () => {
    const harness = createToolHarness();
    harness.setPick({
      kind: "vertex",
      vertex: 1,
      distance: 1,
      position: { x: 0, y: 0, z: 0 },
    });
    const tool = new SelectTool(harness.picking);

    expect(tool.pointer?.(pointer("down", { pointerType: "touch" }), harness.context)).toEqual({
      handled: false,
    });
    expect(harness.selection.update).not.toHaveBeenCalled();
  });
});
