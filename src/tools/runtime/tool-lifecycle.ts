import type { Tool, ToolContext } from "@octopoly/contracts";

export type BeforeToolTransition = (current: Tool | null, next: Tool | null) => void;

export class ToolLifecycle {
  private current: Tool | null = null;
  private disposed = false;

  constructor(
    private readonly context: ToolContext,
    private readonly beforeTransition: BeforeToolTransition = () => undefined,
  ) {}

  active(): Tool | null {
    return this.current;
  }

  activate(tool: Tool): void {
    this.assertUsable();
    if (this.current === tool) {
      return;
    }

    this.transition(tool);
  }

  interrupt(): void {
    this.assertUsable();
    if (this.current === null) {
      return;
    }

    this.beforeTransition(this.current, this.current);
  }

  deactivate(): void {
    this.assertUsable();
    if (this.current === null) {
      return;
    }

    this.transition(null);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const previous = this.current;
    this.current = null;
    if (previous === null) {
      return;
    }

    let failure: unknown;
    try {
      this.beforeTransition(previous, null);
    } catch (error) {
      failure = error;
    }

    try {
      previous.deactivate?.(this.context);
    } catch (error) {
      failure ??= error;
    }

    if (failure !== undefined) {
      throw failure;
    }
  }

  private transition(next: Tool | null): void {
    const previous = this.current;
    this.beforeTransition(previous, next);

    if (previous !== null) {
      this.current = null;
      previous.deactivate?.(this.context);
    }

    if (next === null) {
      return;
    }

    try {
      next.activate?.(this.context);
      this.current = next;
    } catch (error) {
      this.current = null;
      throw error;
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("Tool lifecycle is disposed");
    }
  }
}
