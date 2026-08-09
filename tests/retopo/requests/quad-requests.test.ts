import type {
  MeshCommand,
  MeshElementSet,
  MeshMutationResult,
  MeshPatch,
  RetopoStep,
  Vec3,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { inferQuadStrip } from "../../../src/retopo/quad";
import {
  buildQuadPreview,
  createQuadRequestSequence,
} from "../../../src/retopo/requests";
import expected from "../fixtures/expected/quad-request.json";
import { bridgedFixture, chain, FakeMeshQuery } from "../quad/fixtures";

function appliedResult(mesh: FakeMeshQuery, created: MeshElementSet): MeshMutationResult {
  const beforeVersion = mesh.version;
  mesh.version += 1;
  const snapshot = mesh.snapshot();
  const patch: MeshPatch = {
    id: `fake-patch-${snapshot.version}`,
    label: "fake retopo mutation",
    beforeVersion,
    afterVersion: snapshot.version,
    affected: created,
    apply() {},
    revert() {},
  };
  return {
    patch,
    snapshot,
    created,
    updated: {},
    deleted: {},
  };
}

function newSurfaceCandidate(mesh: FakeMeshQuery) {
  const first = chain([
    { position: { x: 0, y: 0, z: 0 } },
    { position: { x: 1, y: 0, z: 0 } },
  ]);
  const second = chain([
    { position: { x: 0, y: 0, z: 1 } },
    { position: { x: 1, y: 0, z: 1 } },
  ]);
  const inference = inferQuadStrip(first, second, mesh);
  if (inference.kind !== "accepted") {
    throw new Error(`fixture inference failed: ${inference.reason}`);
  }
  return inference.candidates;
}

function command(step: RetopoStep): MeshCommand {
  if (step.kind !== "commit") {
    throw new Error(`expected commit step, received ${step.kind}`);
  }
  return step.command;
}

describe("quad request sequence", () => {
  it("waits for each created stable vertex ID before emitting createFace", () => {
    const mesh = new FakeMeshQuery();
    const candidates = newSurfaceCandidate(mesh);
    const preview = buildQuadPreview(candidates, 7);
    expect(preview).toEqual(expected.preview);

    const sequence = createQuadRequestSequence(candidates, preview);
    const commands: MeshCommand[] = [];
    let step = sequence.start(mesh);

    for (const vertexId of [100, 101, 102, 103]) {
      const createVertex = command(step);
      commands.push(createVertex);
      expect(createVertex.kind).toBe("createVertex");
      if (createVertex.kind !== "createVertex") return;
      mesh.addVertex(vertexId, createVertex.position);
      step = sequence.continue(appliedResult(mesh, { vertices: [vertexId] }), mesh);
    }

    const createFace = command(step);
    commands.push(createFace);
    expect(createFace).toEqual({ kind: "createFace", vertices: [100, 101, 102, 103] });
    expect(commands).toEqual(expected.commands);
    expect(commands.every((item) => item.kind !== "batch")).toBe(true);

    mesh.addFace(500);
    step = sequence.continue(appliedResult(mesh, { faces: [500] }), mesh);
    expect(step).toEqual({ kind: "complete" });
  });

  it("replays the same command and preview fixture byte-for-byte", () => {
    const replay = () => {
      const mesh = new FakeMeshQuery();
      const candidates = newSurfaceCandidate(mesh);
      const preview = buildQuadPreview(candidates, 7);
      const sequence = createQuadRequestSequence(candidates, preview);
      const commands: MeshCommand[] = [];
      let step = sequence.start(mesh);
      for (const vertexId of [100, 101, 102, 103]) {
        const nextCommand = command(step);
        commands.push(nextCommand);
        if (nextCommand.kind !== "createVertex") {
          throw new Error("replay expected a createVertex request");
        }
        mesh.addVertex(vertexId, nextCommand.position);
        step = sequence.continue(appliedResult(mesh, { vertices: [vertexId] }), mesh);
      }
      commands.push(command(step));
      return JSON.stringify({ preview, commands });
    };

    const first = replay();
    const second = replay();
    expect(first).toBe(second);
    expect(first).toBe(JSON.stringify({ preview: expected.preview, commands: expected.commands }));
  });

  it("emits a deterministic bridge request when both source edges are stable", () => {
    const fixture = bridgedFixture();
    const inference = inferQuadStrip(fixture.first, fixture.second, fixture.mesh);
    expect(inference.kind).toBe("accepted");
    if (inference.kind !== "accepted") return;

    const sequence = createQuadRequestSequence(inference.candidates);
    const step = sequence.start(fixture.mesh);
    expect(step).toMatchObject({
      kind: "commit",
      label: "Retopo: Bridge Edges",
      command: { kind: "bridgeEdges", first: [5], second: [6] },
    });

    fixture.mesh.addFace(500);
    expect(
      sequence.continue(appliedResult(fixture.mesh, { faces: [500] }), fixture.mesh),
    ).toEqual({ kind: "complete" });
  });

  it("uses splitEdge feedback for an edge anchor without inventing a vertex ID", () => {
    const mesh = new FakeMeshQuery();
    mesh.addVertex(1, { x: -1, y: 0, z: 0 });
    mesh.addVertex(2, { x: 1, y: 0, z: 0 });
    mesh.addEdge(8, [1, 2], [10]);
    const first = chain([
      {
        position: { x: 0, y: 0, z: 0 },
        anchor: { kind: "edge", edge: 8, vertices: [1, 2], t: 0.5 },
      },
      { position: { x: 1, y: 0, z: 0 } },
    ]);
    const second = chain([
      { position: { x: 0, y: 0, z: 1 } },
      { position: { x: 1, y: 0, z: 1 } },
    ]);
    const inference = inferQuadStrip(first, second, mesh);
    expect(inference.kind).toBe("accepted");
    if (inference.kind !== "accepted") return;

    const sequence = createQuadRequestSequence(inference.candidates);
    const firstStep = sequence.start(mesh);
    expect(command(firstStep)).toEqual({ kind: "splitEdge", edge: 8, t: 0.5 });

    mesh.addVertex(100, { x: 0, y: 0, z: 0 });
    const next = sequence.continue(appliedResult(mesh, { vertices: [100] }), mesh);
    expect(command(next).kind).toBe("createVertex");
  });

  it("rejects missing stable-ID feedback and never emits topology", () => {
    const mesh = new FakeMeshQuery();
    const sequence = createQuadRequestSequence(newSurfaceCandidate(mesh));
    expect(command(sequence.start(mesh)).kind).toBe("createVertex");

    const rejected = sequence.continue(appliedResult(mesh, {}), mesh);
    expect(rejected).toEqual({
      kind: "rejected",
      reason: "anchor mutation must create exactly one stable vertex ID",
    });
    expect(() => sequence.continue(appliedResult(mesh, {}), mesh)).toThrow(
      "not waiting for a mutation result",
    );
  });

  it("is idempotently cancellable and fails before producing later requests", () => {
    const mesh = new FakeMeshQuery();
    const sequence = createQuadRequestSequence(newSurfaceCandidate(mesh));
    expect(command(sequence.start(mesh)).kind).toBe("createVertex");
    sequence.cancel();
    sequence.cancel();
    sequence.dispose();

    const fakePosition: Vec3 = { x: 0, y: 0, z: 0 };
    mesh.addVertex(100, fakePosition);
    expect(() =>
      sequence.continue(appliedResult(mesh, { vertices: [100] }), mesh),
    ).toThrow(expected.cancelError);
    expect(() => sequence.start(mesh)).toThrow(expected.cancelError);
  });
});
