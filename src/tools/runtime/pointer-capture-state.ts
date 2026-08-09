/**
 * Tracks the one pointer currently owned by the tool runtime.
 *
 * This is logical capture only. DOM pointer capture remains the responsibility
 * of the normalized input adapter.
 */
export class PointerCaptureState {
  private pointerId: number | null = null;

  capturedPointerId(): number | null {
    return this.pointerId;
  }

  owns(pointerId: number): boolean {
    return this.pointerId === pointerId;
  }

  /**
   * Captures an unowned pointer or confirms ownership of the same pointer.
   * A foreign pointer cannot replace the current owner.
   */
  capture(pointerId: number): boolean {
    if (this.pointerId === null) {
      this.pointerId = pointerId;
      return true;
    }

    return this.pointerId === pointerId;
  }

  /** Releases only when the supplied pointer owns the logical capture. */
  release(pointerId: number): boolean {
    if (!this.owns(pointerId)) {
      return false;
    }

    this.pointerId = null;
    return true;
  }

  /**
   * Clears capture without needing a pointer sample and returns the old owner.
   * Tool switches, unregister, deactivate, and disposal can use this boundary.
   */
  reset(): number | null {
    const releasedPointerId = this.pointerId;
    this.pointerId = null;
    return releasedPointerId;
  }
}
