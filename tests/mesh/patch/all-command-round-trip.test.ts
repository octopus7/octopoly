import { describe, expect, it } from "vitest";
import type { MeshCommand, Vec3 } from "@octopoly/contracts";
import { MeshKernel, MeshKernelFactory } from "../../../src/mesh";

const factory = new MeshKernelFactory();

function meshWith(
  positions: ReadonlyArray<Vec3>,
  faces: ReadonlyArray<ReadonlyArray<number>> = [],
): MeshKernel {
  const mesh = new MeshKernel();
  mesh.execute("fixture", {
    kind: "batch",
    commands: [
      ...positions.map((position) => ({ kind: "createVertex" as const, position })),
      ...faces.map((vertices) => ({ kind: "createFace" as const, vertices })),
    ],
  });
  return mesh;
}

function assertCommandRoundTrip(mesh: MeshKernel, command: MeshCommand): void {
  const before = mesh.serialize();
  expect(mesh.validate(command)).toEqual([]);
  expect(mesh.serialize()).toEqual(before);
  const result = mesh.execute(command.kind, command);
  const after = mesh.serialize();
  expect(result.patch.beforeVersion).toBe(before.version);
  expect(result.patch.afterVersion).toBe(after.version);
  expect(result.patch.afterVersion).toBe(result.patch.beforeVersion + 1);
  expect(factory.restore(after).serialize()).toEqual(after);

  result.patch.revert();
  expect(mesh.serialize()).toEqual(before);
  expect(factory.restore(mesh.serialize()).serialize()).toEqual(before);
  result.patch.apply();
  expect(mesh.serialize()).toEqual(after);
}

describe("every MeshCommand patch", () => {
  it("round-trips createVertex", () => {
    assertCommandRoundTrip(new MeshKernel(), {
      kind: "createVertex",
      position: { x: 1, y: 2, z: 3 },
    });
  });

  it("round-trips createFace", () => {
    assertCommandRoundTrip(meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ]), { kind: "createFace", vertices: [0, 1, 2] });
  });

  it("round-trips setVertexPositions", () => {
    assertCommandRoundTrip(meshWith([{ x: 0, y: 0, z: 0 }]), {
      kind: "setVertexPositions",
      positions: new Map([[0, { x: 3, y: 2, z: 1 }]]),
    });
  });

  it("round-trips deleteElements with dependent topology", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2]]);
    const corner = mesh.snapshot().faces[0]!.corners[0]!;
    mesh.execute("attributes", {
      kind: "batch",
      commands: [
        {
          kind: "setAttribute",
          key: { domain: "vertex", name: "vertex-data" },
          values: new Map([[0, 7]]),
        },
        {
          kind: "setAttribute",
          key: { domain: "corner", name: "corner-data" },
          values: new Map([[corner, [1, 2, 3]]]),
        },
        {
          kind: "setAttribute",
          key: { domain: "face", name: "face-data" },
          values: new Map([[0, "face"]]),
        },
      ],
    });
    assertCommandRoundTrip(mesh, { kind: "deleteElements", elements: { vertices: [0] } });
  });

  it("round-trips splitEdge", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2]]);
    assertCommandRoundTrip(mesh, { kind: "splitEdge", edge: mesh.findEdge(0, 1)!, t: 0.4 });
  });

  it("round-trips collapseEdge", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3]]);
    assertCommandRoundTrip(mesh, { kind: "collapseEdge", edge: mesh.findEdge(0, 1)!, keep: 0 });
  });

  it("round-trips dissolveEdges", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2], [0, 2, 3]]);
    assertCommandRoundTrip(mesh, { kind: "dissolveEdges", edges: [mesh.findEdge(0, 2)!] });
  });

  it("round-trips weldVertices", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3]]);
    assertCommandRoundTrip(mesh, {
      kind: "weldVertices",
      vertices: [0, 1],
      target: { x: 0.5, y: 0, z: 0 },
    });
  });

  it("round-trips bridgeEdges", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 2, z: 0 },
    ], [[0, 1, 2], [4, 3, 5]]);
    assertCommandRoundTrip(mesh, {
      kind: "bridgeEdges",
      first: [mesh.findEdge(0, 1)!],
      second: [mesh.findEdge(3, 4)!],
    });
  });

  it("round-trips extrudeEdges", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2]]);
    assertCommandRoundTrip(mesh, {
      kind: "extrudeEdges",
      edges: [mesh.findEdge(0, 1)!],
      offset: { x: 0, y: 0, z: 1 },
    });
  });

  it("round-trips extrudeFaces", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3]]);
    assertCommandRoundTrip(mesh, {
      kind: "extrudeFaces",
      faces: [0],
      offset: { x: 0, y: 0, z: 1 },
    });
  });

  it("round-trips rotateDiagonal", () => {
    const mesh = meshWith([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 },
    ], [[0, 1, 2], [1, 0, 3]]);
    assertCommandRoundTrip(mesh, { kind: "rotateDiagonal", edge: mesh.findEdge(0, 1)! });
  });

  it("round-trips setAttribute and nested batch as one version", () => {
    const mesh = meshWith([{ x: 0, y: 0, z: 0 }]);
    assertCommandRoundTrip(mesh, {
      kind: "batch",
      commands: [{
        kind: "batch",
        commands: [{
          kind: "setAttribute",
          key: { domain: "vertex", name: "generic" },
          values: new Map([[0, { x: 1, y: 2, z: 3 }]]),
        }],
      }],
    });
  });
});
