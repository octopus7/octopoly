import type { ExtensionStateContribution } from "@octopoly/contracts";
import { createContractTestExtensionHost } from "../../../../src/optional-sdk/testkit";
import {
  UvEditorSelection,
  UvViewportController,
} from "../../../../src/extensions/uv/editor";
import {
  UV_EDITOR_STATE_SCHEMA_VERSION,
  UvEditorStateProvider,
} from "../../../../src/extensions/uv/extension";
import { describe, expect, it } from "vitest";

import { FixtureMeshQuery, UV_KEY } from "../editor/fixtures";

function setup() {
  const host = createContractTestExtensionHost({ modeling: { mesh: new FixtureMeshQuery() } });
  const selection = new UvEditorSelection();
  const controller = new UvViewportController({
    modeling: host.modeling,
    selection,
    uvAttribute: UV_KEY,
    initialLayout: { pan: { x: 5, y: 6 }, zoom: 100 },
  });
  const provider = new UvEditorStateProvider(selection, controller);
  return { host, selection, controller, provider };
}

describe("UvEditorStateProvider", () => {
  it("round-trips layout and extension-owned corner/island selection", () => {
    const { host, selection, controller, provider } = setup();
    provider.load({
      schemaVersion: UV_EDITOR_STATE_SCHEMA_VERSION,
      data: {
        layout: { panX: 30, panY: 40, zoom: 250 },
        selection: { corners: [100, 102], islands: [3] },
      },
    });

    expect(controller.layout()).toEqual({ pan: { x: 30, y: 40 }, zoom: 250 });
    expect([...selection.snapshot().corners]).toEqual([100, 102]);
    expect([...selection.snapshot().islands]).toEqual([3]);
    expect(provider.save()).toEqual({
      schemaVersion: 1,
      data: {
        layout: { panX: 30, panY: 40, zoom: 250 },
        selection: { corners: [100, 102], islands: [3] },
      },
    });
    provider.dispose();
    provider.dispose();
    host.dispose();
  });

  it("preserves unknown current-schema fields and image references", () => {
    const { host, provider } = setup();
    provider.load({
      schemaVersion: 1,
      data: {
        layout: { panX: 1, panY: 2, zoom: 3, gridMode: "polar" },
        selection: { corners: [100], islands: [], futureMode: true },
        futureRoot: { value: 9 },
      },
      imageAssets: [{
        id: "future-image",
        revision: 2,
        width: 8,
        height: 8,
        colorSpace: "linear",
      }],
    });

    expect(provider.save()).toEqual({
      schemaVersion: 1,
      data: {
        futureRoot: { value: 9 },
        layout: { gridMode: "polar", panX: 1, panY: 2, zoom: 3 },
        selection: { futureMode: true, corners: [100], islands: [] },
      },
      imageAssets: [{
        id: "future-image",
        revision: 2,
        width: 8,
        height: 8,
        colorSpace: "linear",
      }],
    });
    host.dispose();
  });

  it("keeps unsupported future schema data opaque instead of damaging it", () => {
    const { host, selection, provider } = setup();
    selection.updateCorners("replace", new Set([100]));
    const future: ExtensionStateContribution = {
      schemaVersion: 99,
      data: { layout: "future", nested: [1, { untouched: true }] },
    };

    provider.load(future);

    expect(selection.snapshot().corners.size).toBe(0);
    expect(provider.save()).toEqual(future);
    host.dispose();
  });

  it("resets known state when a new document has no UV contribution", () => {
    const { host, selection, controller, provider } = setup();
    provider.load({
      schemaVersion: 1,
      data: {
        layout: { panX: 90, panY: 80, zoom: 70 },
        selection: { corners: [100], islands: [2] },
      },
    });

    provider.load(undefined);

    expect(controller.layout()).toEqual({ pan: { x: 5, y: 6 }, zoom: 100 });
    expect([...selection.snapshot().corners]).toEqual([]);
    expect([...selection.snapshot().islands]).toEqual([]);
    host.dispose();
  });
});
