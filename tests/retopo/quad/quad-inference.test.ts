import { describe, expect, it } from "vitest";

import { inferQuadStrip } from "../../../src/retopo/quad";
import expected from "../fixtures/expected/quad-request.json";
import { bridgedFixture, chain, FakeMeshQuery } from "./fixtures";

describe("quad inference", () => {
  it("produces canonical winding and bridge ordering independent of chain direction", () => {
    const fixture = bridgedFixture();
    const forward = inferQuadStrip(fixture.first, fixture.second, fixture.mesh);
    expect(forward.kind).toBe("accepted");
    if (forward.kind !== "accepted") return;

    const reversedFirst = chain(
      [...fixture.first.points]
        .reverse()
        .map((point) => ({ position: point.position, normal: point.normal, anchor: point.anchor })),
      { kind: "mesh-edge", edge: 5, adjacentFaces: [40] },
    );
    const reversedSecond = chain(
      [...fixture.second.points]
        .reverse()
        .map((point) => ({ position: point.position, normal: point.normal, anchor: point.anchor })),
      { kind: "mesh-edge", edge: 6, adjacentFaces: [41] },
    );
    const reversed = inferQuadStrip(reversedFirst, reversedSecond, fixture.mesh);
    expect(reversed.kind).toBe("accepted");
    if (reversed.kind !== "accepted") return;

    const ids = (candidate: (typeof forward.candidates)[number]) =>
      candidate.corners.map((point) =>
        point.anchor.kind === "vertex" ? point.anchor.vertex : null,
      );
    expect(ids(forward.candidates[0]!)).toEqual([10, 20, 21, 11]);
    expect(ids(reversed.candidates[0]!)).toEqual([10, 20, 21, 11]);
    expect(reversed.candidates[0]).toMatchObject({
      normal: { x: 0, y: 1, z: 0 },
      bridge: { first: [5], second: [6] },
    });
  });

  it.each([
    ["unit", 1],
    ["large", 1_000_000],
  ])("accepts a finite non-degenerate %s-scale quad", (_label, scale) => {
    const mesh = new FakeMeshQuery();
    const first = chain([
      { position: { x: 0, y: 0, z: 0 } },
      { position: { x: scale, y: 0, z: 0 } },
    ]);
    const second = chain([
      { position: { x: 0, y: 0, z: scale } },
      { position: { x: scale, y: 0, z: scale } },
    ]);

    expect(inferQuadStrip(first, second, mesh).kind).toBe("accepted");
  });

  it("rejects duplicate and zero-area corners deterministically", () => {
    const mesh = new FakeMeshQuery();
    const first = chain([
      { position: { x: 0, y: 0, z: 0 } },
      { position: { x: 1, y: 0, z: 0 } },
    ]);
    const duplicate = chain([
      { position: { x: 0, y: 0, z: 0 } },
      { position: { x: 1, y: 0, z: 0 } },
    ]);
    expect(inferQuadStrip(first, duplicate, mesh)).toEqual({
      kind: "rejected",
      reason: "duplicate-corner",
      candidateIndex: 0,
    });

    const collinear = chain([
      { position: { x: 2, y: 0, z: 0 } },
      { position: { x: 3, y: 0, z: 0 } },
    ]);
    expect(inferQuadStrip(first, collinear, mesh)).toEqual(expected.degenerate);
  });

  it("rejects a perimeter edge that already has two adjacent faces", () => {
    const fixture = bridgedFixture();
    fixture.mesh.setAdjacentFaces(5, [40, 42]);

    expect(inferQuadStrip(fixture.first, fixture.second, fixture.mesh)).toEqual({
      kind: "rejected",
      reason: "non-manifold-risk",
      candidateIndex: 0,
    });
  });

  it("rejects non-finite geometry before emitting candidates", () => {
    const mesh = new FakeMeshQuery();
    const first = chain([
      { position: { x: 0, y: 0, z: 0 } },
      { position: { x: Number.NaN, y: 0, z: 0 } },
    ]);
    const second = chain([
      { position: { x: 0, y: 0, z: 1 } },
      { position: { x: 1, y: 0, z: 1 } },
    ]);

    expect(inferQuadStrip(first, second, mesh)).toEqual({
      kind: "rejected",
      reason: "non-finite-geometry",
      candidateIndex: null,
    });
  });
});
