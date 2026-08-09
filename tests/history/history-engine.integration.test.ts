import type { MeshElementSet, MeshPatch } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { createHistoryService } from "../../src/history";

interface FakeMeshState {
  version: number;
}

class FakeMeshPatch implements MeshPatch {
  readonly affected: MeshElementSet;
  #state: "applied" | "reverted" = "applied";

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
    this.#assertState("reverted", this.beforeVersion);
    this.#state = "applied";
    this.mesh.version = this.afterVersion;
    this.events.push(`apply:${this.id}`);
  }

  revert(): void {
    this.#assertState("applied", this.afterVersion);
    this.#state = "reverted";
    this.mesh.version = this.beforeVersion;
    this.events.push(`revert:${this.id}`);
  }

  #assertState(expected: "applied" | "reverted", version: number): void {
    if (this.#state !== expected || this.mesh.version !== version) {
      throw new Error(`Patch ${this.id} has an invalid lifecycle`);
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
  events.push(`execute:${id}`);
  return new FakeMeshPatch(
    id,
    `Mutation ${id}`,
    beforeVersion,
    afterVersion,
    mesh,
    events,
  );
}

describe("History Engine public integration", () => {
  it("round-trips one grouped stroke and rolls back a canceled stroke", () => {
    const history = createHistoryService();
    const mesh: FakeMeshState = { version: 0 };
    const events: string[] = [];
    const stroke = history.begin("Pencil stroke");

    for (const id of ["1", "2", "3"]) {
      stroke.recordApplied(executeFakePatch(mesh, id, events));
    }
    stroke.commit();

    expect(mesh.version).toBe(3);
    expect(events).toEqual(["execute:1", "execute:2", "execute:3"]);
    expect(history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Pencil stroke",
    });

    events.length = 0;
    history.undo();
    expect(mesh.version).toBe(0);
    expect(events).toEqual(["revert:3", "revert:2", "revert:1"]);
    expect(history.snapshot()).toEqual({
      canUndo: false,
      canRedo: true,
      redoLabel: "Pencil stroke",
    });

    events.length = 0;
    history.redo();
    expect(mesh.version).toBe(3);
    expect(events).toEqual(["apply:1", "apply:2", "apply:3"]);

    events.length = 0;
    const canceledStroke = history.begin("Canceled stroke");
    canceledStroke.recordApplied(executeFakePatch(mesh, "4", events));
    canceledStroke.recordApplied(executeFakePatch(mesh, "5", events));
    events.length = 0;
    canceledStroke.rollback();

    expect(mesh.version).toBe(3);
    expect(events).toEqual(["revert:5", "revert:4"]);
    expect(history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Pencil stroke",
    });
  });
});
