import { describe, expect, it, vi } from "vitest";

import type { Disposable, Tool, ToolRegistry } from "@octopoly/contracts";
import { ToolPalette } from "../../src/ui";

function registryFor(tools: ReadonlyArray<Tool>) {
  let active: Tool | null = null;
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const register = vi.fn();
  const registry: ToolRegistry = {
    register,
    unregister: vi.fn(),
    activate: vi.fn((id: string) => {
      const tool = byId.get(id);
      if (tool === undefined) throw new Error(`missing tool: ${id}`);
      active = tool;
    }),
    activateScoped: vi.fn((_id: string): Disposable => ({ dispose: vi.fn() })),
    active: () => active,
    dispose: vi.fn(),
  };
  return { register, registry };
}

describe("ToolPalette", () => {
  it("renders callbacks into ToolRegistry without owning or registering tools", () => {
    const tools: ReadonlyArray<Tool> = [{ id: "basic.select" }, { id: "vertex.create" }];
    const { register, registry } = registryFor(tools);
    const container = document.createElement("div");
    const palette = new ToolPalette(container, registry);

    palette.setTools(tools);
    const button = palette.element.querySelector<HTMLButtonElement>(
      '[data-tool-id="vertex.create"]',
    );
    button?.click();

    expect(registry.activate).toHaveBeenCalledWith("vertex.create");
    expect(register).not.toHaveBeenCalled();
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(palette.element.querySelector("canvas")).toBeNull();
  });

  it("rejects duplicate presentation ids and removes DOM on dispose", () => {
    const tools: ReadonlyArray<Tool> = [{ id: "basic.select" }];
    const { registry } = registryFor(tools);
    const container = document.createElement("div");
    const palette = new ToolPalette(container, registry);

    expect(() => palette.setTools([tools[0]!, tools[0]!])).toThrow(/duplicate/);
    palette.dispose();
    palette.dispose();

    expect(container.childElementCount).toBe(0);
    expect(() => palette.refresh()).toThrow(/disposed/);
  });
});
