import type { Disposable, Tool, ToolContext, ToolRegistry } from "@octopoly/contracts";

import { ToolLifecycle, type BeforeToolTransition } from "./tool-lifecycle";

interface ScopedActivation {
  readonly id: string;
  disposed: boolean;
}

export class ToolRegistryImpl implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly lifecycle: ToolLifecycle;
  private readonly scopes: ScopedActivation[] = [];
  private baseId: string | null = null;
  private disposed = false;

  constructor(context: ToolContext, beforeTransition?: BeforeToolTransition) {
    this.lifecycle = new ToolLifecycle(context, beforeTransition);
  }

  register(tool: Tool): void {
    this.assertUsable();
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered`);
    }

    this.tools.set(tool.id, tool);
  }

  unregister(id: string): void {
    this.assertUsable();
    this.requireTool(id);
    const nextBaseId = this.baseId === id ? null : this.baseId;
    const nextScopes = this.scopes.filter((scope) => scope.id !== id);
    const next = this.resolveSelection(nextBaseId, nextScopes);

    if (this.lifecycle.active() !== next) {
      this.transitionTo(next);
    }

    this.baseId = nextBaseId;
    this.scopes.splice(0, this.scopes.length, ...nextScopes);
    this.tools.delete(id);

  }

  activate(id: string): void {
    this.assertUsable();
    const tool = this.requireTool(id);

    this.lifecycle.activate(tool);
    this.baseId = id;
    this.scopes.splice(0, this.scopes.length);
  }

  activateScoped(id: string): Disposable {
    this.assertUsable();
    const tool = this.requireTool(id);
    const scope: ScopedActivation = { id, disposed: false };

    if (this.lifecycle.active() === tool) {
      this.lifecycle.interrupt();
    } else {
      this.lifecycle.activate(tool);
    }
    this.scopes.push(scope);

    return {
      dispose: () => {
        this.disposeScope(scope);
      },
    };
  }

  active(): Tool | null {
    return this.lifecycle.active();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    try {
      this.lifecycle.dispose();
    } finally {
      this.baseId = null;
      this.scopes.splice(0, this.scopes.length);
      this.tools.clear();
    }
  }

  private disposeScope(scope: ScopedActivation): void {
    if (scope.disposed) {
      return;
    }

    if (this.disposed) {
      scope.disposed = true;
      return;
    }

    const index = this.scopes.indexOf(scope);
    if (index < 0) {
      scope.disposed = true;
      return;
    }

    if (index === this.scopes.length - 1) {
      const remaining = this.scopes.slice(0, index);
      const next = this.resolveSelection(this.baseId, remaining);
      if (this.lifecycle.active() !== next) {
        this.transitionTo(next);
      }
    }

    this.scopes.splice(index, 1);
    scope.disposed = true;
  }

  private resolveSelection(baseId: string | null, scopes: ReadonlyArray<ScopedActivation>): Tool | null {
    const scopedId = scopes.at(-1)?.id;
    const selectedId = scopedId ?? baseId;
    if (selectedId === null) {
      return null;
    }

    return this.tools.get(selectedId) ?? null;
  }

  private transitionTo(tool: Tool | null): void {
    if (tool === null) {
      this.lifecycle.deactivate();
      return;
    }

    this.lifecycle.activate(tool);
  }

  private requireTool(id: string): Tool {
    const tool = this.tools.get(id);
    if (tool === undefined) {
      throw new Error(`Unknown tool "${id}"`);
    }
    return tool;
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("Tool registry is disposed");
    }
  }
}

export function createToolRegistry(
  context: ToolContext,
  beforeTransition?: BeforeToolTransition,
): ToolRegistry {
  return new ToolRegistryImpl(context, beforeTransition);
}
