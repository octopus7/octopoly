import { vi } from "vitest";

import type {
  AttributeKey,
  AttributeValue,
  CameraSnapshot,
  EdgeId,
  FaceId,
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  Mat4,
  MeshCommand,
  MeshElementSet,
  MeshMutationResult,
  MeshPatch,
  MeshQuery,
  MeshSnapshot,
  PickHit,
  PickingService,
  PointerSample,
  ReversibleChange,
  SelectionChange,
  SelectionMode,
  SelectionService,
  SelectionSnapshot,
  SurfaceHit,
  ToolContext,
  ToolPreview,
  Vec2,
  Vec3,
  VertexId,
  ViewportSnapshot,
} from "@octopoly/contracts";

const identity: Mat4 = Object.freeze({
  elements: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
});

const camera: CameraSnapshot = Object.freeze({
  view: identity,
  projection: identity,
  viewProjection: identity,
  position: Object.freeze({ x: 0, y: 0, z: 5 }),
});

const viewport: ViewportSnapshot = Object.freeze({
  cssWidth: 800,
  cssHeight: 600,
  devicePixelRatio: 2,
});

const baseSnapshot: MeshSnapshot = {
  version: 0,
  vertices: [
    { id: 1, position: { x: 0, y: 0, z: 0 } },
    { id: 2, position: { x: 1, y: 0, z: 0 } },
    { id: 3, position: { x: 0, y: 1, z: 0 } },
  ],
  edges: [
    { id: 10, vertices: [1, 2] },
    { id: 11, vertices: [2, 3] },
    { id: 12, vertices: [3, 1] },
  ],
  corners: [
    { id: 100, face: 20, vertex: 1, edge: 10 },
    { id: 101, face: 20, vertex: 2, edge: 11 },
    { id: 102, face: 20, vertex: 3, edge: 12 },
  ],
  faces: [{ id: 20, corners: [100, 101, 102] }],
  attributes: {
    has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
      return false;
    },
    get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
      return undefined;
    },
  },
};

export function pointer(
  phase: PointerSample["phase"],
  overrides: Partial<PointerSample> = {},
): PointerSample {
  return {
    pointerId: 7,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: 100,
    y: 120,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    buttons: phase === "up" || phase === "cancel" ? 0 : 1,
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    timestamp: 1,
    coalesced: false,
    ...overrides,
  };
}

export function surfaceHit(position: Vec3): SurfaceHit {
  return {
    surfaceId: "reference",
    triangleId: 0,
    position,
    normal: { x: 0, y: 0, z: 1 },
    barycentric: { x: 1, y: 0, z: 0 },
    distance: 1,
  };
}

export function createToolHarness() {
  let selectionValue: SelectionSnapshot = {
    version: 0,
    vertices: new Set<VertexId>(),
    edges: new Set<EdgeId>(),
    faces: new Set<FaceId>(),
  };
  let mutationVersion = 0;

  const selectionUpdates: Array<readonly [SelectionMode, SelectionChange]> = [];
  const selection = {
    snapshot: () => selectionValue,
    update: vi.fn((mode: SelectionMode, change: SelectionChange) => {
      selectionUpdates.push([mode, change]);
    }),
    clear: vi.fn(),
    prune: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } satisfies SelectionService;

  const mesh = {
    snapshot: () => baseSnapshot,
    vertex: (id: VertexId) => baseSnapshot.vertices.find((vertex) => vertex.id === id) ?? null,
    edge: (id: EdgeId) => baseSnapshot.edges.find((edge) => edge.id === id) ?? null,
    corner: (id: number) => baseSnapshot.corners.find((corner) => corner.id === id) ?? null,
    face: (id: FaceId) => baseSnapshot.faces.find((face) => face.id === id) ?? null,
    incidentEdges: (vertex: VertexId) =>
      baseSnapshot.edges
        .filter((edge) => edge.vertices.includes(vertex))
        .map((edge) => edge.id),
    incidentFaces: (_vertex: VertexId) => [20],
    adjacentFaces: (_edge: EdgeId) => [20],
    findEdge: (a: VertexId, b: VertexId) =>
      baseSnapshot.edges.find(
        (edge) => edge.vertices.includes(a) && edge.vertices.includes(b),
      )?.id ?? null,
  } satisfies MeshQuery;

  const transactions: Array<{
    label: string;
    recorded: ReversibleChange[];
    committed: number;
    rolledBack: number;
  }> = [];
  const history = {
    begin: vi.fn((label: string): HistoryTransaction => {
      const state = { label, recorded: [] as ReversibleChange[], committed: 0, rolledBack: 0 };
      transactions.push(state);
      return {
        label,
        recordApplied(change: ReversibleChange): void {
          state.recorded.push(change);
        },
        commit(): void {
          state.committed += 1;
        },
        rollback(): void {
          state.rolledBack += 1;
          for (const change of [...state.recorded].reverse()) change.revert();
        },
      };
    }),
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    snapshot: (): HistorySnapshot => ({ canUndo: false, canRedo: false }),
    subscribe: vi.fn(() => () => {}),
  } satisfies HistoryService;

  const commands: Array<readonly [string, MeshCommand]> = [];
  const mutations = {
    execute: vi.fn((label: string, command: MeshCommand): MeshMutationResult => {
      commands.push([label, command]);
      const beforeVersion = mutationVersion;
      mutationVersion += 1;
      const patch: MeshPatch = {
        id: `patch-${mutationVersion}`,
        label,
        beforeVersion,
        afterVersion: mutationVersion,
        affected: {} satisfies MeshElementSet,
        apply: vi.fn(),
        revert: vi.fn(),
      };
      return {
        patch,
        snapshot: { ...baseSnapshot, version: mutationVersion },
        created: {},
        updated: {},
        deleted: {},
      };
    }),
    validate: vi.fn(() => [] as ReadonlyArray<string>),
  };

  let pickResult: PickHit | null = null;
  const picking = {
    rayFromScreen: vi.fn((_point: Vec2) => ({
      origin: { x: 0, y: 0, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    })),
    pick: vi.fn(() => pickResult),
  } satisfies PickingService;

  let currentSurfaceHit: SurfaceHit | null = surfaceHit({ x: 0, y: 0, z: 0 });
  const previews: Array<ToolPreview | null> = [];
  let renderRequests = 0;
  const context: ToolContext = {
    mesh,
    mutations,
    selection,
    history,
    surface: {
      raycast: vi.fn(() => currentSurfaceHit),
      nearest: vi.fn(() => currentSurfaceHit),
    },
    getCamera: () => camera,
    getViewport: () => viewport,
    setPreview: (preview) => previews.push(preview),
    requestRender: () => {
      renderRequests += 1;
    },
  };

  return {
    commands,
    context,
    history,
    mutations,
    picking,
    previews,
    selection,
    selectionUpdates,
    transactions,
    get renderRequests() {
      return renderRequests;
    },
    setPick(hit: PickHit | null): void {
      pickResult = hit;
    },
    setSelection(
      vertices: ReadonlyArray<VertexId> = [],
      edges: ReadonlyArray<EdgeId> = [],
      faces: ReadonlyArray<FaceId> = [],
    ): void {
      selectionValue = {
        version: selectionValue.version + 1,
        vertices: new Set(vertices),
        edges: new Set(edges),
        faces: new Set(faces),
      };
    },
    setSurface(hit: SurfaceHit | null): void {
      currentSurfaceHit = hit;
    },
  };
}
