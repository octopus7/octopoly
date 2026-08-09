import type {
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  ReversibleChange,
  Unsubscribe,
} from "@octopoly/contracts";

interface Entry {
  readonly label: string;
  readonly changes: ReadonlyArray<ReversibleChange>;
}

export class PaintHistoryFake implements HistoryService {
  readonly #undo: Entry[] = [];
  readonly #redo: Entry[] = [];
  readonly #listeners = new Set<(snapshot: HistorySnapshot) => void>();

  begin(label: string): HistoryTransaction {
    const changes: ReversibleChange[] = [];
    let closed = false;
    const assertOpen = (): void => {
      if (closed) throw new Error("history transaction closed");
    };
    return {
      label,
      recordApplied: (change) => {
        assertOpen();
        changes.push(change);
      },
      commit: () => {
        assertOpen();
        closed = true;
        if (changes.length > 0) {
          this.#undo.push({ label, changes: Object.freeze([...changes]) });
          this.#redo.splice(0, this.#redo.length);
        }
        this.#publish();
      },
      rollback: () => {
        assertOpen();
        closed = true;
        for (const change of [...changes].reverse()) change.revert();
        this.#publish();
      },
    };
  }

  undo(): void {
    const entry = this.#undo.pop();
    if (entry === undefined) return;
    for (const change of [...entry.changes].reverse()) change.revert();
    this.#redo.push(entry);
    this.#publish();
  }

  redo(): void {
    const entry = this.#redo.pop();
    if (entry === undefined) return;
    for (const change of entry.changes) change.apply();
    this.#undo.push(entry);
    this.#publish();
  }

  clear(): void {
    for (const entry of [...this.#undo, ...this.#redo]) {
      for (const change of entry.changes) change.dispose?.();
    }
    this.#undo.splice(0, this.#undo.length);
    this.#redo.splice(0, this.#redo.length);
    this.#publish();
  }

  snapshot(): HistorySnapshot {
    const undo = this.#undo.at(-1);
    const redo = this.#redo.at(-1);
    return Object.freeze({
      canUndo: undo !== undefined,
      canRedo: redo !== undefined,
      ...(undo === undefined ? {} : { undoLabel: undo.label }),
      ...(redo === undefined ? {} : { redoLabel: redo.label }),
    });
  }

  subscribe(listener: (snapshot: HistorySnapshot) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #publish(): void {
    const snapshot = this.snapshot();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }
}
