import { describe, expect, it } from "vitest";
import type { SerializedMesh } from "@octopoly/contracts";
import { MeshKernelFactory } from "../../../src/mesh";

describe("MeshKernelFactory serialization", () => {
  it("preserves version, stable ids, topology, and generic attributes", () => {
    const factory = new MeshKernelFactory();
    const mesh = factory.createEmpty();
    mesh.execute("build", {
      kind: "batch",
      commands: [
        { kind: "createVertex", position: { x: 0, y: 0, z: 0 } },
        { kind: "createVertex", position: { x: 1, y: 0, z: 0 } },
        { kind: "createVertex", position: { x: 0, y: 1, z: 0 } },
        { kind: "createFace", vertices: [0, 1, 2] },
        {
          kind: "setAttribute",
          key: { domain: "face", name: "tag" },
          values: new Map([[0, "fixture"]]),
        },
      ],
    });
    const serialized = mesh.serialize();
    const restored = factory.restore(serialized);
    expect(restored.serialize()).toEqual(serialized);
    expect(restored.snapshot().attributes.get({ domain: "face", name: "tag" }, 0)).toBe("fixture");
  });

  it("atomically rejects malformed records, duplicate ids, and wrong-domain attributes", () => {
    const factory = new MeshKernelFactory();
    const empty: SerializedMesh = {
      version: 0,
      vertices: [], edges: [], corners: [], faces: [], attributes: [],
    };
    expect(() => factory.restore({
      ...empty,
      vertices: [
        { id: 0, position: { x: 0, y: 0, z: 0 } },
        { id: 0, position: { x: 1, y: 0, z: 0 } },
      ],
    })).toThrow("duplicate vertex");
    expect(() => factory.restore({
      ...empty,
      attributes: [{ domain: "face", name: "bad", entries: [[0, true]] }],
    })).toThrow("references missing face");
    expect(factory.createEmpty().serialize()).toEqual(empty);
  });
});
