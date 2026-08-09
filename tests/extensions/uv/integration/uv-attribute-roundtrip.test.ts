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
  SerializedAttribute,
  Vec2,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import {
  UV0_ATTRIBUTE,
  UvMutationController,
  createUvProjectionService,
  validateUvAttribute,
} from "../../../../src/extensions/uv";

type AttributeStore = Map<string, Map<number, AttributeValue>>;

function storeKey(key: AttributeKey<AttributeValue>): string {
  return `${key.domain}:${key.name}`;
}

function cloneValue(value: AttributeValue): AttributeValue {
  if (Array.isArray(value)) return Object.freeze([...value]);
  if (typeof value === "object") return Object.freeze({ ...value });
  return value;
}

function cloneStore(source: AttributeStore): AttributeStore {
  return new Map([...source].map(([key, entries]) => [
    key,
    new Map([...entries].map(([id, value]) => [id, cloneValue(value)])),
  ]));
}

class StoreSnapshot implements AttributeSnapshot {
  constructor(private readonly store: AttributeStore) {}

  has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return this.store.has(storeKey(key as AttributeKey<AttributeValue>));
  }

  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    return this.store.get(storeKey(key as AttributeKey<AttributeValue>))?.get(elementId) as T | undefined;
  }
}

class RoundTripMesh implements MeshQuery, MeshMutationService {
  readonly commands: MeshCommand[] = [];
  #version = 0;
  #store: AttributeStore;
  #nextPatch = 0;

  constructor(attributes: ReadonlyArray<SerializedAttribute> = []) {
    this.#store = new Map(attributes.map((attribute) => [
      `${attribute.domain}:${attribute.name}`,
      new Map(attribute.entries.map(([id, value]) => [id, cloneValue(value)])),
    ]));
  }

  snapshot(): MeshSnapshot {
    return {
      version: this.#version,
      vertices: [
        { id: 1, position: { x: 0, y: 0, z: 0 } },
        { id: 2, position: { x: 1, y: 0, z: 0 } },
        { id: 3, position: { x: 0, y: 1, z: 0 } },
      ],
      edges: [
        { id: 11, vertices: [1, 2] },
        { id: 12, vertices: [2, 3] },
        { id: 13, vertices: [3, 1] },
      ],
      corners: [
        { id: 101, face: 20, vertex: 1, edge: 11 },
        { id: 102, face: 20, vertex: 2, edge: 12 },
        { id: 103, face: 20, vertex: 3, edge: 13 },
      ],
      faces: [{ id: 20, corners: [101, 102, 103] }],
      attributes: new StoreSnapshot(cloneStore(this.#store)),
    };
  }

  vertex(id: number) { return this.snapshot().vertices.find((value) => value.id === id) ?? null; }
  edge(id: number) { return this.snapshot().edges.find((value) => value.id === id) ?? null; }
  corner(id: number) { return this.snapshot().corners.find((value) => value.id === id) ?? null; }
  face(id: number) { return this.snapshot().faces.find((value) => value.id === id) ?? null; }

  incidentEdges(vertex: number): ReadonlyArray<number> {
    return this.snapshot().edges.filter((edge) => edge.vertices.includes(vertex)).map((edge) => edge.id);
  }

  incidentFaces(vertex: number): ReadonlyArray<number> {
    return this.snapshot().corners.filter((corner) => corner.vertex === vertex).map((corner) => corner.face);
  }

  adjacentFaces(edge: number): ReadonlyArray<number> {
    return this.snapshot().corners.filter((corner) => corner.edge === edge).map((corner) => corner.face);
  }

  findEdge(first: number, second: number): number | null {
    return this.snapshot().edges.find((edge) => (
      edge.vertices.includes(first) && edge.vertices.includes(second)
    ))?.id ?? null;
  }

  validate(command: MeshCommand): ReadonlyArray<string> {
    const commands = command.kind === "batch" ? command.commands : [command];
    return commands.every((entry) => entry.kind === "setAttribute")
      ? Object.freeze([])
      : Object.freeze(["round-trip fixture accepts attribute commands only"]);
  }

  execute(label: string, command: MeshCommand): MeshMutationResult {
    this.commands.push(command);
    const beforeVersion = this.#version;
    const before = cloneStore(this.#store);
    this.#apply(command);
    this.#version += 1;
    const afterVersion = this.#version;
    const after = cloneStore(this.#store);
    let applied = true;
    const restore = (store: AttributeStore, version: number): void => {
      this.#store = cloneStore(store);
      this.#version = version;
    };
    const patch: MeshPatch = {
      id: `uv-round-trip-${this.#nextPatch++}`,
      label,
      beforeVersion,
      afterVersion,
      affected: { corners: [101, 102, 103] },
      apply: () => {
        if (applied) throw new Error("round-trip patch is already applied");
        restore(after, afterVersion);
        applied = true;
      },
      revert: () => {
        if (!applied) throw new Error("round-trip patch is already reverted");
        restore(before, beforeVersion);
        applied = false;
      },
    };
    return {
      patch,
      snapshot: this.snapshot(),
      created: {},
      updated: { corners: [101, 102, 103] },
      deleted: {},
    };
  }

  serializeAttributes(): ReadonlyArray<SerializedAttribute> {
    return Object.freeze([...this.#store].map(([key, values]) => {
      const separator = key.indexOf(":");
      const domain = key.slice(0, separator) as SerializedAttribute["domain"];
      const name = key.slice(separator + 1);
      return Object.freeze({
        domain,
        name,
        entries: Object.freeze([...values]
          .sort(([first], [second]) => first - second)
          .map(([id, value]) => Object.freeze([id, cloneValue(value)] as const))),
      });
    }));
  }

  #apply(command: MeshCommand): void {
    if (command.kind === "batch") {
      for (const entry of command.commands) this.#apply(entry);
      return;
    }
    if (command.kind !== "setAttribute") {
      throw new Error(`unexpected command ${command.kind}`);
    }
    const key = storeKey(command.key);
    const values = this.#store.get(key) ?? new Map<number, AttributeValue>();
    for (const [id, value] of command.values) {
      if (value === undefined) values.delete(id);
      else values.set(id, cloneValue(value));
    }
    if (values.size === 0) this.#store.delete(key);
    else this.#store.set(key, values);
  }
}

interface HistoryEntry {
  readonly label: string;
  readonly changes: ReadonlyArray<ReversibleChange>;
}

class RoundTripHistory implements HistoryService {
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];

  begin(label: string): HistoryTransaction {
    const changes: ReversibleChange[] = [];
    let open = true;
    const assertOpen = (): void => {
      if (!open) throw new Error("round-trip history transaction is closed");
    };
    return {
      label,
      recordApplied: (change) => {
        assertOpen();
        changes.push(change);
      },
      commit: () => {
        assertOpen();
        open = false;
        this.#undo.push({ label, changes: [...changes] });
        this.#redo.splice(0);
      },
      rollback: () => {
        assertOpen();
        open = false;
        for (const change of [...changes].reverse()) change.revert();
      },
    };
  }

  undo(): void {
    const entry = this.#undo.pop();
    if (entry === undefined) return;
    for (const change of [...entry.changes].reverse()) change.revert();
    this.#redo.push(entry);
  }

  redo(): void {
    const entry = this.#redo.pop();
    if (entry === undefined) return;
    for (const change of entry.changes) change.apply();
    this.#undo.push(entry);
  }

  clear(): void {
    this.#undo.splice(0);
    this.#redo.splice(0);
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

  subscribe(): () => void { return () => undefined; }
}

describe("UV public integration", () => {
  it("round-trips projected corner attributes through mutation, serialization, undo, and redo", () => {
    const mesh = new RoundTripMesh();
    const history = new RoundTripHistory();
    const projected = createUvProjectionService().planar(
      mesh.snapshot(),
      { x: 0, y: 0, z: 1 },
    );

    expect(new UvMutationController(mesh, mesh, history).apply("Planar UV", projected))
      .toMatchObject({ status: "applied" });
    expect(mesh.commands).toHaveLength(1);
    expect(mesh.commands[0]?.kind).toBe("setAttribute");
    expect(history.snapshot()).toMatchObject({ canUndo: true, undoLabel: "Planar UV" });
    expect(validateUvAttribute(mesh.snapshot()).faces).toEqual([
      { face: 20, status: "complete", missingCorners: [], nonFiniteCorners: [] },
    ]);

    const serialized = mesh.serializeAttributes();
    expect(serialized).toEqual([{
      domain: "corner",
      name: UV0_ATTRIBUTE.name,
      entries: [
        [101, { x: 0, y: 0 }],
        [102, { x: 1, y: 0 }],
        [103, { x: 0, y: 1 }],
      ],
    }]);
    const restored = new RoundTripMesh(serialized);
    expect(restored.serializeAttributes()).toEqual(serialized);
    expect(validateUvAttribute(restored.snapshot()).valid).toBe(true);

    history.undo();
    expect(mesh.snapshot().attributes.has(UV0_ATTRIBUTE)).toBe(false);
    history.redo();
    expect(mesh.serializeAttributes()).toEqual(serialized);
  });
});
