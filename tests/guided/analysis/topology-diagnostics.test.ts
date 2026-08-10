import { describe, expect, it } from "vitest";

import {
  analyzeTopology,
  evaluatePurposeConstraints,
} from "../../../src/guided/analysis/topology-diagnostics.ts";
import {
  adversarialNonManifoldFixture,
  CanonicalMeshFixture,
  closedLoopFixture,
  openChainFixture,
} from "../fixtures/meshes/canonical-mesh-fixtures.ts";

const translatedUnitTriangle = () => new CanonicalMeshFixture({
  version: 9,
  positions: {
    1: { x: 1_000_000, y: 1_000_000, z: 0 },
    2: { x: 1_000_001, y: 1_000_000, z: 0 },
    3: { x: 1_000_000, y: 1_000_001, z: 0 },
  },
  faces: [{ id: 50, vertices: [1, 2, 3] }],
});

const disconnectedTrianglesAtDifferentScales = () => new CanonicalMeshFixture({
  version: 10,
  positions: {
    1: { x: 0, y: 0, z: 0 },
    2: { x: 1, y: 0, z: 0 },
    3: { x: 0, y: 1, z: 0 },
    4: { x: 1_000_000_000, y: 1_000_000_000, z: 0 },
    5: { x: 1_000_000_001, y: 1_000_000_000, z: 0 },
    6: { x: 1_000_000_000, y: 1_000_000_001, z: 0 },
  },
  faces: [
    { id: 70, vertices: [1, 2, 3] },
    { id: 71, vertices: [4, 5, 6] },
  ],
});

const nonUniformLoop = () => new CanonicalMeshFixture({
  version: 4,
  positions: {
    1: { x: 0, y: 0, z: 0 },
    2: { x: 10, y: 0, z: 0 },
    3: { x: 10, y: 1, z: 0 },
    4: { x: 0, y: 1, z: 0 },
  },
  faces: [{ id: 60, vertices: [1, 2, 3, 4] }],
});

describe("topology diagnostics", () => {
  it("orders non-manifold, degenerate, pole, and density findings deterministically by severity/code/stable ID", () => {
    const mesh = adversarialNonManifoldFixture();
    const first = analyzeTopology(mesh, { densityBand: { minRatio: 0.75, maxRatio: 1.25 } });
    const second = analyzeTopology(adversarialNonManifoldFixture(), { densityBand: { minRatio: 0.75, maxRatio: 1.25 } });

    expect(first).toEqual(second);
    expect(first.map((item) => `${item.severity}:${item.code}:${item.element.kind}:${item.element.id}`)).toEqual(
      [...first.map((item) => `${item.severity}:${item.code}:${item.element.kind}:${item.element.id}`)].sort(),
    );
    expect(first).toContainEqual(expect.objectContaining({
      severity: "completion-blocker",
      code: "non-manifold-edge",
      element: { kind: "edge", id: 12 },
    }));
    expect(first).toContainEqual(expect.objectContaining({
      severity: "completion-blocker",
      code: "non-manifold-edge",
      element: { kind: "edge", id: 90 },
    }));
  });

  it("uses local extent rather than world-origin distance for degeneracy tolerance", () => {
    expect(analyzeTopology(translatedUnitTriangle(), {}).some((item) => item.code === "degenerate-face")).toBe(false);
  });

  it("uses face-local extent when disconnected components are far apart", () => {
    const degenerates = analyzeTopology(disconnectedTrianglesAtDifferentScales(), {})
      .filter((item) => item.code === "degenerate-face");
    expect(degenerates).toEqual([]);
  });

  it("accepts distinct closed-loop layouts without comparing hidden answer coordinates", () => {
    const square = closedLoopFixture({ version: 3, radius: 1, startId: 10 });
    const diamond = closedLoopFixture({ version: 3, radius: 4, startId: 100, rotationRadians: Math.PI / 4 });
    const goal = { constraintIds: ["closed-loop", "manifold"], regionEdgeIds: square.snapshot().edges.map((edge) => edge.id) } as const;
    const alternativeGoal = { ...goal, regionEdgeIds: diamond.snapshot().edges.map((edge) => edge.id) };

    expect(evaluatePurposeConstraints(square, goal)).toMatchObject({ satisfied: true, blockers: [] });
    expect(evaluatePurposeConstraints(diamond, alternativeGoal)).toMatchObject({ satisfied: true, blockers: [] });
  });

  it("accepts a closed support corridor without prescribing its coordinates", () => {
    const mesh = closedLoopFixture({ version: 5, radius: 3, startId: 200, segments: 6 });
    expect(evaluatePurposeConstraints(mesh, {
      constraintIds: ["joint-support", "manifold"],
      regionEdgeIds: mesh.snapshot().edges.map((edge) => edge.id),
    })).toMatchObject({ satisfied: true, blockers: [] });
  });

  it("does not let repeated stable IDs satisfy a minimum support count", () => {
    const mesh = closedLoopFixture({ version: 5, segments: 6 });
    const edgeId = mesh.snapshot().edges[0]?.id;
    if (edgeId === undefined) throw new Error("fixture must contain an edge");
    expect(evaluatePurposeConstraints(mesh, {
      constraintIds: ["joint-support"],
      regionEdgeIds: [edgeId, edgeId, edgeId, edgeId, edgeId, edgeId],
    }).satisfied).toBe(false);
  });

  it("evaluates density-band as actionable nonblocking diagnostics", () => {
    const mesh = nonUniformLoop();
    const result = evaluatePurposeConstraints(mesh, {
      constraintIds: ["closed-loop", "density-band"],
      regionEdgeIds: mesh.snapshot().edges.map((edge) => edge.id),
      densityBand: { minRatio: 0.5, maxRatio: 1.5 },
    });
    expect(result.satisfied).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "density-too-high",
    }));
  });

  it("blocks only lesson completion for an open loop and returns stable actionable elements", () => {
    const mesh = openChainFixture();
    const result = evaluatePurposeConstraints(mesh, {
      constraintIds: ["closed-loop", "manifold"],
      regionEdgeIds: mesh.snapshot().edges.map((edge) => edge.id).sort((a, b) => a - b).slice(0, 3),
    });

    expect(result.satisfied).toBe(false);
    expect(result.blockers).toEqual([
      expect.objectContaining({ severity: "completion-blocker", code: "open-loop" }),
    ]);
  });
});
