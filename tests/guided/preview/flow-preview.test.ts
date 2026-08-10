import { describe, expect, it } from "vitest";

import { buildGuidedFlowPreview } from "../../../src/guided/preview/flow-preview.ts";
import {
  CanonicalMeshFixture,
  closedLoopFixture,
} from "../fixtures/meshes/canonical-mesh-fixtures.ts";

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

describe("guided flow preview", () => {
  it("creates a byte-stable canonical ToolPreview publication without mutating the query", () => {
    const mesh = closedLoopFixture({ version: 9, radius: 2, startId: 20, reverseSnapshotOrder: true });
    const edgeIds = mesh.snapshot().edges.map((edge) => edge.id).reverse();
    const beforeCalls = mesh.snapshotCalls;
    const first = buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 9,
      lessonId: "eye-loop",
      stepId: "encircle-eye",
      flowPreviewSeed: "eye-loop-clockwise",
      regionEdgeIds: edgeIds,
      densityBand: { minRatio: 0.75, maxRatio: 1.25 },
    });
    const second = buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 9,
      lessonId: "eye-loop",
      stepId: "encircle-eye",
      flowPreviewSeed: "eye-loop-clockwise",
      regionEdgeIds: [...edgeIds].reverse(),
      densityBand: { minRatio: 0.75, maxRatio: 1.25 },
    });

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    if (first.status !== "ready" || second.status !== "ready") return;
    const firstPreview = first.publication.current(mesh);
    const secondPreview = second.publication.current(mesh);
    expect(secondPreview).toEqual(firstPreview);
    expect(firstPreview?.id).toContain("guided:eye-loop:encircle-eye:eye-loop-clockwise:mesh-9");
    expect(firstPreview?.id).toContain(":region-");
    expect(firstPreview?.revision).toBe(9);
    expect(firstPreview?.primitives.every((primitive) => primitive.kind === "polyline" || primitive.kind === "points")).toBe(true);
    expect(mesh.snapshotCalls).toBeGreaterThan(beforeCalls);
  });

  it("invalidates publication after version change, cancel, or dispose", () => {
    const mesh = closedLoopFixture({ version: 4 });
    const ready = buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 4,
      lessonId: "joint-loop",
      stepId: "support-joint",
      flowPreviewSeed: "joint-support-ring",
      regionEdgeIds: mesh.snapshot().edges.map((edge) => edge.id),
      densityBand: { minRatio: 0.8, maxRatio: 1.2 },
    });
    if (ready.status !== "ready") throw new Error("fixture must build");
    expect(ready.publication.current(closedLoopFixture({ version: 5 }))).toBeNull();
    expect(ready.publication.current(closedLoopFixture({ version: 4 }))).toBeNull();
    expect(ready.publication.current(mesh)).not.toBeNull();
    ready.publication.cancel();
    expect(ready.publication.current(mesh)).toBeNull();

    const disposable = buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 4,
      lessonId: "joint-loop",
      stepId: "support-joint",
      flowPreviewSeed: "joint-support-ring",
      regionEdgeIds: mesh.snapshot().edges.map((edge) => edge.id),
      densityBand: { minRatio: 0.8, maxRatio: 1.2 },
    });
    if (disposable.status !== "ready") throw new Error("fixture must build");
    disposable.publication.dispose();
    expect(disposable.publication.current(mesh)).toBeNull();
  });

  it("reflects density bands in deterministic local overlay primitives", () => {
    const mesh = nonUniformLoop();
    const edgeIds = mesh.snapshot().edges.map((edge) => edge.id);
    const narrow = buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 4,
      lessonId: "mouth-loop",
      stepId: "inspect-density",
      flowPreviewSeed: "mouth-density-orbit",
      regionEdgeIds: edgeIds,
      densityBand: { minRatio: 0.5, maxRatio: 1.5 },
    });
    const wide = buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 4,
      lessonId: "mouth-loop",
      stepId: "inspect-density",
      flowPreviewSeed: "mouth-density-orbit",
      regionEdgeIds: edgeIds,
      densityBand: { minRatio: 0.05, maxRatio: 2 },
    });
    if (narrow.status !== "ready" || wide.status !== "ready") throw new Error("fixtures must build");
    const narrowPreview = narrow.publication.current(mesh);
    const widePreview = wide.publication.current(mesh);
    expect(narrowPreview).not.toEqual(widePreview);
    expect(narrowPreview?.id).not.toBe(widePreview?.id);
  });

  it("rejects stale versions without publishing a preview", () => {
    const mesh = closedLoopFixture({ version: 4 });
    expect(buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 3,
      lessonId: "joint-loop",
      stepId: "support-joint",
      flowPreviewSeed: "joint-support-ring",
      regionEdgeIds: [],
      densityBand: { minRatio: 0.8, maxRatio: 1.2 },
    })).toEqual({ status: "stale-mesh-version", expected: 3, actual: 4 });
  });

  it("rejects missing stable IDs instead of inventing geometry", () => {
    const mesh = closedLoopFixture({ version: 4 });
    expect(buildGuidedFlowPreview(mesh, {
      expectedMeshVersion: 4,
      lessonId: "mouth-loop",
      stepId: "inspect-density",
      flowPreviewSeed: "mouth-density-orbit",
      regionEdgeIds: [999],
      densityBand: { minRatio: 0.8, maxRatio: 1.2 },
    })).toEqual({ status: "invalid-region", missingEdgeIds: [999] });
  });
});
