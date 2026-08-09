import type {
  HistoryService,
  HistoryTransaction,
  ReversibleChange,
  ToolContext,
  ToolPreview,
} from "@octopoly/contracts";

type ManagedTransactionState = "open" | "commit-requested" | "committed" | "rolled-back";

class ManagedHistoryTransaction implements HistoryTransaction {
  private transactionState: ManagedTransactionState = "open";

  constructor(private readonly transaction: HistoryTransaction) {}

  get label(): string {
    return this.transaction.label;
  }

  recordApplied(change: ReversibleChange): void {
    this.assertOpen();
    this.transaction.recordApplied(change);
  }

  commit(): void {
    this.assertOpen();
    this.transactionState = "commit-requested";
  }

  rollback(): void {
    this.assertOpen();
    this.transaction.rollback();
    this.transactionState = "rolled-back";
  }

  commitFromRuntime(): void {
    if (this.transactionState === "rolled-back" || this.transactionState === "committed") {
      return;
    }

    this.transaction.commit();
    this.transactionState = "committed";
  }

  rollbackFromRuntime(): void {
    if (this.transactionState === "rolled-back") {
      return;
    }
    if (this.transactionState === "committed") {
      throw new Error("cannot roll back a committed tool transaction");
    }

    this.transaction.rollback();
    this.transactionState = "rolled-back";
  }

  private assertOpen(): void {
    if (this.transactionState !== "open") {
      throw new Error("tool transaction is closed");
    }
  }
}

/**
 * Wraps a ToolContext so a gesture has at most one runtime-owned history entry
 * and every preview update remains visible to the runtime.
 */
export class TransactionCoordinator {
  private readonly wrappedHistory: HistoryService;
  private readonly wrappedToolContext: ToolContext;
  private gestureActive = false;
  private transaction: ManagedHistoryTransaction | null = null;
  private currentPreview: ToolPreview | null = null;

  constructor(private readonly sourceContext: ToolContext) {
    this.wrappedHistory = {
      begin: (label) => this.beginTransaction(label),
      undo: () => this.sourceContext.history.undo(),
      redo: () => this.sourceContext.history.redo(),
      clear: () => this.sourceContext.history.clear(),
      snapshot: () => this.sourceContext.history.snapshot(),
      subscribe: (listener) => this.sourceContext.history.subscribe(listener),
    };

    this.wrappedToolContext = {
      mesh: sourceContext.mesh,
      mutations: sourceContext.mutations,
      selection: sourceContext.selection,
      history: this.wrappedHistory,
      surface: sourceContext.surface,
      getCamera: () => this.sourceContext.getCamera(),
      getViewport: () => this.sourceContext.getViewport(),
      setPreview: (preview) => this.setPreview(preview),
      requestRender: () => this.sourceContext.requestRender(),
    };
  }

  context(): ToolContext {
    return this.wrappedToolContext;
  }

  beginGesture(): void {
    if (this.gestureActive) {
      throw new Error("a tool gesture is already active");
    }

    this.gestureActive = true;
    this.transaction = null;
  }

  commitGesture(): void {
    if (!this.gestureActive) {
      return;
    }

    this.transaction?.commitFromRuntime();
    this.gestureActive = false;
    this.transaction = null;
  }

  rollbackGesture(): void {
    if (!this.gestureActive && this.transaction === null) {
      return;
    }

    try {
      this.transaction?.rollbackFromRuntime();
    } finally {
      this.gestureActive = false;
      this.transaction = null;
    }
  }

  clearPreview(): void {
    try {
      this.sourceContext.setPreview(null);
    } finally {
      this.currentPreview = null;
    }
  }

  preview(): ToolPreview | null {
    return this.currentPreview;
  }

  previewRevision(): number | null {
    return this.currentPreview?.revision ?? null;
  }

  isGestureActive(): boolean {
    return this.gestureActive;
  }

  hasTransaction(): boolean {
    return this.transaction !== null;
  }

  private beginTransaction(label: string): HistoryTransaction {
    if (!this.gestureActive) {
      throw new Error("tool history transactions require an active gesture");
    }
    if (this.transaction !== null) {
      throw new Error("a tool gesture can open at most one history transaction");
    }

    const transaction = new ManagedHistoryTransaction(this.sourceContext.history.begin(label));
    this.transaction = transaction;
    return transaction;
  }

  private setPreview(preview: ToolPreview | null): void {
    this.sourceContext.setPreview(preview);
    this.currentPreview = preview;
  }
}
