import type {
  HistoryTransaction,
  ReversibleChange,
} from "@octopoly/contracts";

/**
 * Service-owned callbacks used to validate and finish a transaction close.
 *
 * `assertActiveTransaction` must be side-effect free. The close callbacks are
 * invoked only after the transaction has become closed, so subscriber
 * re-entry cannot mutate or close the transaction a second time.
 */
export interface HistoryTransactionHost {
  assertActiveTransaction(transaction: HistoryTransaction): void;
  commitTransaction(
    transaction: HistoryTransaction,
    changes: ReadonlyArray<ReversibleChange>,
  ): void;
  rollbackTransaction(
    transaction: HistoryTransaction,
    changes: ReadonlyArray<ReversibleChange>,
  ): void;
}

export class HistoryTransactionImpl implements HistoryTransaction {
  private readonly changes: ReversibleChange[] = [];
  private closed = false;

  constructor(
    readonly label: string,
    private readonly host: HistoryTransactionHost,
  ) {}

  recordApplied(change: ReversibleChange): void {
    this.assertOpen();
    this.changes.push(change);
  }

  commit(): void {
    const changes = this.prepareClose();
    this.host.commitTransaction(this, changes);
  }

  rollback(): void {
    const changes = this.prepareClose();

    for (let index = changes.length - 1; index >= 0; index -= 1) {
      changes[index]?.revert();
    }

    this.host.rollbackTransaction(this, changes);
  }

  private prepareClose(): ReadonlyArray<ReversibleChange> {
    this.assertOpen();
    this.host.assertActiveTransaction(this);

    const changes = Object.freeze([...this.changes]);
    this.closed = true;
    this.changes.length = 0;
    return changes;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("History transaction is closed.");
    }
  }
}
