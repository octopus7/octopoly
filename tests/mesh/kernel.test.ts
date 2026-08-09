import { describe, expect, it } from "vitest";
import type { MeshDocument, MeshFactory, MeshSnapshot } from "@octopoly/contracts";
import { MeshKernel, MeshKernelFactory } from "../../src/mesh";

describe("MeshKernel service", () => {
  it("is assignable to the canonical document and factory contracts", () => {
    const document: MeshDocument = new MeshKernel();
    const factory: MeshFactory = new MeshKernelFactory();
    expect(document.snapshot().version).toBe(0);
    expect(factory.createEmpty().snapshot().vertices).toEqual([]);
  });

  it("keeps validate side-effect free and failed batches atomic", () => {
    const mesh = new MeshKernel();
    const invalid = {
      kind: "batch" as const,
      commands: [
        { kind: "createVertex" as const, position: { x: 0, y: 0, z: 0 } },
        { kind: "createFace" as const, vertices: [0, 1, 2] },
      ],
    };
    const before = mesh.serialize();

    expect(mesh.validate(invalid)).not.toEqual([]);
    expect(mesh.serialize()).toEqual(before);
    expect(() => mesh.execute("invalid", invalid)).toThrow();
    expect(mesh.serialize()).toEqual(before);

    const created = mesh.execute("create", {
      kind: "createVertex",
      position: { x: 0, y: 0, z: 0 },
    });
    expect(created.created.vertices).toEqual([0]);
    expect(created.snapshot.version).toBe(1);
  });

  it("isolates immutable snapshots from later mutations", () => {
    const mesh = new MeshKernel();
    const first = mesh.execute("create", {
      kind: "createVertex",
      position: { x: 1, y: 2, z: 3 },
    }).snapshot;
    mesh.execute("move", {
      kind: "setVertexPositions",
      positions: new Map([[0, { x: 4, y: 5, z: 6 }]]),
    });

    expect(first.vertices[0]?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(Object.isFrozen(first.vertices[0]?.position)).toBe(true);
    expect(mesh.vertex(0)?.position).toEqual({ x: 4, y: 5, z: 6 });
  });

  it("rejects non-finite geometry before changing version or allocator", () => {
    const mesh = new MeshKernel();
    const command = { kind: "createVertex" as const, position: { x: Number.NaN, y: 0, z: 0 } };
    expect(mesh.validate(command)[0]).toContain("finite");
    expect(() => mesh.execute("bad", command)).toThrow();
    expect(mesh.snapshot()).toMatchObject({ version: 0, vertices: [] });
    expect(mesh.execute("good", { kind: "createVertex", position: { x: 0, y: 0, z: 0 } }).created.vertices)
      .toEqual([0]);
  });

  it("reports created, updated, deleted, and affected element sets from actual state differences", () => {
    const mesh = new MeshKernel();
    mesh.execute("vertices", {
      kind: "batch",
      commands: [
        { kind: "createVertex", position: { x: 0, y: 0, z: 0 } },
        { kind: "createVertex", position: { x: 1, y: 0, z: 0 } },
        { kind: "createVertex", position: { x: 0, y: 1, z: 0 } },
      ],
    });
    const face = mesh.execute("face", { kind: "createFace", vertices: [0, 1, 2] });
    expect(face.created).toEqual({ vertices: [], edges: [0, 1, 2], corners: [0, 1, 2], faces: [0] });
    expect(face.updated.vertices).toEqual([0, 1, 2]);
    expect(face.patch.affected.faces).toEqual([0]);

    const attribute = mesh.execute("attribute", {
      kind: "setAttribute",
      key: { domain: "face", name: "generic" },
      values: new Map([[0, true]]),
    });
    expect(attribute.updated.faces).toEqual([0]);
    expect(attribute.created.faces).toEqual([]);

    const deleted = mesh.execute("delete", { kind: "deleteElements", elements: { faces: [0] } });
    expect(deleted.deleted.faces).toEqual([0]);
    expect(deleted.deleted.corners).toEqual([0, 1, 2]);
    expect(deleted.deleted.edges).toEqual([0, 1, 2]);
    expect(deleted.updated.vertices).toEqual([0, 1, 2]);
  });

  it("makes dispose idempotent and rejects later access", () => {
    const mesh = new MeshKernel();
    mesh.dispose();
    mesh.dispose();
    expect(() => mesh.snapshot()).toThrow("disposed");
  });

  const acceptsSnapshot = (snapshot: MeshSnapshot): number => snapshot.version;
  void acceptsSnapshot;
});
