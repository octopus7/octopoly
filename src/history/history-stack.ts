import type { HistorySnapshot, ReversibleChange } from "@octopoly/contracts";

export class HistoryStack {
  readonly #undoEntries: ReversibleChange[] = [];
  readonly #redoEntries: ReversibleChange[] = [];

  record(entry: ReversibleChange): void {
    const discarded = this.#redoEntries.splice(0);
    this.#undoEntries.push(entry);
    this.#disposeEntries(discarded);
  }

  undo(): boolean {
    const entry = this.#undoEntries.at(-1);
    if (entry === undefined) {
      return false;
    }

    entry.revert();
    this.#undoEntries.pop();
    this.#redoEntries.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.#redoEntries.at(-1);
    if (entry === undefined) {
      return false;
    }

    entry.apply();
    this.#redoEntries.pop();
    this.#undoEntries.push(entry);
    return true;
  }

  clear(): void {
    const entries = [...this.#undoEntries, ...this.#redoEntries];
    this.#undoEntries.length = 0;
    this.#redoEntries.length = 0;
    this.#disposeEntries(entries);
  }

  snapshot(): HistorySnapshot {
    const undoEntry = this.#undoEntries.at(-1);
    const redoEntry = this.#redoEntries.at(-1);

    return Object.freeze({
      canUndo: undoEntry !== undefined,
      canRedo: redoEntry !== undefined,
      ...(undoEntry === undefined ? {} : { undoLabel: undoEntry.label }),
      ...(redoEntry === undefined ? {} : { redoLabel: redoEntry.label }),
    });
  }

  #disposeEntries(entries: ReadonlyArray<ReversibleChange>): void {
    for (const entry of entries) {
      entry.dispose?.();
    }
  }
}
