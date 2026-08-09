import { describe, expect, it, vi } from "vitest";

import type {
  CornerId,
  CornerRecord,
  EdgeId,
  EdgeRecord,
  FaceId,
  FaceRecord,
  MeshQuery,
  MeshSnapshot,
  VertexId,
  VertexRecord,
} from "@octopoly/contracts";

import { SelectionStore } from "../../../src/selection/state";

const position = Object.freeze({ x: 0, y: 0, z: 0 });

class LookupOnlyMesh implements MeshQuery {
  readonly calls = {
    vertices: [] as VertexId[],
    edges: [] as EdgeId[],
    faces: [] as FaceId[],
  };

  constructor(
    private readonly liveVertices: ReadonlySet<VertexId>,
    private readonly liveEdges: ReadonlySet<EdgeId>,
    private readonly liveFaces: ReadonlySet<FaceId>,
    private readonly failingFace?: FaceId,
  ) {}

  snapshot(): MeshSnapshot {
    throw new Error("prune must not enumerate a mesh snapshot");
  }

  vertex(id: VertexId): VertexRecord | null {
    this.calls.vertices.push(id);
    return this.liveVertices.has(id) ? { id, position } : null;
  }

  edge(id: EdgeId): EdgeRecord | null {
    this.calls.edges.push(id);
    return this.liveEdges.has(id) ? { id, vertices: [0, 1] } : null;
  }

  corner(_id: CornerId): CornerRecord | null {
    throw new Error("prune must not query corners");
  }

  face(id: FaceId): FaceRecord | null {
    this.calls.faces.push(id);
    if (id === this.failingFace) {
      throw new Error("lookup failed");
    }
    return this.liveFaces.has(id) ? { id, corners: [] } : null;
  }

  incidentEdges(_vertex: VertexId): ReadonlyArray<EdgeId> {
    throw new Error("prune must not query adjacency");
  }

  incidentFaces(_vertex: VertexId): ReadonlyArray<FaceId> {
    throw new Error("prune must not query adjacency");
  }

  adjacentFaces(_edge: EdgeId): ReadonlyArray<FaceId> {
    throw new Error("prune must not query adjacency");
  }

  findEdge(_a: VertexId, _b: VertexId): EdgeId | null {
    throw new Error("prune must not query adjacency");
  }
}

describe("SelectionStore.prune", () => {
  it("removes stale IDs from every domain with one atomic publication", () => {
    const store = new SelectionStore();
    store.update("replace", {
      vertices: new Set([1, 2, 3]),
      edges: new Set([10, 11]),
      faces: new Set([20, 21]),
    });
    const listener = vi.fn();
    store.subscribe(listener);
    const mesh = new LookupOnlyMesh(new Set([1, 3]), new Set([10]), new Set([21]));

    store.prune(mesh);

    const snapshot = store.snapshot();
    expect(snapshot.version).toBe(2);
    expect([...snapshot.vertices]).toEqual([1, 3]);
    expect([...snapshot.edges]).toEqual([10]);
    expect([...snapshot.faces]).toEqual([21]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.snapshot());
    expect(mesh.calls).toEqual({
      vertices: [1, 2, 3],
      edges: [10, 11],
      faces: [20, 21],
    });
  });

  it("is a no-op when every selected ID remains live", () => {
    const store = new SelectionStore();
    store.update("replace", {
      vertices: new Set([1]),
      edges: new Set([10]),
      faces: new Set([20]),
    });
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.snapshot();

    store.prune(new LookupOnlyMesh(new Set([1]), new Set([10]), new Set([20])));

    expect(store.snapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not partially change or publish state if a lookup fails", () => {
    const store = new SelectionStore();
    store.update("replace", {
      vertices: new Set([1, 2]),
      edges: new Set([10, 11]),
      faces: new Set([20, 21]),
    });
    const before = store.snapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    const mesh = new LookupOnlyMesh(new Set([1]), new Set([10]), new Set([20]), 21);

    expect(() => store.prune(mesh)).toThrow("lookup failed");
    expect(store.snapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
