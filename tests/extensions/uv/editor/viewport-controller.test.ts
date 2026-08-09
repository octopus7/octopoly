import { createContractTestExtensionHost } from "../../../../src/optional-sdk/testkit";
import {
  UvEditorSelection,
  UvViewportController,
} from "../../../../src/extensions/uv/editor";
import { describe, expect, it, vi } from "vitest";

import {
  FixtureCoreSelection,
  FixtureMeshQuery,
  RecordingHistoryService,
  RecordingMutationService,
  UV_KEY,
  pointer,
} from "./fixtures";

function setup(coreSelection: FixtureCoreSelection = new FixtureCoreSelection()) {
  const mesh = new FixtureMeshQuery();
  const mutations = new RecordingMutationService(mesh);
  const history = new RecordingHistoryService();
  const host = createContractTestExtensionHost({
    modeling: { mesh, mutations, history, selection: coreSelection },
  });
  const selection = new UvEditorSelection();
  const controller = new UvViewportController({
    modeling: host.modeling,
    selection,
    uvAttribute: UV_KEY,
    initialLayout: { pan: { x: 50, y: 50 }, zoom: 100 },
    resolveIsland: (corner) => corner === 100 ? 4 : null,
  });
  return { host, mesh, mutations, history, selection, controller };
}

describe("UvViewportController", () => {
  it("routes normalized pen coordinates to corner and island-local selection", () => {
    const { controller, selection, host } = setup();

    expect(controller.dispatch(pointer("down", 70, 20))).toEqual({
      handled: true,
      capturePointer: true,
    });
    expect(controller.dispatch(pointer("up", 70, 20))).toEqual({
      handled: true,
      releasePointer: true,
    });
    expect([...selection.snapshot().corners]).toEqual([100]);

    controller.setSelectionTarget("island");
    controller.dispatch(pointer("down", 70, 20));
    controller.dispatch(pointer("up", 70, 20));
    expect([...selection.snapshot().islands]).toEqual([4]);
    host.dispose();
  });

  it("preserves selection on pick miss and pointer cancel", () => {
    const { controller, selection, mutations, history, host } = setup();
    selection.updateCorners("replace", new Set([100]));

    controller.dispatch(pointer("down", 500, 500));
    controller.dispatch(pointer("up", 500, 500));
    controller.dispatch(pointer("down", 130, 20));
    controller.dispatch(pointer("cancel", 130, 20));

    expect([...selection.snapshot().corners]).toEqual([100]);
    expect(mutations.calls).toHaveLength(0);
    expect(history.begun).toHaveLength(0);
    host.dispose();
  });

  it("commits one Move UV history mutation for a selected-corner Pencil drag", () => {
    const { controller, selection, mutations, history, host } = setup();
    selection.updateCorners("replace", new Set([100]));

    controller.dispatch(pointer("down", 70, 20));
    controller.dispatch(pointer("move", 90, 10));
    controller.dispatch(pointer("up", 90, 10));

    expect(mutations.calls).toHaveLength(1);
    expect(mutations.calls[0]?.label).toBe("Move UV");
    const command = mutations.calls[0]?.command;
    expect(command?.kind).toBe("setAttribute");
    if (command?.kind !== "setAttribute") throw new Error("expected UV attribute mutation");
    expect(command.values.get(100)).toEqual({ x: 0.4, y: 0.4 });
    expect(history.begun).toEqual(["Move UV"]);
    expect(history.committed).toEqual(["Move UV"]);
    expect(history.recorded).toHaveLength(1);
    host.dispose();
  });

  it("drops a selected-corner Pencil drag on cancel without mutation or history", () => {
    const { controller, selection, mutations, history, host } = setup();
    selection.updateCorners("replace", new Set([100]));

    controller.dispatch(pointer("down", 70, 20));
    controller.dispatch(pointer("move", 90, 10));
    controller.dispatch(pointer("cancel", 90, 10));

    expect(mutations.calls).toHaveLength(0);
    expect(history.begun).toHaveLength(0);
    host.dispose();
  });

  it("keeps touch pan separate from pencil edits and rolls navigation back on cancel", () => {
    const { controller, selection, mutations, history, host } = setup();
    const before = controller.layout();

    controller.dispatch(pointer("down", 10, 10, "touch", 1));
    controller.dispatch(pointer("move", 30, 35, "touch", 1));
    expect(controller.layout().pan).toEqual({ x: 70, y: 75 });
    expect(selection.snapshot().corners.size).toBe(0);
    expect(mutations.calls).toHaveLength(0);
    expect(history.begun).toHaveLength(0);

    controller.dispatch(pointer("cancel", 30, 35, "touch", 1));
    expect(controller.layout()).toEqual(before);
    expect(selection.snapshot().corners.size).toBe(0);
    host.dispose();
  });

  it("uses Core face selection only as a pick filter", () => {
    const coreSelection = new FixtureCoreSelection(new Set([999]));
    const before = coreSelection.snapshot();
    const { controller, selection, host } = setup(coreSelection);

    controller.dispatch(pointer("down", 70, 20));
    controller.dispatch(pointer("up", 70, 20));

    expect(selection.snapshot().corners.size).toBe(0);
    expect(coreSelection.snapshot()).toBe(before);
    host.dispose();
  });

  it("cancels every panel-local edit exactly once on normalized cancel", () => {
    const { controller, host } = setup();
    const first = vi.fn();
    const second = vi.fn();
    controller.beginEdit(first);
    controller.beginEdit(second);

    controller.dispatch(pointer("down", 70, 20));
    controller.dispatch(pointer("cancel", 70, 20));
    controller.cancelActiveEdits();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    host.dispose();
  });
});
