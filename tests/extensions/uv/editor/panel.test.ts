import { createContractTestExtensionHost } from "../../../../src/optional-sdk/testkit";
import { UvEditorPanel } from "../../../../src/extensions/uv/editor";
import { describe, expect, it, vi } from "vitest";

import {
  FixtureMeshQuery,
  RecordingHistoryService,
  RecordingMutationService,
  UV_KEY,
  pointer,
} from "./fixtures";

describe("UvEditorPanel", () => {
  it("uses only the panel-local normalized surface and refreshes after document replacement", () => {
    const firstMesh = new FixtureMeshQuery(1);
    const mutations = new RecordingMutationService(firstMesh);
    const history = new RecordingHistoryService();
    const host = createContractTestExtensionHost({
      modeling: { mesh: firstMesh, mutations, history },
    });
    const panel = new UvEditorPanel({ modeling: host.modeling, uvAttribute: UV_KEY });
    panel.controller.setLayout({ pan: { x: 50, y: 50 }, zoom: 100 });
    panel.selection.updateCorners("replace", new Set([100]));
    const cancel = vi.fn();
    panel.controller.beginEdit(cancel);
    const container = document.createElement("main");

    panel.mount(container, host.panelContext());
    const surface = host.inputSurfaces.latest();
    expect(surface?.element).toBe(container.querySelector('[data-uv-editor="viewport"]'));
    expect(surface?.options).toEqual({ touchAction: "none" });
    surface?.dispatch(pointer("down", 70, 20));

    host.modeling.replaceDocument({
      mesh: new FixtureMeshQuery(2),
      mutations: host.modeling.mutations,
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(panel.snapshot().selection.corners.size).toBe(0);
    expect(panel.snapshot().status.meshVersion).toBe(2);
    expect(mutations.calls).toHaveLength(0);
    expect(history.begun).toHaveLength(0);
    expect(() => surface?.dispatch(pointer("down", 70, 20))).not.toThrow();
    panel.dispose();
    panel.dispose();
    host.dispose();
  });

  it("renders partial face UVs as a read-only warning", () => {
    const mesh = new FixtureMeshQuery(1, new Map([
      [100, { x: 0.2, y: 0.3 }],
      [101, { x: 0.8, y: 0.3 }],
    ]));
    const host = createContractTestExtensionHost({ modeling: { mesh } });
    const panel = new UvEditorPanel({ modeling: host.modeling, uvAttribute: UV_KEY });
    const container = document.createElement("main");

    panel.mount(container, host.panelContext());

    expect(panel.snapshot().status).toMatchObject({ availability: "partial", readOnly: true });
    expect(container.querySelector('[data-uv-editor="root"]')?.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector('[data-uv-editor="status"]')?.textContent).toMatch(/read-only/);
    panel.dispose();
    host.dispose();
  });

  it("routes Planar, Box, and Normalize controls through one mutation/history entry each", () => {
    const mesh = new FixtureMeshQuery();
    const mutations = new RecordingMutationService(mesh);
    const history = new RecordingHistoryService();
    const host = createContractTestExtensionHost({ modeling: { mesh, mutations, history } });
    const panel = new UvEditorPanel({
      modeling: host.modeling,
      uvAttribute: UV_KEY,
      resolveIsland: () => 0,
    });
    const container = document.createElement("main");
    panel.mount(container, host.panelContext());

    const command = (id: string): HTMLButtonElement => {
      const button = container.querySelector<HTMLButtonElement>(`[data-uv-command="${id}"]`);
      if (button === null) throw new Error(`missing ${id} control`);
      return button;
    };
    command("planar").click();
    command("box").click();
    command("normalize").click();
    command("select-island").click();
    expect(panel.controller.selectionTarget()).toBe("island");
    command("select-corner").click();
    expect(panel.controller.selectionTarget()).toBe("corner");

    expect(mutations.calls.map((call) => call.label)).toEqual([
      "Planar UV",
      "Box UV",
      "Normalize UV",
    ]);
    expect(history.begun).toEqual(["Planar UV", "Box UV", "Normalize UV"]);
    expect(history.committed).toEqual(["Planar UV", "Box UV", "Normalize UV"]);
    expect(history.recorded).toHaveLength(3);
    panel.dispose();
    host.dispose();
  });
});
