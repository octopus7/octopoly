import type {
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  ReversibleChange,
  Unsubscribe,
} from "@octopoly/contracts";

import { ChangeLifecycle } from "./change-lifecycle";
import { CompositeHistoryEntry } from "./composite-entry";
import { HistoryStack } from "./history-stack";
import {
  HistoryTransactionImpl,
  type HistoryTransactionHost,
} from "./history-transaction";

export class HistoryServiceImpl implements HistoryService, HistoryTransactionHost {
  readonly #stack = new HistoryStack();
  readonly #lifecycle = new ChangeLifecycle();
  readonly #listeners = new Set<(snapshot: HistorySnapshot) => void>();

  #activeTransaction: HistoryTransactionImpl | null = null;
  #nextEntryId = 1n;
  #clearing = false;

  begin(label: string): HistoryTransaction {
    if (this.#activeTransaction !== null) {
      throw new Error("A history transaction is already active");
    }

    const transaction = new HistoryTransactionImpl(label, this);
    this.#activeTransaction = transaction;
    return transaction;
  }

  undo(): void {
    this.#assertNoActiveTransaction("undo");
    this.#stack.undo();
    this.#publish();
  }

  redo(): void {
    this.#assertNoActiveTransaction("redo");
    this.#stack.redo();
    this.#publish();
  }

  clear(): void {
    this.#clearing = true;
    try {
      this.#activeTransaction?.rollback();
      this.#stack.clear();
    } finally {
      this.#clearing = false;
    }
    this.#publish();
  }

  snapshot(): HistorySnapshot {
    return this.#stack.snapshot();
  }

  subscribe(listener: (snapshot: HistorySnapshot) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  assertActiveTransaction(transaction: HistoryTransaction): void {
    if (transaction !== this.#activeTransaction) {
      throw new Error("History transaction is not active");
    }
  }

  commitTransaction(
    transaction: HistoryTransaction,
    changes: ReadonlyArray<ReversibleChange>,
  ): void {
    this.assertActiveTransaction(transaction);

    try {
      if (changes.length > 0) {
        const entry = new CompositeHistoryEntry(
          this.#createEntryId(),
          transaction.label,
          changes,
          this.#lifecycle,
        );
        this.#stack.record(entry);
      }
    } finally {
      this.#activeTransaction = null;
    }
    this.#publishUnlessClearing();
  }

  rollbackTransaction(
    transaction: HistoryTransaction,
    changes: ReadonlyArray<ReversibleChange>,
  ): void {
    this.assertActiveTransaction(transaction);

    try {
      this.#lifecycle.disposeAll(changes);
    } finally {
      this.#activeTransaction = null;
    }
    this.#publishUnlessClearing();
  }

  #assertNoActiveTransaction(operation: "undo" | "redo"): void {
    if (this.#activeTransaction !== null) {
      throw new Error(`Cannot ${operation} while a history transaction is active`);
    }
  }

  #createEntryId(): string {
    const id = `history-entry:${this.#nextEntryId}`;
    this.#nextEntryId += 1n;
    return id;
  }

  #publishUnlessClearing(): void {
    if (!this.#clearing) {
      this.#publish();
    }
  }

  #publish(): void {
    const snapshot = this.#stack.snapshot();
    for (const listener of [...this.#listeners]) {
      listener(snapshot);
    }
  }
}

export function createHistoryService(): HistoryService {
  return new HistoryServiceImpl();
}
