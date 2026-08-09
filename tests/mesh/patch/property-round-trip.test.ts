import { describe, expect, it } from "vitest";
import { MeshKernel } from "../../../src/mesh";

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("mesh patch deterministic properties", () => {
  it("round-trips seeded position and attribute sequences", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const random = pseudoRandom(seed);
      const mesh = new MeshKernel();
      const creation = mesh.execute("seed vertices", {
        kind: "batch",
        commands: Array.from({ length: 12 }, () => ({
          kind: "createVertex" as const,
          position: { x: random(), y: random(), z: random() },
        })),
      });
      const before = mesh.serialize();
      const positions = new Map(
        creation.snapshot.vertices.map(({ id }) => [
          id,
          { x: random() * 10, y: random() * 10, z: random() * 10 },
        ]),
      );
      const patch = mesh.execute("seed mutation", {
        kind: "batch",
        commands: [
          { kind: "setVertexPositions", positions },
          {
            kind: "setAttribute",
            key: { domain: "vertex", name: "seed" },
            values: new Map([...positions.keys()].map((id) => [id, random()])),
          },
        ],
      }).patch;
      const after = mesh.serialize();

      patch.revert();
      expect(mesh.serialize()).toEqual(before);
      patch.apply();
      expect(mesh.serialize()).toEqual(after);
    }
  });
});
