import type { EdgeId, MeshQuery, OverlayPrimitive, ToolPreview, Vec3, Vec4 } from "@octopoly/contracts";

import type { GuidedDensityBand } from "../analysis/topology-diagnostics.ts";

export interface GuidedFlowPreviewInput {
  readonly expectedMeshVersion: number;
  readonly lessonId: string;
  readonly stepId: string;
  readonly flowPreviewSeed: string;
  readonly regionEdgeIds: ReadonlyArray<EdgeId>;
  readonly densityBand: GuidedDensityBand;
}

export interface GuidedPreviewPublication {
  current(mesh: MeshQuery): ToolPreview | null;
  cancel(): void;
  dispose(): void;
}

export type GuidedFlowPreviewResult =
  | { readonly status: "ready"; readonly publication: GuidedPreviewPublication }
  | { readonly status: "stale-mesh-version"; readonly expected: number; readonly actual: number }
  | { readonly status: "invalid-region"; readonly missingEdgeIds: ReadonlyArray<EdgeId> };

const FLOW_COLOR: Vec4 = Object.freeze({ x: 0.2, y: 0.8, z: 1, w: 1 });
const DENSE_COLOR: Vec4 = Object.freeze({ x: 1, y: 0.75, z: 0.15, w: 1 });
const SPARSE_COLOR: Vec4 = Object.freeze({ x: 0.8, y: 0.3, z: 1, w: 1 });

function freezePositions(values: ReadonlyArray<Vec3>): ReadonlyArray<Vec3> {
  return Object.freeze(values.map((value) => Object.freeze({ ...value })));
}

function edgeLength(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function publication(preview: ToolPreview, source: MeshQuery, expectedVersion: number): GuidedPreviewPublication {
  let active = true;
  return Object.freeze({
    current(mesh: MeshQuery): ToolPreview | null {
      if (!active || mesh !== source || mesh.snapshot().version !== expectedVersion) return null;
      return preview;
    },
    cancel(): void { active = false; },
    dispose(): void { active = false; },
  });
}

export function buildGuidedFlowPreview(mesh: MeshQuery, input: GuidedFlowPreviewInput): GuidedFlowPreviewResult {
  const snapshot = mesh.snapshot();
  if (snapshot.version !== input.expectedMeshVersion) {
    return Object.freeze({ status: "stale-mesh-version", expected: input.expectedMeshVersion, actual: snapshot.version });
  }
  const edgeIds = [...new Set(input.regionEdgeIds)].sort((a, b) => a - b);
  const missing = edgeIds.filter((id) => mesh.edge(id) === null);
  if (missing.length > 0) return Object.freeze({ status: "invalid-region", missingEdgeIds: Object.freeze(missing) });

  const edges: Array<{ readonly id: EdgeId; readonly first: Vec3; readonly second: Vec3; readonly length: number }> = [];
  for (const id of edgeIds) {
    const edge = mesh.edge(id);
    if (edge === null) continue;
    const first = mesh.vertex(edge.vertices[0]);
    const second = mesh.vertex(edge.vertices[1]);
    if (first === null || second === null) {
      return Object.freeze({ status: "invalid-region", missingEdgeIds: Object.freeze([id]) });
    }
    edges.push({ id, first: first.position, second: second.position, length: edgeLength(first.position, second.position) });
  }

  const orderedLengths = edges.map((edge) => edge.length).filter((value) => value > 0).sort((a, b) => a - b);
  const median = orderedLengths[Math.floor(orderedLengths.length / 2)] ?? 0;
  const primitives: OverlayPrimitive[] = [];
  for (const edge of edges) {
    const positions = freezePositions([edge.first, edge.second]);
    primitives.push(Object.freeze({ kind: "polyline", positions, color: FLOW_COLOR, widthCssPx: 2 }));
    if (median > 0) {
      const ratio = edge.length / median;
      const densityColor = ratio < input.densityBand.minRatio
        ? DENSE_COLOR
        : ratio > input.densityBand.maxRatio ? SPARSE_COLOR : null;
      if (densityColor !== null) {
        primitives.push(Object.freeze({ kind: "points", positions, color: densityColor, sizeCssPx: 5 }));
      }
    }
  }
  const identity = [
    "guided",
    encodeURIComponent(input.lessonId),
    encodeURIComponent(input.stepId),
    encodeURIComponent(input.flowPreviewSeed),
    `mesh-${snapshot.version}`,
    `region-${edgeIds.join(".")}`,
    `density-${input.densityBand.minRatio}-${input.densityBand.maxRatio}`,
  ].join(":");
  const preview: ToolPreview = Object.freeze({
    id: identity,
    revision: snapshot.version,
    primitives: Object.freeze(primitives),
  });
  return Object.freeze({ status: "ready", publication: publication(preview, mesh, snapshot.version) });
}
