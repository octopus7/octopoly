import { describe, expect, it } from "vitest";

import type {
  MeshElementSet,
  MeshPatch,
  ReversibleChange,
} from "@octopoly/contracts";
import { createHistoryService } from "../../src/history/history-service";

interface FakeMeshState {
  version: number;
}

class FakeMeshPatch implements MeshPatch {
  readonly affected: MeshElementSet;
  disposeCount = 0;
  private state: "applied" | "reverted" = "applied";
  private disposed = false;

  constructor(
    readonly id: string,
    readonly label: string,
    readonly beforeVersion: number,
    readonly afterVersion: number,
    private readonly mesh: FakeMeshState,
    private readonly events: string[],
  ) {
    this.affected = Object.freeze({ vertices: Object.freeze([afterVersion]) });
  }

  apply(): void {
    this.assertTransition("reverted", this.beforeVersion);
    this.state = "applied";
    this.mesh.version = this.afterVersion;
    this.events.push(`apply:${this.id}`);
  }

  revert(): void {
    this.assertTransition("applied", this.afterVersion);
    this.state = "reverted";
    this.mesh.version = this.beforeVersion;
    this.events.push(`revert:${this.id}`);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeCount += 1;
  }

  private assertTransition(
    expectedState: "applied" | "reverted",
    expectedVersion: number,
  ): void {
    if (this.disposed) {
      throw new Error(`Patch ${this.id} is disposed.`);
    }
    if (this.state !== expectedState || this.mesh.version !== expectedVersion) {
      throw new Error(`Patch ${this.id} has an invalid lifecycle.`);
    }
  }
}

function executeFakePatch(
  mesh: FakeMeshState,
  id: string,
  events: string[],
): FakeMeshPatch {
  const beforeVersion = mesh.version;
  const afterVersion = beforeVersion + 1;
  mesh.version = afterVersion;
  return new FakeMeshPatch(
    id,
    "Add stroke segment",
    beforeVersion,
    afterVersion,
    mesh,
    events,
  );
}

interface FakeTransformState {
  value: number;
}

class FakeTransformChange implements ReversibleChange {
  disposeCount = 0;
  private state: "applied" | "reverted" = "applied";
  private disposed = false;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly before: number,
    private readonly after: number,
    private readonly transform: FakeTransformState,
    private readonly events: string[],
  ) {}

  apply(): void {
    this.assertTransition("reverted", this.before);
    this.state = "applied";
    this.transform.value = this.after;
    this.events.push(`apply:${this.id}`);
  }

  revert(): void {
    this.assertTransition("applied", this.after);
    this.state = "reverted";
    this.transform.value = this.before;
    this.events.push(`revert:${this.id}`);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeCount += 1;
  }

  private assertTransition(
    expectedState: "applied" | "reverted",
    expectedValue: number,
  ): void {
    if (this.disposed) {
      throw new Error(`Change ${this.id} is disposed.`);
    }
    if (this.state !== expectedState || this.transform.value !== expectedValue) {
      throw new Error(`Change ${this.id} has an invalid lifecycle.`);
    }
  }
}

function applyFakeTransform(
  transform: FakeTransformState,
  id: string,
  delta: number,
  events: string[],
): FakeTransformChange {
  const before = transform.value;
  const after = before + delta;
  transform.value = after;
  return new FakeTransformChange(
    id,
    "Move selection",
    before,
    after,
    transform,
    events,
  );
}

describe("history transaction grouping", () => {
  it("groups a multi-patch Pencil stroke into one undo/redo entry", () => {
    const history = createHistoryService();
    const mesh: FakeMeshState = { version: 0 };
    const events: string[] = [];
    const transaction = history.begin("Pencil stroke");

    const patches = ["segment-1", "segment-2", "segment-3"].map((id) => {
      const patch = executeFakePatch(mesh, id, events);
      transaction.recordApplied(patch);
      return patch;
    });
    events.length = 0;
    transaction.commit();

    expect(mesh.version).toBe(3);
    expect(history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Pencil stroke",
    });

    history.undo();

    expect(mesh.version).toBe(0);
    expect(events).toEqual([
      "revert:segment-3",
      "revert:segment-2",
      "revert:segment-1",
    ]);
    expect(history.snapshot()).toEqual({
      canUndo: false,
      canRedo: true,
      redoLabel: "Pencil stroke",
    });

    events.length = 0;
    history.redo();

    expect(mesh.version).toBe(3);
    expect(events).toEqual([
      "apply:segment-1",
      "apply:segment-2",
      "apply:segment-3",
    ]);
    expect(patches.map((patch) => patch.disposeCount)).toEqual([0, 0, 0]);
  });

  it("groups a transform drag and round trips its applied changes", () => {
    const history = createHistoryService();
    const transform: FakeTransformState = { value: 0 };
    const events: string[] = [];
    const transaction = history.begin("Transform drag");

    for (const [id, delta] of [
      ["drag-1", 1],
      ["drag-2", 2],
      ["drag-3", 3],
    ] as const) {
      transaction.recordApplied(applyFakeTransform(transform, id, delta, events));
    }
    events.length = 0;
    transaction.commit();

    history.undo();
    expect(transform.value).toBe(0);
    expect(events).toEqual(["revert:drag-3", "revert:drag-2", "revert:drag-1"]);

    events.length = 0;
    history.redo();
    expect(transform.value).toBe(6);
    expect(events).toEqual(["apply:drag-1", "apply:drag-2", "apply:drag-3"]);
    expect(history.snapshot().undoLabel).toBe("Transform drag");
  });

  it("rolls back a canceled drag without changing the existing redo branch", () => {
    const history = createHistoryService();
    const transform: FakeTransformState = { value: 0 };
    const events: string[] = [];

    const seed = history.begin("Seed transform");
    seed.recordApplied(applyFakeTransform(transform, "seed", 10, events));
    seed.commit();
    history.undo();
    expect(transform.value).toBe(0);
    expect(history.snapshot().redoLabel).toBe("Seed transform");

    events.length = 0;
    const canceled = history.begin("Canceled transform drag");
    const canceledChanges = [
      applyFakeTransform(transform, "cancel-1", 1, events),
      applyFakeTransform(transform, "cancel-2", 2, events),
      applyFakeTransform(transform, "cancel-3", 3, events),
    ];
    for (const change of canceledChanges) {
      canceled.recordApplied(change);
    }
    events.length = 0;

    canceled.rollback();

    expect(transform.value).toBe(0);
    expect(events).toEqual([
      "revert:cancel-3",
      "revert:cancel-2",
      "revert:cancel-1",
    ]);
    expect(history.snapshot()).toEqual({
      canUndo: false,
      canRedo: true,
      redoLabel: "Seed transform",
    });
    expect(canceledChanges.map((change) => change.disposeCount)).toEqual([1, 1, 1]);

    history.redo();
    expect(transform.value).toBe(10);
  });

  it("rejects nested begin without disturbing the active transaction", () => {
    const history = createHistoryService();
    const active = history.begin("Outer gesture");

    expect(() => history.begin("Nested gesture")).toThrow(/already active/i);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
    expect(() => active.rollback()).not.toThrow();
  });
});
