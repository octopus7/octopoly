import { describe, expect, it, vi } from "vitest";

import type { ExtensionPanel, ExtensionPanelContext } from "@octopoly/contracts";
import { DefaultPanelRegistry } from "../../src/ui";

function panel(id: string): ExtensionPanel {
  return {
    id,
    title: id,
    mount: vi.fn((_container: HTMLElement, _context: ExtensionPanelContext) => {}),
    dispose: vi.fn(),
  };
}

describe("DefaultPanelRegistry", () => {
  it("registers, retrieves, unregisters, and disposes a panel exactly once", () => {
    const registry = new DefaultPanelRegistry();
    const first = panel("properties");

    registry.register(first);
    expect(registry.get("properties")).toBe(first);
    expect(() => registry.register(panel("properties"))).toThrow(/already registered/);

    registry.unregister("properties");
    registry.unregister("properties");
    registry.dispose();
    registry.dispose();

    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes every owned panel and rejects use after disposal", () => {
    const registry = new DefaultPanelRegistry();
    const first = panel("first");
    const second = panel("second");
    registry.register(first);
    registry.register(second);

    registry.dispose();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(() => registry.get("first")).toThrow(/disposed/);
    expect(() => registry.register(panel("third"))).toThrow(/disposed/);
  });

  it("attempts every owned disposal even when one panel fails", () => {
    const registry = new DefaultPanelRegistry();
    const first = panel("first");
    const second = panel("second");
    vi.mocked(first.dispose).mockImplementationOnce(() => {
      throw new Error("first failed");
    });
    registry.register(first);
    registry.register(second);

    expect(() => registry.dispose()).toThrow("first failed");
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(() => registry.dispose()).not.toThrow();
  });
});
