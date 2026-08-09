import type { ReversibleChange } from "@octopoly/contracts";

import { ChangeLifecycle } from "./change-lifecycle";

/**
 * One history entry composed from already-applied reversible changes.
 */
export class CompositeHistoryEntry implements ReversibleChange {
  readonly id: string;
  readonly label: string;
  readonly changes: ReadonlyArray<ReversibleChange>;

  readonly #lifecycle: ChangeLifecycle;
  #disposed = false;

  constructor(
    id: string,
    label: string,
    changes: ReadonlyArray<ReversibleChange>,
    lifecycle: ChangeLifecycle,
  ) {
    lifecycle.assertUsable(changes);

    this.id = id;
    this.label = label;
    this.changes = Object.freeze([...changes]);
    this.#lifecycle = lifecycle;
  }

  apply(): void {
    this.#assertUsable();

    for (const change of this.changes) {
      change.apply();
    }
  }

  revert(): void {
    this.#assertUsable();

    for (let index = this.changes.length - 1; index >= 0; index -= 1) {
      this.changes[index]!.revert();
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#lifecycle.disposeAll(this.changes);
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error(`History entry "${this.id}" has been disposed`);
    }

    // Preflight every child before invoking any apply/revert side effect.
    this.#lifecycle.assertUsable(this.changes);
  }
}
