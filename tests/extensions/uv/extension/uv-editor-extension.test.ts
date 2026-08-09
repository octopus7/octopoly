import type { ExtensionPanel, Tool } from "@octopoly/contracts";
import {
  ContractTestStateProvider,
  createContractTestExtensionHost,
} from "../../../../src/optional-sdk/testkit";
import {
  UV_EDITOR_EXTENSION_ID,
  UV_EDITOR_PANEL_ID,
  UV_EDITOR_STATE_ID,
  UV_EDITOR_TOOL_ID,
  UvEditorExtension,
  createUvEditorExtension,
} from "../../../../src/extensions/uv";
import { describe, expect, it, vi } from "vitest";

const CORE_TOOL: Tool = { id: "core.select" };

describe("UvEditorExtension", () => {
  it("registers panel/state/tool and restores the scoped Core tool on repeated disposal", () => {
    const host = createContractTestExtensionHost();
    host.tools.register(CORE_TOOL);
    host.tools.activate(CORE_TOOL.id);
    const extension = createUvEditorExtension();

    expect(extension.activate(host)).toEqual({ status: "activated" });
    expect(extension.id).toBe(UV_EDITOR_EXTENSION_ID);
    expect(host.panels.get(UV_EDITOR_PANEL_ID)).toBe(extension.panel());
    expect(host.tools.active()?.id).toBe(UV_EDITOR_TOOL_ID);
    expect(host.state.save().values[UV_EDITOR_STATE_ID]).toBeDefined();

    extension.dispose();
    extension.dispose();

    expect(host.panels.get(UV_EDITOR_PANEL_ID)).toBeNull();
    expect(host.tools.active()).toBe(CORE_TOOL);
    expect(extension.status()).toBe("disposed");
    expect(extension.cleanupErrors()).toEqual([]);
    host.dispose();
  });

  it("returns an unsupported result without touching registries when UI mount is unavailable", () => {
    const host = createContractTestExtensionHost();
    host.tools.register(CORE_TOOL);
    host.tools.activate(CORE_TOOL.id);
    const extension = new UvEditorExtension({
      uiAvailable: false,
      disabledReason: "Panels are disabled by the host",
    });

    expect(extension.activate(host)).toEqual({
      status: "unsupported",
      reason: "Panels are disabled by the host",
    });
    expect(host.panels.get(UV_EDITOR_PANEL_ID)).toBeNull();
    expect(host.tools.active()).toBe(CORE_TOOL);
    expect(host.state.save().values).toEqual({});
    extension.dispose();
    host.dispose();
  });

  it("unwinds a registration conflict without disposing the existing panel", () => {
    const host = createContractTestExtensionHost();
    host.tools.register(CORE_TOOL);
    host.tools.activate(CORE_TOOL.id);
    const existing: ExtensionPanel = {
      id: UV_EDITOR_PANEL_ID,
      title: "Existing panel",
      mount: vi.fn(),
      dispose: vi.fn(),
    };
    host.panels.register(existing);
    const extension = createUvEditorExtension();

    expect(extension.activate(host)).toMatchObject({ status: "failed" });
    expect(host.panels.get(UV_EDITOR_PANEL_ID)).toBe(existing);
    expect(existing.dispose).not.toHaveBeenCalled();
    expect(host.tools.active()).toBe(CORE_TOOL);
    expect(host.state.save().values[UV_EDITOR_STATE_ID]).toBeUndefined();
    extension.dispose();
    host.dispose();
    expect(existing.dispose).toHaveBeenCalledTimes(1);
  });

  it("unwinds a state conflict after scoped activation and preserves the existing provider", () => {
    const host = createContractTestExtensionHost();
    host.tools.register(CORE_TOOL);
    host.tools.activate(CORE_TOOL.id);
    const existing = new ContractTestStateProvider(UV_EDITOR_STATE_ID, {
      schemaVersion: 7,
      data: { owner: "existing" },
    });
    host.state.register(existing);
    const extension = createUvEditorExtension();

    expect(extension.activate(host)).toMatchObject({ status: "failed" });
    expect(host.panels.get(UV_EDITOR_PANEL_ID)).toBeNull();
    expect(host.tools.active()).toBe(CORE_TOOL);
    expect(host.state.save().values[UV_EDITOR_STATE_ID]).toEqual({
      schemaVersion: 7,
      data: { owner: "existing" },
    });
    expect(existing.disposed()).toBe(false);
    extension.dispose();
    host.dispose();
  });

  it("does not damage unknown extension state while activating and disposing", async () => {
    const host = createContractTestExtensionHost();
    await host.state.load({
      "future.uv-helper": {
        schemaVersion: 4,
        data: { untouched: [1, 2, 3] },
      },
    });
    const extension = createUvEditorExtension();
    expect(extension.activate(host)).toEqual({ status: "activated" });
    extension.dispose();

    expect(host.state.save().values["future.uv-helper"]).toEqual({
      schemaVersion: 4,
      data: { untouched: [1, 2, 3] },
    });
    host.dispose();
  });
});
