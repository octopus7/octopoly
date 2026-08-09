import { describe, expect, it } from "vitest";
import { MeshKernel } from "../../../src/mesh";

describe("KernelMeshPatch", () => {
  it("round-trips topology, attributes, ids, and versions", () => {
    const mesh = new MeshKernel();
    mesh.execute("vertices", {
      kind: "batch",
      commands: [
        { kind: "createVertex", position: { x: 0, y: 0, z: 0 } },
        { kind: "createVertex", position: { x: 1, y: 0, z: 0 } },
        { kind: "createVertex", position: { x: 0, y: 1, z: 0 } },
      ],
    });
    const before = mesh.serialize();
    const result = mesh.execute("face and attribute", {
      kind: "batch",
      commands: [
        { kind: "createFace", vertices: [0, 1, 2] },
        {
          kind: "setAttribute",
          key: { domain: "vertex", name: "weight" },
          values: new Map([[0, 0.5]]),
        },
      ],
    });
    const after = mesh.serialize();

    result.patch.revert();
    expect(mesh.serialize()).toEqual(before);
    result.patch.apply();
    expect(mesh.serialize()).toEqual(after);
    expect(mesh.snapshot().attributes.get({ domain: "vertex", name: "weight" }, 0)).toBe(0.5);
  });

  it("rejects duplicate lifecycle calls without changing state", () => {
    const mesh = new MeshKernel();
    const result = mesh.execute("create", {
      kind: "createVertex",
      position: { x: 0, y: 0, z: 0 },
    });
    const after = mesh.serialize();
    expect(() => result.patch.apply()).toThrow("state mismatch");
    expect(mesh.serialize()).toEqual(after);
    result.patch.revert();
    const before = mesh.serialize();
    expect(() => result.patch.revert()).toThrow("state mismatch");
    expect(mesh.serialize()).toEqual(before);
  });

  it("does not reuse reverted ids and permits the original patch to restore them", () => {
    const mesh = new MeshKernel();
    const original = mesh.execute("first", {
      kind: "createVertex",
      position: { x: 0, y: 0, z: 0 },
    });
    original.patch.revert();
    const other = mesh.execute("other", {
      kind: "createVertex",
      position: { x: 1, y: 0, z: 0 },
    });
    expect(other.created.vertices).toEqual([1]);
    other.patch.revert();
    original.patch.apply();
    expect(mesh.snapshot().vertices.map(({ id }) => id)).toEqual([0]);
  });

  it("rejects disposed patches before mutation", () => {
    const mesh = new MeshKernel();
    const result = mesh.execute("create", {
      kind: "createVertex",
      position: { x: 0, y: 0, z: 0 },
    });
    result.patch.revert();
    result.patch.dispose?.();
    const before = mesh.serialize();
    expect(() => result.patch.apply()).toThrow("disposed");
    expect(mesh.serialize()).toEqual(before);
  });
});
