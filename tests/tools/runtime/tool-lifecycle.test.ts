import { describe, expect, it } from "vitest";

import type { Tool, ToolContext } from "@octopoly/contracts";

import { ToolLifecycle } from "../../../src/tools/runtime/tool-lifecycle";

const context = {} as ToolContext;

function recordingTool(id: string, events: string[]): Tool {
  return {
    id,
    activate(receivedContext) {
      expect(receivedContext).toBe(context);
      events.push(`activate:${id}`);
    },
    deactivate(receivedContext) {
      expect(receivedContext).toBe(context);
      events.push(`deactivate:${id}`);
    },
  };
}

describe("ToolLifecycle", () => {
  it("runs the common boundary before deactivate and activate callbacks", () => {
    const events: string[] = [];
    const first = recordingTool("first", events);
    const second = recordingTool("second", events);
    const lifecycle = new ToolLifecycle(context, (current, next) => {
      events.push(`cancel:${current?.id ?? "none"}->${next?.id ?? "none"}`);
    });

    lifecycle.activate(first);
    lifecycle.activate(second);
    lifecycle.deactivate();

    expect(events).toEqual([
      "cancel:none->first",
      "activate:first",
      "cancel:first->second",
      "deactivate:first",
      "activate:second",
      "cancel:second->none",
      "deactivate:second",
    ]);
    expect(lifecycle.active()).toBeNull();
  });

  it("does not repeat callbacks when activating the already active tool", () => {
    const events: string[] = [];
    const tool = recordingTool("stable", events);
    const lifecycle = new ToolLifecycle(context, () => events.push("cancel"));

    lifecycle.activate(tool);
    lifecycle.activate(tool);

    expect(events).toEqual(["cancel", "activate:stable"]);
    expect(lifecycle.active()).toBe(tool);
  });

  it("interrupts the active gesture boundary without cycling tool callbacks", () => {
    const events: string[] = [];
    const tool = recordingTool("stable", events);
    const lifecycle = new ToolLifecycle(context, (current, next) => {
      events.push(`cancel:${current?.id ?? "none"}->${next?.id ?? "none"}`);
    });
    lifecycle.activate(tool);
    events.splice(0, events.length);

    lifecycle.interrupt();

    expect(events).toEqual(["cancel:stable->stable"]);
    expect(lifecycle.active()).toBe(tool);
  });

  it("keeps the previous tool active when the cancel boundary rejects a transition", () => {
    const events: string[] = [];
    const first = recordingTool("first", events);
    const second = recordingTool("second", events);
    let rejectTransition = false;
    const lifecycle = new ToolLifecycle(context, () => {
      if (rejectTransition) {
        throw new Error("cancel failed");
      }
    });
    lifecycle.activate(first);
    events.splice(0, events.length);
    rejectTransition = true;

    expect(() => lifecycle.activate(second)).toThrow("cancel failed");
    expect(lifecycle.active()).toBe(first);
    expect(events).toEqual([]);
  });

  it("clears active state when an activation callback throws", () => {
    const events: string[] = [];
    const first = recordingTool("first", events);
    const failing: Tool = {
      id: "failing",
      activate() {
        events.push("activate:failing");
        throw new Error("activation failed");
      },
    };
    const lifecycle = new ToolLifecycle(context, () => events.push("cancel"));
    lifecycle.activate(first);
    events.splice(0, events.length);

    expect(() => lifecycle.activate(failing)).toThrow("activation failed");
    expect(events).toEqual(["cancel", "deactivate:first", "activate:failing"]);
    expect(lifecycle.active()).toBeNull();
  });

  it("disposes once and rejects later lifecycle mutations", () => {
    const events: string[] = [];
    const tool = recordingTool("tool", events);
    const lifecycle = new ToolLifecycle(context, (current, next) => {
      events.push(`cancel:${current?.id ?? "none"}->${next?.id ?? "none"}`);
    });
    lifecycle.activate(tool);
    events.splice(0, events.length);

    lifecycle.dispose();
    lifecycle.dispose();

    expect(events).toEqual(["cancel:tool->none", "deactivate:tool"]);
    expect(lifecycle.active()).toBeNull();
    expect(() => lifecycle.activate(tool)).toThrow("Tool lifecycle is disposed");
    expect(() => lifecycle.interrupt()).toThrow("Tool lifecycle is disposed");
    expect(() => lifecycle.deactivate()).toThrow("Tool lifecycle is disposed");
  });
});
