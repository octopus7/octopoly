import type {
  CameraSnapshot,
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  MeshCommand,
  MeshMutationResult,
  MeshMutationService,
  MeshQuery,
  MeshSnapshot,
  MeshTriangulationService,
  ModelingExtensionChange,
  ModelingExtensionServices,
  PickHit,
  PickingService,
  Ray,
  ReversibleChange,
  SelectionChange,
  SelectionMode,
  SelectionService,
  SelectionSnapshot,
  Unsubscribe,
  Vec2,
  ViewportSnapshot,
} from "@octopoly/contracts";

const IDENTITY_MATRIX = Object.freeze({
  elements: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
});

export const CONTRACT_TEST_CAMERA: CameraSnapshot = Object.freeze({
  view: IDENTITY_MATRIX,
  projection: IDENTITY_MATRIX,
  viewProjection: IDENTITY_MATRIX,
  position: Object.freeze({ x: 0, y: 0, z: 1 }),
});

export const CONTRACT_TEST_VIEWPORT: ViewportSnapshot = Object.freeze({
  cssWidth: 1024,
  cssHeight: 768,
  devicePixelRatio: 1,
});

const EMPTY_ATTRIBUTES = Object.freeze({
  has: () => false,
  get: () => undefined,
});

const EMPTY_MESH_SNAPSHOT: MeshSnapshot = Object.freeze({
  version: 0,
  vertices: Object.freeze([]),
  edges: Object.freeze([]),
  corners: Object.freeze([]),
  faces: Object.freeze([]),
  attributes: EMPTY_ATTRIBUTES,
});

class EmptyMeshQuery implements MeshQuery {
  snapshot(): MeshSnapshot { return EMPTY_MESH_SNAPSHOT; }
  vertex(): null { return null; }
  edge(): null { return null; }
  corner(): null { return null; }
  face(): null { return null; }
  incidentEdges(): ReadonlyArray<number> { return Object.freeze([]); }
  incidentFaces(): ReadonlyArray<number> { return Object.freeze([]); }
  adjacentFaces(): ReadonlyArray<number> { return Object.freeze([]); }
  findEdge(): null { return null; }
}

class RejectingMutationService implements MeshMutationService {
  execute(_label: string, _command: MeshCommand): MeshMutationResult {
    throw new Error("Contract test modeling mutations are not configured");
  }

  validate(): ReadonlyArray<string> {
    return Object.freeze(["Contract test modeling mutations are not configured"]);
  }
}

class EmptySelectionService implements SelectionService {
  readonly #listeners = new Set<(snapshot: SelectionSnapshot) => void>();
  readonly #snapshot: SelectionSnapshot = Object.freeze({
    version: 0,
    vertices: new Set<number>(),
    edges: new Set<number>(),
    faces: new Set<number>(),
  });

  snapshot(): SelectionSnapshot { return this.#snapshot; }
  update(_mode: SelectionMode, _change: SelectionChange): void {}
  clear(): void {}
  prune(_mesh: MeshQuery): void {}
  subscribe(listener: (snapshot: SelectionSnapshot) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
}

class EmptyHistoryService implements HistoryService {
  readonly #snapshot: HistorySnapshot = Object.freeze({ canUndo: false, canRedo: false });
  begin(label: string): HistoryTransaction {
    let closed = false;
    const assertOpen = (): void => {
      if (closed) throw new Error("Contract test history transaction is closed");
    };
    return {
      label,
      recordApplied: (_change: ReversibleChange) => { assertOpen(); },
      commit: () => { assertOpen(); closed = true; },
      rollback: () => { assertOpen(); closed = true; },
    };
  }
  undo(): void {}
  redo(): void {}
  clear(): void {}
  snapshot(): HistorySnapshot { return this.#snapshot; }
  subscribe(): Unsubscribe { return () => {}; }
}

class EmptyPickingService implements PickingService {
  rayFromScreen(_point: Vec2): Ray {
    return Object.freeze({
      origin: Object.freeze({ x: 0, y: 0, z: 0 }),
      direction: Object.freeze({ x: 0, y: 0, z: -1 }),
    });
  }
  pick(): PickHit | null { return null; }
}

class EmptyTriangulationService implements MeshTriangulationService {
  triangles(): ReadonlyArray<never> { return Object.freeze([]); }
  raycast(): null { return null; }
}

export interface ContractTestModelingOptions {
  readonly mesh?: MeshQuery;
  readonly mutations?: MeshMutationService;
  readonly selection?: SelectionService;
  readonly history?: HistoryService;
  readonly picking?: PickingService;
  readonly triangulation?: MeshTriangulationService;
  readonly camera?: CameraSnapshot;
  readonly viewport?: ViewportSnapshot;
}

export interface ContractTestModelingDocument {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
}

export class ContractTestModelingExtensionServices implements ModelingExtensionServices {
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly picking: PickingService;
  readonly triangulation: MeshTriangulationService;
  readonly #listeners = new Set<(change: ModelingExtensionChange) => void>();
  #document: ContractTestModelingDocument;
  #camera: CameraSnapshot;
  #viewport: ViewportSnapshot;

  constructor(options: ContractTestModelingOptions = {}) {
    const mesh = options.mesh ?? new EmptyMeshQuery();
    this.#document = {
      mesh,
      mutations: options.mutations ?? new RejectingMutationService(),
    };
    this.selection = options.selection ?? new EmptySelectionService();
    this.history = options.history ?? new EmptyHistoryService();
    this.picking = options.picking ?? new EmptyPickingService();
    this.triangulation = options.triangulation ?? new EmptyTriangulationService();
    this.#camera = options.camera ?? CONTRACT_TEST_CAMERA;
    this.#viewport = options.viewport ?? CONTRACT_TEST_VIEWPORT;
  }

  get mesh(): MeshQuery { return this.#document.mesh; }
  get mutations(): MeshMutationService { return this.#document.mutations; }

  getCamera(): CameraSnapshot { return this.#camera; }
  getViewport(): ViewportSnapshot { return this.#viewport; }

  subscribe(listener: (change: ModelingExtensionChange) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  replaceDocument(document: ContractTestModelingDocument): void {
    this.#document = document;
    this.emit({ kind: "document", meshVersion: document.mesh.snapshot().version });
  }

  setCamera(camera: CameraSnapshot): void {
    this.#camera = camera;
    this.emit({ kind: "camera" });
  }

  setViewport(viewport: ViewportSnapshot): void {
    this.#viewport = viewport;
    this.emit({ kind: "viewport" });
  }

  emit(change: ModelingExtensionChange): void {
    const immutable = Object.freeze({ ...change });
    for (const listener of [...this.#listeners]) {
      listener(immutable);
    }
  }
}
