import { describe, expect, it } from "vitest";

import type {
  HistoryTransaction,
  ReversibleChange,
} from "@octopoly/contracts";
import {
  HistoryTransactionImpl,
  type HistoryTransactionHost,
} from "../../src/history/history-transaction";

class FakeChange implements ReversibleChange {
  applyCount = 0;
  revertCount = 0;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly events: string[] = [],
  ) {}

  apply(): void {
    this.applyCount += 1;
    this.events.push(`apply:${this.id}`);
  }

  revert(): void {
    this.revertCount += 1;
    this.events.push(`revert:${this.id}`);
  }
}

class FakeHost implements HistoryTransactionHost {
  active: HistoryTransaction | null = null;
  readonly events: string[] = [];
  committedChanges: ReadonlyArray<ReversibleChange> | null = null;
  rolledBackChanges: ReadonlyArray<ReversibleChange> | null = null;

  constructor(private readonly sharedEvents?: string[]) {}

  assertActiveTransaction(transaction: HistoryTransaction): void {
    this.recordEvent("host:assert-active");
    if (this.active !== transaction) {
      throw new Error("Transaction is not active.");
    }
  }

  commitTransaction(
    transaction: HistoryTransaction,
    changes: ReadonlyArray<ReversibleChange>,
  ): void {
    if (this.active !== transaction) {
      throw new Error("Transaction is not active.");
    }
    this.recordEvent("host:commit");
    this.committedChanges = changes;
    this.active = null;
  }

  rollbackTransaction(
    transaction: HistoryTransaction,
    changes: ReadonlyArray<ReversibleChange>,
  ): void {
    if (this.active !== transaction) {
      throw new Error("Transaction is not active.");
    }
    this.recordEvent("host:rollback");
    this.rolledBackChanges = changes;
    this.active = null;
  }

  private recordEvent(event: string): void {
    this.events.push(event);
    this.sharedEvents?.push(event);
  }
}

function createActiveTransaction(
  label = "Pencil stroke",
  events?: string[],
): { readonly transaction: HistoryTransactionImpl; readonly host: FakeHost } {
  const host = new FakeHost(events);
  const transaction = new HistoryTransactionImpl(label, host);
  host.active = transaction;
  return { transaction, host };
}

describe("HistoryTransactionImpl", () => {
  it("records an already-applied change without applying it again", () => {
    const { transaction, host } = createActiveTransaction();
    const change = new FakeChange("point-1", "Create point");

    transaction.recordApplied(change);

    expect(change.applyCount).toBe(0);
    expect(change.revertCount).toBe(0);
    expect(host.events).toEqual([]);
  });

  it("commits one frozen registration-order change collection to the host", () => {
    const { transaction, host } = createActiveTransaction();
    const changes = [
      new FakeChange("point-1", "Create point"),
      new FakeChange("point-2", "Create point"),
      new FakeChange("face-1", "Create face"),
    ];
    for (const change of changes) {
      transaction.recordApplied(change);
    }

    transaction.commit();

    expect(host.events).toEqual(["host:assert-active", "host:commit"]);
    expect(host.committedChanges).toEqual(changes);
    expect(Object.isFrozen(host.committedChanges)).toBe(true);
    expect(changes.map((change) => change.applyCount)).toEqual([0, 0, 0]);
    expect(changes.map((change) => change.revertCount)).toEqual([0, 0, 0]);
  });

  it("rolls back in reverse order before notifying the host", () => {
    const events: string[] = [];
    const { transaction, host } = createActiveTransaction("Transform drag", events);
    const changes = [
      new FakeChange("drag-1", "Move vertices", events),
      new FakeChange("drag-2", "Move vertices", events),
      new FakeChange("drag-3", "Move vertices", events),
    ];
    for (const change of changes) {
      transaction.recordApplied(change);
    }

    transaction.rollback();

    expect(events).toEqual([
      "host:assert-active",
      "revert:drag-3",
      "revert:drag-2",
      "revert:drag-1",
      "host:rollback",
    ]);
    expect(host.rolledBackChanges).toEqual(changes);
    expect(Object.isFrozen(host.rolledBackChanges)).toBe(true);
  });

  it("rejects every closed transaction reuse before any side effect", () => {
    const { transaction, host } = createActiveTransaction();
    const recorded = new FakeChange("point-1", "Create point");
    const late = new FakeChange("point-2", "Create point");
    transaction.recordApplied(recorded);
    transaction.commit();
    const hostEventsAfterClose = [...host.events];

    expect(() => transaction.recordApplied(late)).toThrow(/closed/i);
    expect(() => transaction.commit()).toThrow(/closed/i);
    expect(() => transaction.rollback()).toThrow(/closed/i);

    expect(host.events).toEqual(hostEventsAfterClose);
    expect(late.applyCount).toBe(0);
    expect(late.revertCount).toBe(0);
    expect(recorded.revertCount).toBe(0);
  });

  it("leaves the transaction and changes untouched when host preflight fails", () => {
    const { transaction, host } = createActiveTransaction();
    const change = new FakeChange("point-1", "Create point");
    transaction.recordApplied(change);
    host.active = null;

    expect(() => transaction.rollback()).toThrow(/not active/i);
    expect(change.revertCount).toBe(0);
    expect(host.rolledBackChanges).toBeNull();

    host.active = transaction;
    expect(() => transaction.rollback()).not.toThrow();
    expect(change.revertCount).toBe(1);
  });

  it("closes and reports an empty transaction without inventing a change", () => {
    const { transaction, host } = createActiveTransaction("Empty gesture");

    transaction.commit();

    expect(host.committedChanges).toEqual([]);
    expect(() => transaction.commit()).toThrow(/closed/i);
  });
});
