import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  MeshCommand,
  MeshMutationResult,
  MeshMutationService,
  MeshPatch,
  MeshQuery,
  MeshSnapshot,
  ReversibleChange,
  Vec2,
} from "@octopoly/contracts";

import { UvMutationController } from "../../../../src/extensions/uv/operations/UvMutationController";

class SnapshotAttributes implements AttributeSnapshot {
  constructor(
    private readonly uv: ReadonlyMap<number, Vec2>,
    private readonly seams: ReadonlyMap<number, boolean>,
  ) {}

  has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return key.name === "uv0" ? this.uv.size > 0 : key.name === "uv0.seam" && this.seams.size > 0;
  }

  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    if (key.domain !== "corner") {
      return undefined;
    }
    if (key.name === "uv0") {
      return this.uv.get(elementId) as T | undefined;
    }
    if (key.name === "uv0.seam") {
      return this.seams.get(elementId) as T | undefined;
    }
    return undefined;
  }
}

class FakeUvMesh implements MeshQuery, MeshMutationService {
  readonly commands: MeshCommand[] = [];
  validationErrors: ReadonlyArray<string> = [];
  throwOnExecute = false;
  #version = 4;
  #uv = new Map<number, Vec2>();
  #seams = new Map<number, boolean>();
  #patchId = 0;

  constructor(initialUv: ReadonlyMap<number, Vec2> = new Map()) {
    this.#uv = new Map(initialUv);
  }

  snapshot(): MeshSnapshot {
    return {
      version: this.#version,
      vertices: [
        { id: 0, position: { x: 0, y: 0, z: 0 } },
        { id: 1, position: { x: 1, y: 0, z: 0 } },
        { id: 2, position: { x: 0, y: 1, z: 0 } },
      ],
      edges: [
        { id: 0, vertices: [0, 1] },
        { id: 1, vertices: [1, 2] },
        { id: 2, vertices: [0, 2] },
      ],
      corners: [
        { id: 0, face: 0, vertex: 0, edge: 0 },
        { id: 1, face: 0, vertex: 1, edge: 1 },
        { id: 2, face: 0, vertex: 2, edge: 2 },
      ],
      faces: [{ id: 0, corners: [0, 1, 2] }],
      attributes: new SnapshotAttributes(new Map(this.#uv), new Map(this.#seams)),
    };
  }

  vertex(id: number) {
    return this.snapshot().vertices.find((vertex) => vertex.id === id) ?? null;
  }

  edge(id: number) {
    return this.snapshot().edges.find((edge) => edge.id === id) ?? null;
  }

  corner(id: number) {
    return this.snapshot().corners.find((corner) => corner.id === id) ?? null;
  }

  face(id: number) {
    return this.snapshot().faces.find((face) => face.id === id) ?? null;
  }

  incidentEdges(vertex: number): ReadonlyArray<number> {
    return this.snapshot().edges.filter((edge) => edge.vertices.includes(vertex)).map((edge) => edge.id);
  }

  incidentFaces(vertex: number): ReadonlyArray<number> {
    return this.snapshot().corners.filter((corner) => corner.vertex === vertex).map((corner) => corner.face);
  }

  adjacentFaces(edge: number): ReadonlyArray<number> {
    return this.snapshot().corners.filter((corner) => corner.edge === edge).map((corner) => corner.face);
  }

  findEdge(a: number, b: number): number | null {
    return this.snapshot().edges.find((edge) => edge.vertices.includes(a) && edge.vertices.includes(b))?.id ?? null;
  }

  validate(): ReadonlyArray<string> {
    return this.validationErrors;
  }

  execute(label: string, command: MeshCommand): MeshMutationResult {
    this.commands.push(command);
    if (this.throwOnExecute) {
      throw new Error("fake mutation failure");
    }

    const beforeVersion = this.#version;
    const beforeUv = new Map(this.#uv);
    const beforeSeams = new Map(this.#seams);
    this.#applyCommand(command);
    this.#version += 1;
    const afterVersion = this.#version;
    const afterUv = new Map(this.#uv);
    const afterSeams = new Map(this.#seams);
    let applied = true;
    const restore = (uv: ReadonlyMap<number, Vec2>, seams: ReadonlyMap<number, boolean>, version: number) => {
      this.#uv = new Map(uv);
      this.#seams = new Map(seams);
      this.#version = version;
    };
    const patch: MeshPatch = {
      id: `uv-patch-${this.#patchId++}`,
      label,
      beforeVersion,
      afterVersion,
      affected: { corners: [0, 1, 2] },
      apply: () => {
        if (applied) {
          throw new Error("patch is already applied");
        }
        restore(afterUv, afterSeams, afterVersion);
        applied = true;
      },
      revert: () => {
        if (!applied) {
          throw new Error("patch is already reverted");
        }
        restore(beforeUv, beforeSeams, beforeVersion);
        applied = false;
      },
    };
    return {
      patch,
      snapshot: this.snapshot(),
      created: {},
      updated: { corners: [0, 1, 2] },
      deleted: {},
    };
  }

  uvValues(): ReadonlyMap<number, Vec2> {
    return new Map(this.#uv);
  }

  seamValues(): ReadonlyMap<number, boolean> {
    return new Map(this.#seams);
  }

  #applyCommand(command: MeshCommand): void {
    if (command.kind === "batch") {
      for (const child of command.commands) {
        this.#applyCommand(child);
      }
      return;
    }
    if (command.kind !== "setAttribute") {
      throw new Error(`unexpected command ${command.kind}`);
    }
    const destination = command.key.name === "uv0" ? this.#uv : this.#seams;
    for (const [corner, value] of command.values) {
      if (value === undefined) {
        destination.delete(corner);
      } else if (command.key.name === "uv0") {
        this.#uv.set(corner, value as Vec2);
      } else {
        this.#seams.set(corner, value as boolean);
      }
    }
  }
}

class FakeTransaction implements HistoryTransaction {
  readonly changes: ReversibleChange[] = [];
  closed = false;

  constructor(
    readonly label: string,
    private readonly history: FakeHistory,
    private readonly failRecord: boolean,
  ) {}

  recordApplied(change: ReversibleChange): void {
    if (this.failRecord) {
      throw new Error("fake record failure");
    }
    this.changes.push(change);
  }

  commit(): void {
    if (this.closed) {
      throw new Error("transaction is closed");
    }
    this.closed = true;
    this.history.commit(this.label, this.changes);
  }

  rollback(): void {
    if (this.closed) {
      throw new Error("transaction is closed");
    }
    this.closed = true;
    for (let index = this.changes.length - 1; index >= 0; index -= 1) {
      this.changes[index]?.revert();
    }
  }
}

interface HistoryEntry {
  readonly label: string;
  readonly changes: ReadonlyArray<ReversibleChange>;
}

class FakeHistory implements HistoryService {
  beginCount = 0;
  failRecord = false;
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];

  begin(label: string): HistoryTransaction {
    this.beginCount += 1;
    return new FakeTransaction(label, this, this.failRecord);
  }

  commit(label: string, changes: ReadonlyArray<ReversibleChange>): void {
    this.#undo.push({ label, changes: [...changes] });
    this.#redo.length = 0;
  }

  undo(): void {
    const entry = this.#undo.pop();
    if (entry === undefined) {
      return;
    }
    for (let index = entry.changes.length - 1; index >= 0; index -= 1) {
      entry.changes[index]?.revert();
    }
    this.#redo.push(entry);
  }

  redo(): void {
    const entry = this.#redo.pop();
    if (entry === undefined) {
      return;
    }
    for (const change of entry.changes) {
      change.apply();
    }
    this.#undo.push(entry);
  }

  clear(): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
  }

  snapshot(): HistorySnapshot {
    const undo = this.#undo.at(-1);
    const redo = this.#redo.at(-1);
    return {
      canUndo: undo !== undefined,
      canRedo: redo !== undefined,
      ...(undo === undefined ? {} : { undoLabel: undo.label }),
      ...(redo === undefined ? {} : { redoLabel: redo.label }),
    };
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

function fullUv(): Map<number, Vec2> {
  return new Map([
    [0, { x: 0, y: 0 }],
    [1, { x: 1, y: 0 }],
    [2, { x: 0, y: 1 }],
  ]);
}

describe("UvMutationController", () => {
  it("uses one setAttribute command and one history entry with exact undo/redo", () => {
    const mesh = new FakeUvMesh();
    const history = new FakeHistory();
    const controller = new UvMutationController(mesh, mesh, history);
    const projected = fullUv();

    expect(controller.apply("Project UV", projected)).toMatchObject({ status: "applied" });
    expect(mesh.commands).toHaveLength(1);
    expect(mesh.commands[0]?.kind).toBe("setAttribute");
    expect(history.snapshot()).toMatchObject({ canUndo: true, undoLabel: "Project UV" });
    expect(mesh.uvValues()).toEqual(projected);

    history.undo();
    expect(mesh.uvValues()).toEqual(new Map());
    expect(history.snapshot()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: "Project UV" });

    history.redo();
    expect(mesh.uvValues()).toEqual(projected);
    expect(history.snapshot()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("uses one atomic batch when UV and seam values change together", () => {
    const mesh = new FakeUvMesh();
    const history = new FakeHistory();
    const result = new UvMutationController(mesh, mesh, history).apply(
      "Split UV",
      fullUv(),
      new Map([[0, true], [1, undefined]]),
    );

    expect(result.status).toBe("applied");
    const command = mesh.commands[0];
    expect(command?.kind).toBe("batch");
    if (command?.kind !== "batch") {
      throw new Error("expected UV batch command");
    }
    expect(command.commands.map((child) => child.kind)).toEqual(["setAttribute", "setAttribute"]);
    expect(mesh.seamValues()).toEqual(new Map([[0, true]]));
    expect(history.beginCount).toBe(1);
    expect(history.snapshot().undoLabel).toBe("Split UV");
  });

  it("rejects partial faces and mutation-service validation errors before opening history", () => {
    const mesh = new FakeUvMesh();
    const history = new FakeHistory();
    const controller = new UvMutationController(mesh, mesh, history);

    expect(controller.apply("Partial UV", new Map([[0, { x: 0, y: 0 }]]))).toMatchObject({
      status: "rejected",
      errors: ["face 0 would have partial UV values"],
    });
    expect(history.beginCount).toBe(0);
    expect(mesh.commands).toEqual([]);

    const completeMesh = new FakeUvMesh(fullUv());
    completeMesh.validationErrors = ["fake mesh validation rejected command"];
    const secondHistory = new FakeHistory();
    expect(new UvMutationController(completeMesh, completeMesh, secondHistory).apply(
      "Invalid UV",
      new Map([[0, { x: 2, y: 2 }]]),
    )).toEqual({ status: "rejected", errors: ["fake mesh validation rejected command"] });
    expect(secondHistory.beginCount).toBe(0);
    expect(completeMesh.commands).toEqual([]);
  });

  it("rolls back execution and record failures without an undo entry or partial values", () => {
    const initial = fullUv();
    const mesh = new FakeUvMesh(initial);
    mesh.throwOnExecute = true;
    const history = new FakeHistory();
    const controller = new UvMutationController(mesh, mesh, history);

    expect(controller.apply("Failed move", new Map([[0, { x: 4, y: 4 }]]))).toMatchObject({ status: "failed" });
    expect(mesh.uvValues()).toEqual(initial);
    expect(history.snapshot().canUndo).toBe(false);

    mesh.throwOnExecute = false;
    history.failRecord = true;
    expect(controller.apply("Failed record", new Map([[0, { x: 8, y: 8 }]]))).toMatchObject({ status: "failed" });
    expect(mesh.uvValues()).toEqual(initial);
    expect(history.snapshot().canUndo).toBe(false);
  });

  it("does not create a mutation or transaction for an unchanged action", () => {
    const mesh = new FakeUvMesh(fullUv());
    const history = new FakeHistory();

    expect(new UvMutationController(mesh, mesh, history).apply("No-op", new Map())).toEqual({
      status: "unchanged",
    });
    expect(mesh.commands).toEqual([]);
    expect(history.beginCount).toBe(0);
  });
});
