import { describe, expect, it } from "vitest";

import { buildSurfaceChain } from "../../../src/retopo/surface-chain";
import {
  adjacencyMesh,
  crossingEdgesMesh,
  FakeMeshQuery,
  hitInput,
  missInput,
  scaleMesh,
} from "../fixtures/surfaces/surface-fixtures";

describe("buildSurfaceChain", () => {
  it("builds the same frozen chain regardless of MeshQuery snapshot ordering", () => {
    const inputs = [
      hitInput({ x: 0, y: 0, z: 0 }, 0),
      hitInput({ x: 0.5, y: 0, z: 0 }, 1),
      hitInput({ x: 1.5, y: 0, z: 0 }, 2),
    ];

    const forward = buildSurfaceChain(inputs, adjacencyMesh(false));
    const reversed = buildSurfaceChain(inputs, adjacencyMesh(true));

    expect(forward).toEqual(reversed);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
    expect(Object.isFrozen(forward)).toBe(true);
    if (forward.kind !== "complete") {
      throw new Error("expected a complete chain");
    }
    expect(forward.chain.points.map((point) => point.anchor)).toEqual([
      { kind: "vertex", vertex: 9 },
      { kind: "edge", edge: 20, vertices: [9, 2], t: 0.5 },
      { kind: "edge", edge: 10, vertices: [2, 7], t: 0.5 },
    ]);
    expect(forward.chain.segments).toEqual([
      {
        from: 0,
        to: 1,
        continuity: { kind: "mesh-edge", edge: 20, adjacentFaces: [1, 4] },
      },
      {
        from: 1,
        to: 2,
        continuity: { kind: "shared-vertex", vertex: 2, incidentEdges: [10, 20] },
      },
    ]);
  });

  it("rejects a surface miss and preserves only the deterministic prefix", () => {
    const mesh = new FakeMeshQuery();
    const result = buildSurfaceChain(
      [
        hitInput({ x: 0, y: 0, z: 0 }, 0),
        hitInput({ x: 1, y: 0, z: 0 }, 1),
        missInput(2),
        hitInput({ x: 3, y: 0, z: 0 }, 3),
      ],
      mesh,
    );

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "surface-miss",
      inputIndex: 2,
    });
    if (result.kind !== "rejected") {
      throw new Error("expected a rejected chain");
    }
    expect(result.partial.points.map((point) => point.inputIndex)).toEqual([0, 1]);
  });

  it("rejects normal and surface discontinuities without adding the breaking hit", () => {
    const flipped = buildSurfaceChain(
      [
        hitInput({ x: 0, y: 0, z: 0 }, 0),
        hitInput({ x: 1, y: 0, z: 0 }, 1, { x: 0, y: -1, z: 0 }),
      ],
      new FakeMeshQuery(),
    );
    const changedSurface = buildSurfaceChain(
      [
        hitInput({ x: 0, y: 0, z: 0 }, 0),
        hitInput({ x: 1, y: 0, z: 0 }, 1, { x: 0, y: 1, z: 0 }, "other"),
      ],
      new FakeMeshQuery(),
    );

    expect(flipped).toMatchObject({
      kind: "rejected",
      reason: "normal-discontinuity",
      inputIndex: 1,
      partial: { points: [{ inputIndex: 0 }] },
    });
    expect(changedSurface).toMatchObject({
      kind: "rejected",
      reason: "surface-discontinuity",
      inputIndex: 1,
      partial: { points: [{ inputIndex: 0 }] },
    });
  });

  it("rejects non-finite canonical input before consulting MeshQuery", () => {
    const invalid = hitInput({ x: Number.NaN, y: 0, z: 0 }, 0);
    const mesh = new FakeMeshQuery();

    expect(() => buildSurfaceChain([invalid], mesh)).toThrow(
      "retopo input 0 hit position.x must be finite",
    );
    expect(mesh.snapshotCalls).toBe(0);

    const valid = hitInput({ x: 0, y: 0, z: 0 }, 0);
    const invalidSample = {
      ...valid,
      sample: { ...valid.sample, timestamp: Number.POSITIVE_INFINITY },
    };
    expect(() => buildSurfaceChain([invalidSample], mesh)).toThrow(
      "retopo input 0 timestamp must be finite",
    );
    expect(mesh.snapshotCalls).toBe(0);
  });

  it("reports degenerate normals and zero-length chains as normal rejection results", () => {
    const degenerateNormalMesh = new FakeMeshQuery();
    const degenerateNormal = buildSurfaceChain(
      [hitInput({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 0, z: 0 })],
      degenerateNormalMesh,
    );
    const zeroLength = buildSurfaceChain(
      [
        hitInput({ x: 2, y: 0, z: 0 }, 0),
        hitInput({ x: 2, y: 0, z: 0 }, 1),
      ],
      new FakeMeshQuery(),
    );

    expect(degenerateNormal).toEqual({
      kind: "rejected",
      reason: "degenerate-hit",
      inputIndex: 0,
      partial: { points: [], segments: [] },
    });
    expect(degenerateNormalMesh.snapshotCalls).toBe(0);
    expect(zeroLength).toMatchObject({
      kind: "rejected",
      reason: "degenerate-chain",
      partial: { points: [{ inputIndex: 0 }], segments: [] },
    });
  });

  it("uses distance, vertex-before-edge kind, then stable numeric ID for snap ties", () => {
    const crossingInputs = [
      hitInput({ x: 0, y: 0, z: 0 }, 0),
      hitInput({ x: 0.25, y: 0, z: 0 }, 1),
    ];
    const crossingForward = buildSurfaceChain(crossingInputs, crossingEdgesMesh(false));
    const crossingReverse = buildSurfaceChain(crossingInputs, crossingEdgesMesh(true));
    const endpoint = buildSurfaceChain(
      [
        hitInput({ x: 0, y: 0, z: 0 }, 0),
        hitInput({ x: 0.5, y: 0, z: 0 }, 1),
      ],
      adjacencyMesh(),
    );

    expect(crossingForward).toEqual(crossingReverse);
    if (crossingForward.kind !== "complete" || endpoint.kind !== "complete") {
      throw new Error("expected complete tie fixtures");
    }
    expect(crossingForward.chain.points[0]?.anchor).toEqual({
      kind: "edge",
      edge: 5,
      vertices: [3, 4],
      t: 0.5,
    });
    expect(endpoint.chain.points[0]?.anchor).toEqual({ kind: "vertex", vertex: 9 });
  });

  it("normalizes finite non-unit hit normals before deterministic continuity checks", () => {
    const result = buildSurfaceChain(
      [
        hitInput({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 2, z: 0 }),
        hitInput({ x: 1, y: 0, z: 0 }, 1, { x: 0, y: 4, z: 0 }),
      ],
      new FakeMeshQuery(),
    );

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.chain.points.map((point) => point.normal)).toEqual([
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
      ]);
    }
  });

  it.each([
    { sceneScale: 1e-6, snapOffset: 0.5e-9 },
    { sceneScale: 1, snapOffset: 0.5e-9 },
    { sceneScale: 1e6, snapOffset: 0.5e-3 },
  ])("uses the ADR distance tolerance at $sceneScale project-unit scale", ({ sceneScale, snapOffset }) => {
    const result = buildSurfaceChain(
      [
        hitInput({ x: snapOffset, y: 0, z: 0 }, 0),
        hitInput({ x: sceneScale / 2, y: 0, z: 0 }, 1),
      ],
      scaleMesh(sceneScale),
    );

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.chain.points[0]?.anchor).toEqual({ kind: "vertex", vertex: 1 });
      expect(result.chain.points[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
    }
  });
});
