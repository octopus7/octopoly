import type {
  HistoryService,
  HistoryTransaction,
  ImageAssetRef,
  ImageEditSession,
  ImageMutationResult,
  ImageRect,
  ImageRevisionChange,
  ImageTileUpdate,
} from "@octopoly/contracts";

const DEFAULT_LABEL = "Texture Paint Stroke";

class PreparedSessionAwareImageChange implements ImageRevisionChange {
  readonly id: string;
  readonly label: string;
  readonly assetId: string;
  readonly before: ImageAssetRef;
  readonly after: ImageAssetRef;
  readonly #change: ImageRevisionChange;
  readonly #beforeTransition: () => void;
  #disposed = false;

  constructor(change: ImageRevisionChange, beforeTransition: () => void) {
    this.#change = change;
    this.#beforeTransition = beforeTransition;
    this.id = change.id;
    this.label = change.label;
    this.assetId = change.assetId;
    this.before = change.before;
    this.after = change.after;
  }

  apply(): void {
    this.#assertUsable();
    this.#beforeTransition();
    this.#change.apply();
  }

  revert(): void {
    this.#assertUsable();
    this.#beforeTransition();
    this.#change.revert();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#change.dispose?.();
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Texture paint history change is disposed");
  }
}

/** Coordinates one synchronous image edit with exactly one history entry. */
export class PaintSession {
  readonly base: ImageAssetRef;
  readonly label: string;
  readonly #edit: ImageEditSession;
  readonly #transaction: HistoryTransaction;
  readonly #beforeHistoryTransition: () => void;
  readonly #dirty: ImageRect[] = [];
  #closed = false;

  static begin(
    edit: ImageEditSession,
    history: HistoryService,
    label = DEFAULT_LABEL,
    beforeHistoryTransition: () => void = () => {},
  ): PaintSession {
    if (label.trim().length === 0) {
      throw new Error("Paint history label must not be empty");
    }
    return new PaintSession(edit, history.begin(label), label, beforeHistoryTransition);
  }

  private constructor(
    edit: ImageEditSession,
    transaction: HistoryTransaction,
    label: string,
    beforeHistoryTransition: () => void,
  ) {
    this.#edit = edit;
    this.#transaction = transaction;
    this.base = edit.base;
    this.label = label;
    this.#beforeHistoryTransition = beforeHistoryTransition;
  }

  current(): ImageAssetRef {
    this.#assertOpen();
    return this.#edit.current();
  }

  write(update: ImageTileUpdate): ImageAssetRef {
    this.#assertOpen();
    const ref = this.#edit.write(update);
    this.#dirty.push(Object.freeze({
      x: update.x,
      y: update.y,
      width: update.width,
      height: update.height,
    }));
    return ref;
  }

  dirtyTiles(): ReadonlyArray<ImageRect> {
    return Object.freeze([...this.#dirty]);
  }

  commit(): ImageMutationResult | null {
    this.#assertOpen();
    if (this.#dirty.length === 0) {
      this.#edit.cancel();
      this.#transaction.rollback();
      this.#closed = true;
      return null;
    }

    let result: ImageMutationResult;
    try {
      result = this.#edit.commit(this.label);
    } catch (error) {
      try {
        this.#edit.cancel();
      } catch {
        // Preserve the commit failure after attempting both cleanup paths.
      }
      try {
        this.#transaction.rollback();
      } catch {
        // Preserve the commit failure.
      }
      this.#closed = true;
      throw error;
    }
    const historyChange = new PreparedSessionAwareImageChange(
      result.change,
      this.#beforeHistoryTransition,
    );
    let recorded = false;
    try {
      this.#transaction.recordApplied(historyChange);
      recorded = true;
      this.#transaction.commit();
      this.#closed = true;
      return result;
    } catch (error) {
      if (recorded) {
        try {
          this.#transaction.rollback();
        } catch {
          // A valid public HistoryTransaction must rollback recorded changes.
        }
      } else {
        try {
          result.change.revert();
        } finally {
          historyChange.dispose();
        }
        try {
          this.#transaction.rollback();
        } catch {
          // Preserve the original transaction failure.
        }
      }
      this.#closed = true;
      throw error;
    }
  }

  cancel(): void {
    if (this.#closed) {
      return;
    }
    let firstError: unknown;
    try {
      this.#edit.cancel();
    } catch (error) {
      firstError = error;
    }
    try {
      this.#transaction.rollback();
    } catch (error) {
      firstError ??= error;
    }
    this.#closed = true;
    if (firstError !== undefined) {
      throw firstError;
    }
  }

  dispose(): void {
    this.cancel();
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("Paint session is closed");
    }
  }
}
