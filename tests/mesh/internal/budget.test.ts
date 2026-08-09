import { describe, expect, it } from "vitest";
import type { SerializedMesh } from "@octopoly/contracts";
import { MeshKernelFactory } from "../../../src/mesh";

describe("ADR-0005 mesh hard-limit fixture", () => {
  it("restores and deterministically snapshots 250,000 isolated vertices without recursion", () => {
    const source: SerializedMesh = {
      version: 0,
      vertices: Array.from({ length: 250_000 }, (_, id) => ({
        id,
        position: { x: id % 1_000, y: Math.floor(id / 1_000), z: 0 },
      })),
      edges: [],
      corners: [],
      faces: [],
      attributes: [],
    };

    const mesh = new MeshKernelFactory().restore(source);
    const snapshot = mesh.snapshot();
    expect(snapshot.vertices).toHaveLength(250_000);
    expect(snapshot.vertices[0]?.id).toBe(0);
    expect(snapshot.vertices.at(-1)?.id).toBe(249_999);
  });
});
