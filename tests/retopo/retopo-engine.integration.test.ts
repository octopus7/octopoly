import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  CornerId,
  CornerRecord,
  EdgeId,
  EdgeRecord,
  FaceId,
  FaceRecord,
  MeshCommand,
  MeshElementSet,
  MeshMutationResult,
  MeshPatch,
  MeshQuery,
  MeshSnapshot,
  PointerPhase,
  RetopoStep,
  RetopoStrokeInput,
  RetopoStrokeSession,
  Vec3,
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import {
  createRetopoEngine,
  DeterministicRetopoEngine,
  RETOPO_STAGED_STEP_HARD_LIMIT,
} from "../../src/retopo";

const MODIFIERS = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });
const EMPTY_ATTRIBUTES: AttributeSnapshot = Object.freeze({
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
});

class ReplayMesh implements MeshQuery {
  readonly #vertices = new Map<VertexId, VertexRecord>();
  readonly #faces = new Map<FaceId, FaceRecord>();
  version = 0;

  snapshot(): MeshSnapshot {
    return {
      version: this.version,
      vertices: [...this.#vertices.values()].sort((left, right) => left.id - right.id),
      edges: [],
      corners: [],
      faces: [...this.#faces.values()].sort((left, right) => left.id - right.id),
      attributes: EMPTY_ATTRIBUTES,
    };
  }

  vertex(id: VertexId): VertexRecord | null {
    return this.#vertices.get(id) ?? null;
  }

  edge(_id: EdgeId): EdgeRecord | null {
    return null;
  }

  corner(_id: CornerId): CornerRecord | null {
    return null;
  }

  face(id: FaceId): FaceRecord | null {
    return this.#faces.get(id) ?? null;
  }

  incidentEdges(_vertex: VertexId): ReadonlyArray<EdgeId> {
    return [];
  }

  incidentFaces(_vertex: VertexId): ReadonlyArray<FaceId> {
    return [];
  }

  adjacentFaces(_edge: EdgeId): ReadonlyArray<FaceId> {
    return [];
  }

  findEdge(_a: VertexId, _b: VertexId): EdgeId | null {
    return null;
  }

  apply(command: MeshCommand, ids: ReplayIds): MeshMutationResult {
    const beforeVersion = this.version;
    const afterVersion = beforeVersion + 1;
    let created: MeshElementSet;
    let applyForward: () => void;
    let applyReverse: () => void;

    if (command.kind === "createVertex") {
      const id = ids.nextVertex;
      ids.nextVertex += 1;
      const vertex = Object.freeze({ id, position: Object.freeze({ ...command.position }) });
      created = { vertices: [id] };
      applyForward = () => {
        this.#vertices.set(id, vertex);
        this.version = afterVersion;
      };
      applyReverse = () => {
        this.#vertices.delete(id);
        this.version = beforeVersion;
      };
    } else if (command.kind === "createFace") {
      for (const vertex of command.vertices) {
        if (!this.#vertices.has(vertex)) {
          throw new Error(`face references missing vertex ${vertex}`);
        }
      }
      const id = ids.nextFace;
      ids.nextFace += 1;
      const face = Object.freeze({ id, corners: Object.freeze([]) as ReadonlyArray<CornerId> });
      created = { faces: [id] };
      applyForward = () => {
        this.#faces.set(id, face);
        this.version = afterVersion;
      };
      applyReverse = () => {
        this.#faces.delete(id);
        this.version = beforeVersion;
      };
    } else {
      throw new Error(`replay fixture does not execute ${command.kind}`);
    }

    const patch: MeshPatch = {
      id: `replay-${beforeVersion}-${afterVersion}`,
      label: "retopo replay mutation",
      beforeVersion,
      afterVersion,
      affected: created,
      apply: applyForward,
      revert: applyReverse,
    };
    patch.apply();
    return {
      patch,
      snapshot: this.snapshot(),
      created,
      updated: {},
      deleted: {},
    };
  }
}

interface ReplayIds {
  nextVertex: number;
  nextFace: number;
}

interface ReplayResult {
  readonly steps: ReadonlyArray<RetopoStep>;
  readonly commands: ReadonlyArray<MeshCommand>;
  readonly mesh: MeshSnapshot;
}

function stroke(z: number, timestampBase: number): ReadonlyArray<RetopoStrokeInput> {
  return Object.freeze([
    input("down", timestampBase, { x: 0, y: 0, z }),
    input("move", timestampBase + 1, { x: 3, y: 0, z }),
    input("up", timestampBase + 2, { x: 6, y: 0, z }),
  ]);
}

function input(
  phase: PointerPhase,
  timestamp: number,
  position: Vec3,
  surfaceMiss = false,
): RetopoStrokeInput {
  return Object.freeze({
    sample: Object.freeze({
      pointerId: 31,
      pointerType: "pen",
      phase,
      isPrimary: true,
      x: position.x,
      y: position.z,
      pressure: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 0.7,
      tiltX: 5,
      tiltY: -4,
      buttons: phase === "up" || phase === "cancel" || phase === "hover" ? 0 : 1,
      modifiers: MODIFIERS,
      timestamp,
      coalesced: phase === "move",
    }),
    ray: Object.freeze({
      origin: Object.freeze({ x: position.x, y: position.y + 1, z: position.z }),
      direction: Object.freeze({ x: 0, y: -1, z: 0 }),
    }),
    surfaceHit: surfaceMiss
      ? null
      : Object.freeze({
          surfaceId: "integration-surface",
          triangleId: timestamp,
          position: Object.freeze({ ...position }),
          normal: Object.freeze({ x: 0, y: 1, z: 0 }),
          barycentric: Object.freeze({ x: 0.25, y: 0.25, z: 0.5 }),
          distance: 1,
        }),
  });
}

function replay(
  firstBatches: ReadonlyArray<ReadonlyArray<RetopoStrokeInput>>,
  secondBatches: ReadonlyArray<ReadonlyArray<RetopoStrokeInput>>,
): ReplayResult {
  const engine = createRetopoEngine();
  const mesh = new ReplayMesh();
  const ids = { nextVertex: 100, nextFace: 500 };
  const steps: RetopoStep[] = [];
  const commands: MeshCommand[] = [];

  dispatch(engine.begin(), firstBatches, mesh, ids, steps, commands);
  dispatch(engine.begin(), secondBatches, mesh, ids, steps, commands);
  return { steps, commands, mesh: mesh.snapshot() };
}

function dispatch(
  session: RetopoStrokeSession,
  batches: ReadonlyArray<ReadonlyArray<RetopoStrokeInput>>,
  mesh: ReplayMesh,
  ids: ReplayIds,
  steps: RetopoStep[],
  commands: MeshCommand[],
): void {
  for (const batch of batches) {
    for (const sample of batch) {
      let step = session.update(sample, mesh);
      steps.push(step);
      while (step.kind === "commit") {
        commands.push(step.command);
        const result = mesh.apply(step.command, ids);
        step = session.continue(result, mesh);
        steps.push(step);
      }
    }
  }
}

describe("retopo engine deterministic integration", () => {
  it("replays identical commands and previews across different frame batch boundaries", () => {
    const first = stroke(0, 100);
    const second = stroke(1, 200);
    const singleBatch = replay([first], [second]);
    const splitBatches = replay(
      [[first[0]!], [first[1]!, first[2]!]],
      [[second[0]!, second[1]!], [second[2]!]],
    );

    expect(JSON.stringify(splitBatches)).toBe(JSON.stringify(singleBatch));
    expect(singleBatch.commands.map((command) => command.kind)).toEqual([
      "createVertex",
      "createVertex",
      "createVertex",
      "createVertex",
      "createVertex",
      "createVertex",
      "createFace",
      "createFace",
    ]);
    expect(singleBatch.mesh.vertices).toHaveLength(6);
    expect(singleBatch.mesh.faces).toHaveLength(2);
    expect(singleBatch.steps.at(-1)).toEqual({ kind: "complete" });
  });

  it("rejects degenerate and surface-miss fixtures without emitting a commit", () => {
    const mesh = new ReplayMesh();
    const degenerate = createRetopoEngine().begin();
    expect(degenerate.update(input("down", 300, { x: 1, y: 0, z: 1 }), mesh).kind).toBe(
      "preview",
    );
    const degenerateResult = degenerate.update(
      input("up", 301, { x: 1, y: 0, z: 1 }),
      mesh,
    );
    expect(degenerateResult).toEqual({ kind: "rejected", reason: "degenerate stroke" });

    const miss = createRetopoEngine().begin();
    expect(miss.update(input("down", 400, { x: 0, y: 0, z: 0 }), mesh).kind).toBe(
      "preview",
    );
    const missResult = miss.update(input("up", 401, { x: 3, y: 0, z: 0 }, true), mesh);
    expect(missResult).toEqual({
      kind: "rejected",
      reason: "surface chain rejected: surface-miss",
    });
    expect(mesh.snapshot().version).toBe(0);
  });

  it("cancels idempotently, clears preview state, and rejects later lifecycle calls", () => {
    const engine = createRetopoEngine();
    const mesh = new ReplayMesh();
    const session = engine.begin();
    expect(session.update(input("down", 500, { x: 0, y: 0, z: 0 }), mesh).kind).toBe(
      "preview",
    );
    expect(session.update(input("cancel", 501, { x: 3, y: 0, z: 0 }), mesh)).toEqual({
      kind: "none",
    });
    session.cancel();
    session.dispose();
    session.dispose();
    expect(() => session.update(input("move", 502, { x: 6, y: 0, z: 0 }), mesh)).toThrow(
      "while disposed",
    );
    expect(() => session.continue({} as MeshMutationResult, mesh)).toThrow("while disposed");
    expect(() => engine.begin()).not.toThrow();
    expect(mesh.snapshot().version).toBe(0);
  });

  it("cancels a staged sequence so the adapter can roll back applied patches", () => {
    const engine = createRetopoEngine();
    const mesh = new ReplayMesh();
    const ids = { nextVertex: 600, nextFace: 800 };
    const first = engine.begin();
    for (const sample of [
      input("down", 550, { x: 0, y: 0, z: 0 }),
      input("up", 551, { x: 3, y: 0, z: 0 }),
    ]) {
      first.update(sample, mesh);
    }

    const second = engine.begin();
    second.update(input("down", 560, { x: 0, y: 0, z: 1 }), mesh);
    const firstCommit = second.update(input("up", 561, { x: 3, y: 0, z: 1 }), mesh);
    expect(firstCommit.kind).toBe("commit");
    if (firstCommit.kind !== "commit") {
      throw new Error("cancel fixture expected a staged commit");
    }
    const result = mesh.apply(firstCommit.command, ids);
    expect(second.continue(result, mesh).kind).toBe("commit");

    second.cancel();
    second.cancel();
    result.patch.revert();
    expect(mesh.snapshot()).toMatchObject({ version: 0, vertices: [], faces: [] });
    expect(() => second.continue(result, mesh)).toThrow("while cancelled");
  });

  it("enforces the ADR hard cap and lets an adapter roll back every staged patch", () => {
    expect(RETOPO_STAGED_STEP_HARD_LIMIT).toBe(4_096);
    expect(() =>
      new DeterministicRetopoEngine({ maxStagedSteps: RETOPO_STAGED_STEP_HARD_LIMIT + 1 }),
    ).toThrow(RangeError);

    const engine = new DeterministicRetopoEngine({ maxStagedSteps: 2 });
    const mesh = new ReplayMesh();
    const ids = { nextVertex: 700, nextFace: 900 };
    const first = engine.begin();
    for (const sample of [
      input("down", 600, { x: 0, y: 0, z: 0 }),
      input("up", 601, { x: 3, y: 0, z: 0 }),
    ]) {
      first.update(sample, mesh);
    }

    const second = engine.begin();
    second.update(input("down", 700, { x: 0, y: 0, z: 1 }), mesh);
    let step = second.update(input("up", 701, { x: 3, y: 0, z: 1 }), mesh);
    const applied: MeshPatch[] = [];
    while (step.kind === "commit") {
      const result = mesh.apply(step.command, ids);
      applied.push(result.patch);
      step = second.continue(result, mesh);
    }

    expect(applied).toHaveLength(2);
    expect(step).toEqual({
      kind: "rejected",
      reason: "retopo staged step budget exceeded (2)",
    });
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      applied[index]?.revert();
    }
    expect(mesh.snapshot()).toMatchObject({ version: 0, vertices: [], faces: [] });
    expect(() => second.continue({} as MeshMutationResult, mesh)).toThrow("while closed");
  });
});
