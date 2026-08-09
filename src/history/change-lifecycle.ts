import type { ReversibleChange } from "@octopoly/contracts";

/**
 * Coordinates ownership of reversible changes within one history service.
 *
 * A service should share one lifecycle across every entry and transaction it
 * owns. Disposal is tracked by object identity so overlapping cleanup paths
 * cannot invoke a change's optional disposer more than once.
 */
export class ChangeLifecycle {
  readonly #disposedChanges = new WeakSet<ReversibleChange>();

  /**
   * Verifies an entire operation before any of its changes are mutated.
   */
  assertUsable(changes: ReadonlyArray<ReversibleChange>): void {
    for (const change of changes) {
      if (this.#disposedChanges.has(change)) {
        throw new Error(`Reversible change "${change.id}" has been disposed`);
      }
    }
  }

  /**
   * Releases one service-owned change, invoking its disposer at most once.
   */
  dispose(change: ReversibleChange): void {
    if (this.#disposedChanges.has(change)) {
      return;
    }

    this.#disposedChanges.add(change);
    change.dispose?.();
  }

  /**
   * Releases changes in their supplied order, deduplicated by identity.
   */
  disposeAll(changes: ReadonlyArray<ReversibleChange>): void {
    for (const change of changes) {
      this.dispose(change);
    }
  }
}
