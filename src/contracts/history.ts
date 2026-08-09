import type { Unsubscribe } from "./fundamental";
import type { ReversibleChange } from "./mesh";

export interface HistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
}

export interface HistoryTransaction {
  readonly label: string;
  recordApplied(change: ReversibleChange): void;
  commit(): void;
  rollback(): void;
}

export interface HistoryService {
  begin(label: string): HistoryTransaction;
  undo(): void;
  redo(): void;
  clear(): void;
  snapshot(): HistorySnapshot;
  subscribe(listener: (snapshot: HistorySnapshot) => void): Unsubscribe;
}
