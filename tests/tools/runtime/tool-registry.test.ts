import { describe, expect, it } from "vitest";

import type { Tool, ToolContext } from "@octopoly/contracts";

import { ToolRegistryImpl, createToolRegistry } from "../../../src/tools/runtime/tool-registry";

const context = {} as ToolContext;

function recordingTool(id: string, events: string[]): Tool {
  return {
    id,
    activate() {
      events.push(`activate:${id}`);
    },
    deactivate() {
      events.push(`deactivate:${id}`);
    },
  };
}

function registryWithEvents(events: string[]): ToolRegistryImpl {
  return new ToolRegistryImpl(context, (current, next) => {
    events.push(`cancel:${current?.id ?? "none"}->${next?.id ?? "none"}`);
  });
}

describe("ToolRegistryImpl", () => {
  it("registers and activates canonical tools while rejecting duplicate and unknown ids", () => {
    const events: string[] = [];
    const first = recordingTool("first", events);
    const duplicate = recordingTool("first", events);
    const registry = registryWithEvents(events);

    registry.register(first);
    expect(() => registry.register(duplicate)).toThrow('Tool "first" is already registered');
    expect(() => registry.activate("missing")).toThrow('Unknown tool "missing"');
    expect(() => registry.unregister("missing")).toThrow('Unknown tool "missing"');
    expect(events).toEqual([]);

    registry.activate("first");
    expect(registry.active()).toBe(first);
    expect(events).toEqual(["cancel:none->first", "activate:first"]);
  });

  it("deactivates an active tool before unregistering it", () => {
    const events: string[] = [];
    const tool = recordingTool("active", events);
    const registry = registryWithEvents(events);
    registry.register(tool);
    registry.activate(tool.id);
    events.splice(0, events.length);

    registry.unregister(tool.id);

    expect(events).toEqual(["cancel:active->none", "deactivate:active"]);
    expect(registry.active()).toBeNull();
    expect(() => registry.activate(tool.id)).toThrow('Unknown tool "active"');
  });

  it("restores nested scoped activations in LIFO order", () => {
    const events: string[] = [];
    const base = recordingTool("base", events);
    const first = recordingTool("first", events);
    const second = recordingTool("second", events);
    const registry = registryWithEvents(events);
    for (const tool of [base, first, second]) {
      registry.register(tool);
    }
    registry.activate(base.id);
    events.splice(0, events.length);

    const firstLease = registry.activateScoped(first.id);
    const secondLease = registry.activateScoped(second.id);
    secondLease.dispose();
    firstLease.dispose();

    expect(registry.active()).toBe(base);
    expect(events).toEqual([
      "cancel:base->first",
      "deactivate:base",
      "activate:first",
      "cancel:first->second",
      "deactivate:first",
      "activate:second",
      "cancel:second->first",
      "deactivate:second",
      "activate:first",
      "cancel:first->base",
      "deactivate:first",
      "activate:base",
    ]);
  });

  it("interrupts an active gesture when scoping the already active tool", () => {
    const events: string[] = [];
    const tool = recordingTool("same", events);
    const registry = registryWithEvents(events);
    registry.register(tool);
    registry.activate(tool.id);
    events.splice(0, events.length);

    const lease = registry.activateScoped(tool.id);

    expect(registry.active()).toBe(tool);
    expect(events).toEqual(["cancel:same->same"]);

    lease.dispose();
    expect(registry.active()).toBe(tool);
    expect(events).toEqual(["cancel:same->same"]);
  });

  it("removes a non-top scoped lease without changing the active tool", () => {
    const events: string[] = [];
    const base = recordingTool("base", events);
    const middle = recordingTool("middle", events);
    const top = recordingTool("top", events);
    const registry = registryWithEvents(events);
    for (const tool of [base, middle, top]) {
      registry.register(tool);
    }
    registry.activate(base.id);
    const middleLease = registry.activateScoped(middle.id);
    const topLease = registry.activateScoped(top.id);
    events.splice(0, events.length);

    middleLease.dispose();
    middleLease.dispose();
    expect(registry.active()).toBe(top);
    expect(events).toEqual([]);

    topLease.dispose();
    expect(registry.active()).toBe(base);
    expect(events).toEqual(["cancel:top->base", "deactivate:top", "activate:base"]);
  });

  it("restores the previous selection when the active scoped tool is unregistered", () => {
    const events: string[] = [];
    const base = recordingTool("base", events);
    const scoped = recordingTool("scoped", events);
    const registry = registryWithEvents(events);
    registry.register(base);
    registry.register(scoped);
    registry.activate(base.id);
    const lease = registry.activateScoped(scoped.id);
    events.splice(0, events.length);

    registry.unregister(scoped.id);
    lease.dispose();

    expect(registry.active()).toBe(base);
    expect(events).toEqual(["cancel:scoped->base", "deactivate:scoped", "activate:base"]);
  });

  it("makes direct activation authoritative over outstanding scoped leases", () => {
    const events: string[] = [];
    const base = recordingTool("base", events);
    const scoped = recordingTool("scoped", events);
    const direct = recordingTool("direct", events);
    const registry = registryWithEvents(events);
    for (const tool of [base, scoped, direct]) {
      registry.register(tool);
    }
    registry.activate(base.id);
    const lease = registry.activateScoped(scoped.id);
    registry.activate(direct.id);
    events.splice(0, events.length);

    lease.dispose();

    expect(registry.active()).toBe(direct);
    expect(events).toEqual([]);
  });

  it("disposes the active lifecycle once and leaves existing leases safe to dispose", () => {
    const events: string[] = [];
    const tool = recordingTool("tool", events);
    const registry = createToolRegistry(context, (current, next) => {
      events.push(`cancel:${current?.id ?? "none"}->${next?.id ?? "none"}`);
    });
    registry.register(tool);
    const lease = registry.activateScoped(tool.id);
    events.splice(0, events.length);

    registry.dispose();
    registry.dispose();
    lease.dispose();

    expect(events).toEqual(["cancel:tool->none", "deactivate:tool"]);
    expect(registry.active()).toBeNull();
    expect(() => registry.register(tool)).toThrow("Tool registry is disposed");
    expect(() => registry.activate(tool.id)).toThrow("Tool registry is disposed");
  });
});
