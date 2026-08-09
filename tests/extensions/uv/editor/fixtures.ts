import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  CornerId,
  MeshQuery,
  MeshSnapshot,
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  MeshCommand,
  MeshMutationResult,
  MeshMutationService,
  MeshPatch,
  PointerKind,
  PointerPhase,
  PointerSample,
  SelectionChange,
  SelectionMode,
  SelectionService,
  SelectionSnapshot,
  Unsubscribe,
  ReversibleChange,
} from "@octopoly/contracts";

export const UV_KEY = Object.freeze({ domain: "corner", name: "uv0" }) as AttributeKey<{
  readonly x: number;
  readonly y: number;
}>;

class FixtureAttributes implements AttributeSnapshot {
  readonly #values: ReadonlyMap<number, AttributeValue | undefined>;

  constructor(values: ReadonlyMap<number, AttributeValue | undefined>) {
    this.#values = values;
  }

  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return this.#values.size > 0;
  }

  get<T extends AttributeValue>(_key: AttributeKey<T>, elementId: number): T | undefined {
    return this.#values.get(elementId) as T | undefined;
  }
}

export class FixtureMeshQuery implements MeshQuery {
  readonly #snapshot: MeshSnapshot;

  constructor(
    version = 1,
    values: ReadonlyMap<number, AttributeValue | undefined> = new Map([
      [100, { x: 0.2, y: 0.3 }],
      [101, { x: 0.8, y: 0.3 }],
      [102, { x: 0.5, y: 0.8 }],
    ]),
  ) {
    this.#snapshot = Object.freeze({
      version,
      vertices: Object.freeze([
        Object.freeze({ id: 0, position: Object.freeze({ x: 0, y: 0, z: 0 }) }),
        Object.freeze({ id: 1, position: Object.freeze({ x: 1, y: 0, z: 0 }) }),
        Object.freeze({ id: 2, position: Object.freeze({ x: 0, y: 1, z: 0 }) }),
      ]),
      edges: Object.freeze([
        Object.freeze({ id: 0, vertices: [0, 1] as const }),
        Object.freeze({ id: 1, vertices: [1, 2] as const }),
        Object.freeze({ id: 2, vertices: [2, 0] as const }),
      ]),
      corners: Object.freeze([
        Object.freeze({ id: 100, face: 10, vertex: 0, edge: 0 }),
        Object.freeze({ id: 101, face: 10, vertex: 1, edge: 1 }),
        Object.freeze({ id: 102, face: 10, vertex: 2, edge: 2 }),
      ]),
      faces: Object.freeze([
        Object.freeze({ id: 10, corners: Object.freeze([100, 101, 102]) }),
      ]),
      attributes: new FixtureAttributes(values),
    });
  }

  snapshot(): MeshSnapshot { return this.#snapshot; }
  vertex(id: number) { return this.#snapshot.vertices.find((item) => item.id === id) ?? null; }
  edge(id: number) { return this.#snapshot.edges.find((item) => item.id === id) ?? null; }
  corner(id: CornerId) { return this.#snapshot.corners.find((item) => item.id === id) ?? null; }
  face(id: number) { return this.#snapshot.faces.find((item) => item.id === id) ?? null; }
  incidentEdges(vertex: number): ReadonlyArray<number> {
    return this.#snapshot.edges.filter((edge) => edge.vertices.includes(vertex)).map((edge) => edge.id);
  }
  incidentFaces(vertex: number): ReadonlyArray<number> {
    return this.#snapshot.corners.filter((corner) => corner.vertex === vertex).map((corner) => corner.face);
  }
  adjacentFaces(edge: number): ReadonlyArray<number> {
    return this.#snapshot.corners.filter((corner) => corner.edge === edge).map((corner) => corner.face);
  }
  findEdge(a: number, b: number): number | null {
    return this.#snapshot.edges.find((edge) => edge.vertices.includes(a) && edge.vertices.includes(b))?.id ?? null;
  }
}

export class FixtureCoreSelection implements SelectionService {
  readonly #listeners = new Set<(snapshot: SelectionSnapshot) => void>();
  #snapshot: SelectionSnapshot;

  constructor(faces: ReadonlySet<number> = new Set()) {
    this.#snapshot = Object.freeze({
      version: 0,
      vertices: new Set<number>(),
      edges: new Set<number>(),
      faces: new Set(faces),
    });
  }

  snapshot(): SelectionSnapshot { return this.#snapshot; }
  update(mode: SelectionMode, change: SelectionChange): void {
    if (change.faces === undefined) return;
    const faces = mode === "replace" ? new Set(change.faces) : new Set(this.#snapshot.faces);
    this.#snapshot = Object.freeze({ ...this.#snapshot, version: this.#snapshot.version + 1, faces });
    for (const listener of [...this.#listeners]) listener(this.#snapshot);
  }
  clear(): void { this.update("replace", { faces: new Set() }); }
  prune(): void {}
  subscribe(listener: (snapshot: SelectionSnapshot) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
}

export class RecordingMutationService implements MeshMutationService {
  readonly calls: Array<{ readonly label: string; readonly command: MeshCommand }> = [];
  readonly #mesh: MeshQuery;

  constructor(mesh: MeshQuery) {
    this.#mesh = mesh;
  }

  validate(): ReadonlyArray<string> {
    return Object.freeze([]);
  }

  execute(label: string, command: MeshCommand): MeshMutationResult {
    this.calls.push({ label, command });
    const beforeVersion = this.#mesh.snapshot().version;
    const patch: MeshPatch = {
      id: `editor-patch-${this.calls.length}`,
      label,
      beforeVersion,
      afterVersion: beforeVersion + 1,
      affected: { corners: this.#mesh.snapshot().corners.map((corner) => corner.id) },
      apply: () => {},
      revert: () => {},
    };
    return {
      patch,
      snapshot: this.#mesh.snapshot(),
      created: {},
      updated: patch.affected,
      deleted: {},
    };
  }
}

export class RecordingHistoryService implements HistoryService {
  readonly begun: string[] = [];
  readonly committed: string[] = [];
  readonly recorded: ReversibleChange[] = [];
  rollbackCount = 0;

  begin(label: string): HistoryTransaction {
    this.begun.push(label);
    let closed = false;
    return {
      label,
      recordApplied: (change) => {
        if (closed) throw new Error("recording transaction is closed");
        this.recorded.push(change);
      },
      commit: () => {
        if (closed) throw new Error("recording transaction is closed");
        closed = true;
        this.committed.push(label);
      },
      rollback: () => {
        if (closed) throw new Error("recording transaction is closed");
        closed = true;
        this.rollbackCount += 1;
      },
    };
  }

  undo(): void {}
  redo(): void {}
  clear(): void {}
  snapshot(): HistorySnapshot {
    const undoLabel = this.committed.at(-1);
    return {
      canUndo: undoLabel !== undefined,
      canRedo: false,
      ...(undoLabel === undefined ? {} : { undoLabel }),
    };
  }
  subscribe(): Unsubscribe { return () => {}; }
}

export function pointer(
  phase: PointerPhase,
  x: number,
  y: number,
  pointerType: PointerKind = "pen",
  pointerId = 7,
): PointerSample {
  return Object.freeze({
    pointerId,
    pointerType,
    phase,
    isPrimary: true,
    x,
    y,
    pressure: phase === "down" || phase === "move" ? 0.5 : 0,
    tiltX: pointerType === "pen" ? 8 : 0,
    tiltY: pointerType === "pen" ? -3 : 0,
    buttons: phase === "down" || phase === "move" ? 1 : 0,
    modifiers: Object.freeze({ alt: false, ctrl: false, meta: false, shift: false }),
    timestamp: 1,
    coalesced: false,
  });
}
