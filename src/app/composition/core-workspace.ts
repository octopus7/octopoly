import type {
  CameraSnapshot,
  Disposable,
  ExtensionRuntime,
  ExtensionStateRegistry,
  HistoryService,
  HistorySnapshot,
  HistoryTransaction,
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  ImageMutationResult,
  ImageTileUpdate,
  Mat4,
  MeshCommand,
  MeshDocument,
  MeshFactory,
  MeshMutationResult,
  MeshMutationService,
  MeshQuery,
  MeshSnapshot,
  MeshTriangulationService,
  ModelingExtensionChange,
  ModelingExtensionServices,
  NormalizedInputSurface,
  NormalizedInputSurfaceFactory,
  PanelRegistry,
  PickingService,
  PointerSample,
  ProjectDocument,
  ReferenceAssetRef,
  ReferenceAssetService,
  ReferenceSurface,
  ReferenceSurfaceFactory,
  RenderExtensionControl,
  RendererInitResult,
  RendererService,
  RenderSceneSnapshot,
  RetopoEngine,
  SelectionService,
  SerializedMesh,
  SurfaceHit,
  SurfaceQuery,
  Tool,
  ToolContext,
  ToolInputResult,
  ToolPreview,
  TriangleMeshSnapshot,
  Unsubscribe,
  Vec3,
  ViewportSnapshot,
} from "@octopoly/contracts";
import { incrementNonNegativeSafeInteger } from "@octopoly/contracts";

import { OrbitCameraController } from "../../camera";
import { createHistoryService } from "../../history";
import { createNormalizedInputSurfaceFactory } from "../../input/surface";
import { exportGlb as serializeGlb, exportObj as serializeObj } from "../../io/export";
import { importObj } from "../../io/import";
import { MeshKernelFactory } from "../../mesh";
import { createExtensionRuntime } from "../../optional-sdk/runtime";
import { createExtensionStateRegistry } from "../../optional-sdk/state";
import { createMeshTriangulationService, createPickingService } from "../../picking";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  IndexedDbImageAssetService,
  IndexedDbProjectStorage,
  IndexedDbReferenceAssetService,
  ProjectRepository,
  type ProjectStorage,
} from "../../project";
import {
  PreviewRenderPass,
  ReferenceRenderPass,
  WebGL2RendererService,
  WebGL2RenderExtensionRegistry,
} from "../../renderer";
import { createRetopoRenderPasses } from "../../renderer/retopo";
import { createRetopoEngine } from "../../retopo";
import { SelectionStore } from "../../selection";
import { createReferenceSurfaceFactory } from "../../surface";
import { DeleteElementsTool, MoveVerticesTool, SelectTool } from "../../tools/basic";
import { SplitEdgeTool } from "../../tools/edge";
import { ExtrudeFacesTool } from "../../tools/face";
import { createToolRuntime, type ToolRuntime } from "../../tools/runtime";
import { CreateVertexTool } from "../../tools/vertex";
import { DefaultPanelRegistry } from "../../ui";
import { CoreExtensionHost } from "./extension-host";
import { RetopoStrokeTool } from "./retopo-tool";
import { WorkspaceInputController } from "./workspace-input";

export interface ProjectDocumentRepository extends Disposable {
  load(id: string, signal?: AbortSignal): Promise<ProjectDocument | null>;
  save(id: string, document: ProjectDocument, signal?: AbortSignal): Promise<void>;
}

export interface CoreRendererBundle {
  readonly renderer: RendererService;
  readonly extensions: WebGL2RenderExtensionRegistry;
}

export interface CoreWorkspaceDependencies {
  readonly referenceAssets: ReferenceAssetService;
  readonly projects: ProjectDocumentRepository;
  readonly createImageAssets: (initialRefs: ReadonlyArray<ImageAssetRef>) => ImageAssetService;
  readonly disposeInfrastructure?: () => void;
  readonly meshFactory?: MeshFactory;
  readonly surfaceFactory?: ReferenceSurfaceFactory;
  readonly triangulation?: MeshTriangulationService;
  readonly picking?: PickingService;
  readonly createRetopo?: () => RetopoEngine;
  readonly rendererBundle?: CoreRendererBundle;
  readonly inputSurfaces?: NormalizedInputSurfaceFactory;
  readonly panels?: PanelRegistry;
  readonly state?: ExtensionStateRegistry;
  readonly initialViewport?: ViewportSnapshot;
}

export interface CoreWorkspaceProductionOptions {
  readonly databaseName?: string;
  readonly indexedDbFactory?: IDBFactory;
}

const DEFAULT_VIEWPORT: ViewportSnapshot = Object.freeze({
  cssWidth: 1,
  cssHeight: 1,
  devicePixelRatio: 1,
});

const EMPTY_REFERENCE: ReadonlyArray<ReferenceSurface> = Object.freeze([]);

function usableViewport(viewport: ViewportSnapshot): ViewportSnapshot {
  return Object.freeze({
    cssWidth: Math.max(1, viewport.cssWidth),
    cssHeight: Math.max(1, viewport.cssHeight),
    devicePixelRatio:
      Number.isFinite(viewport.devicePixelRatio) && viewport.devicePixelRatio > 0
        ? viewport.devicePixelRatio
        : 1,
  });
}

function sameImageRef(first: ImageAssetRef, second: ImageAssetRef): boolean {
  return (
    first.id === second.id &&
    first.revision === second.revision &&
    first.width === second.width &&
    first.height === second.height &&
    first.colorSpace === second.colorSpace
  );
}

function dedupeImageRefs(refs: ReadonlyArray<ImageAssetRef>): ReadonlyArray<ImageAssetRef> {
  const values = new Map<string, ImageAssetRef>();
  for (const ref of refs) {
    const key = `${ref.id}\u0000${ref.revision}`;
    const existing = values.get(key);
    if (existing !== undefined && !sameImageRef(existing, ref)) {
      throw new Error(`Conflicting image metadata for ${ref.id}@${ref.revision}`);
    }
    values.set(key, Object.freeze({ ...ref }));
  }
  return Object.freeze([...values.values()]);
}

function closestHit(current: SurfaceHit | null, candidate: SurfaceHit | null): SurfaceHit | null {
  if (candidate === null) {
    return current;
  }
  return current === null || candidate.distance < current.distance ? candidate : current;
}

class CompositeReferenceQuery implements SurfaceQuery {
  constructor(private readonly surfaces: () => ReadonlyArray<ReferenceSurface>) {}

  raycast(ray: Parameters<SurfaceQuery["raycast"]>[0], maximum?: number): SurfaceHit | null {
    let hit: SurfaceHit | null = null;
    for (const surface of this.surfaces()) {
      hit = closestHit(
        hit,
        maximum === undefined ? surface.query.raycast(ray) : surface.query.raycast(ray, maximum),
      );
    }
    return hit;
  }

  nearest(point: Vec3, maximum?: number): SurfaceHit | null {
    let hit: SurfaceHit | null = null;
    for (const surface of this.surfaces()) {
      hit = closestHit(
        hit,
        maximum === undefined
          ? surface.query.nearest(point)
          : surface.query.nearest(point, maximum),
      );
    }
    return hit;
  }
}

class ImageAssetServiceFacade implements ImageAssetService {
  readonly #listeners = new Set<(event: ImageAssetEvent) => void>();
  #delegateUnsubscribe: Unsubscribe | null = null;
  #disposed = false;

  constructor(private delegate: ImageAssetService) {
    this.#connectDelegate();
  }

  replace(next: ImageAssetService): void {
    this.#assertUsable();
    const previous = this.delegate;
    this.#delegateUnsubscribe?.();
    this.delegate = next;
    this.#connectDelegate();
    previous.dispose();
  }

  import(source: Blob): Promise<ImageAssetRef> {
    this.#assertUsable();
    return this.delegate.import(source);
  }

  current(id: string): ImageAssetRef | null {
    this.#assertUsable();
    return this.delegate.current(id);
  }

  prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    this.#assertUsable();
    return this.delegate.prepareEdit(ref);
  }

  remove(id: string): Promise<void> {
    this.#assertUsable();
    return this.delegate.remove(id);
  }

  flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void> {
    this.#assertUsable();
    return refs === undefined ? this.delegate.flush() : this.delegate.flush(refs);
  }

  resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    this.#assertUsable();
    return this.delegate.resolve(ref);
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#delegateUnsubscribe?.();
    this.#delegateUnsubscribe = null;
    this.#listeners.clear();
    this.delegate.dispose();
  }

  #connectDelegate(): void {
    this.#delegateUnsubscribe = this.delegate.subscribe((event) => {
      for (const listener of [...this.#listeners]) {
        listener(event);
      }
    });
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("image asset facade is disposed");
    }
  }
}

export function createCoreRendererBundle(
  triangulation: MeshTriangulationService,
): CoreRendererBundle {
  const extensions = new WebGL2RenderExtensionRegistry();
  const retopo = createRetopoRenderPasses(triangulation);
  const renderer = new WebGL2RendererService(
    [
      new ReferenceRenderPass(),
      retopo.solid,
      retopo.overlay,
      new PreviewRenderPass(),
    ],
    extensions,
    undefined,
    undefined,
    triangulation,
  );
  return Object.freeze({ renderer, extensions });
}

export class CoreWorkspace implements Disposable {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly triangulation: MeshTriangulationService;
  readonly picking: PickingService;
  readonly renderer: RendererService;
  readonly rendererExtensions: WebGL2RenderExtensionRegistry;
  readonly modeling: ModelingExtensionServices;
  readonly extensionHost: CoreExtensionHost;
  readonly extensions: ExtensionRuntime;
  readonly tools: ReadonlyArray<Tool>;
  readonly toolRuntime: ToolRuntime;
  readonly input: WorkspaceInputController;

  readonly #meshFactory: MeshFactory;
  readonly #surfaceFactory: ReferenceSurfaceFactory;
  readonly #referenceAssets: ReferenceAssetService;
  readonly #projects: ProjectDocumentRepository;
  readonly #createImageAssets: (refs: ReadonlyArray<ImageAssetRef>) => ImageAssetService;
  readonly #disposeInfrastructure: (() => void) | undefined;
  readonly #inputSurfaces: NormalizedInputSurfaceFactory;
  readonly #state: ExtensionStateRegistry;
  readonly #imageAssets: ImageAssetServiceFacade;
  readonly #historyService: HistoryService;
  readonly #camera = new OrbitCameraController(
    { x: 0, y: 0, z: 5 },
    { x: 0, y: 0, z: 0 },
  );
  readonly #surfaceQuery: CompositeReferenceQuery;
  readonly #modelListeners = new Set<(change: ModelingExtensionChange) => void>();
  readonly #retopoTool: RetopoStrokeTool;

  #document: MeshDocument;
  #surfaces: ReadonlyArray<ReferenceSurface> = EMPTY_REFERENCE;
  #referenceRefs: ReadonlyArray<ReferenceAssetRef> = Object.freeze([]);
  #imageRefs: ReadonlyArray<ImageAssetRef> = Object.freeze([]);
  #referenceGeometry: TriangleMeshSnapshot | undefined;
  #referenceRevision = 0;
  #viewport: ViewportSnapshot;
  #preview: ToolPreview | undefined;
  #inputSurface: NormalizedInputSurface | null = null;
  #inputConnection: Disposable | null = null;
  #viewportSubscription: Unsubscribe | null = null;
  #disposed = false;

  constructor(dependencies: CoreWorkspaceDependencies) {
    this.#meshFactory = dependencies.meshFactory ?? new MeshKernelFactory();
    this.#surfaceFactory = dependencies.surfaceFactory ?? createReferenceSurfaceFactory();
    this.#referenceAssets = dependencies.referenceAssets;
    this.#projects = dependencies.projects;
    this.#createImageAssets = dependencies.createImageAssets;
    this.#disposeInfrastructure = dependencies.disposeInfrastructure;
    this.#inputSurfaces = dependencies.inputSurfaces ?? createNormalizedInputSurfaceFactory();
    this.#state = dependencies.state ?? createExtensionStateRegistry();
    this.#document = this.#meshFactory.createEmpty();
    this.#viewport = usableViewport(dependencies.initialViewport ?? DEFAULT_VIEWPORT);
    this.triangulation = dependencies.triangulation ?? createMeshTriangulationService();
    this.picking = dependencies.picking ?? createPickingService(this.triangulation);
    this.selection = new SelectionStore();
    this.#historyService = createHistoryService();
    this.#imageAssets = new ImageAssetServiceFacade(this.#createImageAssets([]));
    this.#surfaceQuery = new CompositeReferenceQuery(() => this.#surfaces);

    this.mesh = Object.freeze({
      snapshot: () => this.#document.snapshot(),
      vertex: (id: number) => this.#document.vertex(id),
      edge: (id: number) => this.#document.edge(id),
      corner: (id: number) => this.#document.corner(id),
      face: (id: number) => this.#document.face(id),
      incidentEdges: (vertex: number) => this.#document.incidentEdges(vertex),
      incidentFaces: (vertex: number) => this.#document.incidentFaces(vertex),
      adjacentFaces: (edge: number) => this.#document.adjacentFaces(edge),
      findEdge: (first: number, second: number) => this.#document.findEdge(first, second),
    });

    this.mutations = Object.freeze({
      execute: (label: string, command: MeshCommand) => this.#executeMutation(label, command),
      validate: (command: MeshCommand) => this.#document.validate(command),
    });

    this.history = Object.freeze({
      begin: (label: string): HistoryTransaction => this.#historyService.begin(label),
      undo: () => this.#historyOperation("undo"),
      redo: () => this.#historyOperation("redo"),
      clear: () => this.#historyService.clear(),
      snapshot: (): HistorySnapshot => this.#historyService.snapshot(),
      subscribe: (listener: (snapshot: HistorySnapshot) => void) =>
        this.#historyService.subscribe(listener),
    });

    const toolContext: ToolContext = Object.freeze({
      mesh: this.mesh,
      mutations: this.mutations,
      selection: this.selection,
      history: this.history,
      surface: this.#surfaceQuery,
      getCamera: () => this.cameraSnapshot(),
      getViewport: () => this.#viewport,
      setPreview: (preview: ToolPreview | null) => {
        this.#preview = preview ?? undefined;
      },
      requestRender: () => this.requestRender(),
    });

    this.toolRuntime = createToolRuntime(toolContext);
    this.#retopoTool = new RetopoStrokeTool(
      dependencies.createRetopo ?? createRetopoEngine,
      this.picking,
    );
    this.tools = Object.freeze([
      this.#retopoTool,
      new SelectTool(this.picking),
      new MoveVerticesTool(this.picking),
      new DeleteElementsTool(this.picking),
      new CreateVertexTool(this.picking),
      new SplitEdgeTool(this.picking),
      new ExtrudeFacesTool(this.picking),
    ]);
    for (const tool of this.tools) {
      this.toolRuntime.tools.register(tool);
    }
    this.toolRuntime.tools.activate(this.#retopoTool.id);

    const rendererBundle =
      dependencies.rendererBundle ?? createCoreRendererBundle(this.triangulation);
    this.renderer = rendererBundle.renderer;
    this.rendererExtensions = rendererBundle.extensions;

    this.modeling = Object.freeze({
      mesh: this.mesh,
      mutations: this.mutations,
      selection: this.selection,
      history: this.history,
      picking: this.picking,
      triangulation: this.triangulation,
      getCamera: () => this.cameraSnapshot(),
      getViewport: () => this.#viewport,
      subscribe: (listener: (change: ModelingExtensionChange) => void): Unsubscribe => {
        this.#modelListeners.add(listener);
        return () => this.#modelListeners.delete(listener);
      },
    });

    const rendererControl: RenderExtensionControl = Object.freeze({
      capabilities: () => this.renderer.capabilities(),
      requestRender: () => this.requestRender(),
    });
    this.extensionHost = new CoreExtensionHost({
      tools: this.toolRuntime.tools,
      shading: this.rendererExtensions,
      images: this.#imageAssets,
      panels: dependencies.panels ?? new DefaultPanelRegistry(),
      renderer: rendererControl,
      modeling: this.modeling,
      state: this.#state,
    });
    this.extensions = createExtensionRuntime(this.extensionHost);
    this.input = new WorkspaceInputController(
      this.toolRuntime,
      this.#camera,
      () => this.#viewport,
      () => {
        this.#publish({ kind: "camera" });
        this.requestRender();
      },
    );

    this.selection.subscribe(() => {
      this.#publish({ kind: "selection" });
      this.requestRender();
    });
  }

  async initialize(canvas: HTMLCanvasElement): Promise<RendererInitResult> {
    this.#assertUsable();
    if (this.#inputSurface !== null) {
      throw new Error("Core workspace is already initialized");
    }
    const surface = this.#inputSurfaces.create(canvas, { touchAction: "none" });
    this.#inputSurface = surface;
    this.#viewport = usableViewport(surface.viewport());
    this.#viewportSubscription = surface.subscribeViewport((viewport) => {
      this.#viewport = usableViewport(viewport);
      if (this.renderer.state() === "ready") {
        this.renderer.resize(this.#viewport);
      }
      this.#publish({ kind: "viewport" });
      this.requestRender();
    });
    this.#inputConnection = surface.connect(this.input);

    const result = await this.renderer.initialize(canvas, this.#imageAssets);
    if (result.status === "ready") {
      this.renderer.resize(this.#viewport);
      this.requestRender();
    }
    return result;
  }

  dispatch(sample: PointerSample): ToolInputResult {
    this.#assertUsable();
    return this.input.dispatch(sample);
  }

  cameraSnapshot(): CameraSnapshot {
    this.#assertUsable();
    return this.#camera.snapshot(this.#viewport);
  }

  viewportSnapshot(): ViewportSnapshot {
    this.#assertUsable();
    return this.#viewport;
  }

  sceneSnapshot(): RenderSceneSnapshot {
    this.#assertUsable();
    return Object.freeze({
      camera: this.cameraSnapshot(),
      viewport: this.#viewport,
      ...(this.#referenceGeometry === undefined
        ? {}
        : { reference: this.#referenceGeometry }),
      retopo: this.mesh.snapshot(),
      selection: this.selection.snapshot(),
      ...(this.#preview === undefined ? {} : { preview: this.#preview }),
    });
  }

  requestRender(): void {
    if (!this.#disposed && this.renderer.state() === "ready") {
      this.renderer.render(this.sceneSnapshot());
    }
  }

  activateTool(id: string): void {
    this.#assertUsable();
    this.toolRuntime.tools.activate(id);
  }

  orbit(yawRadians: number, pitchRadians: number): void {
    this.#assertUsable();
    this.#camera.orbit(yawRadians, pitchRadians);
    this.#publish({ kind: "camera" });
    this.requestRender();
  }

  async importReference(
    geometry: TriangleMeshSnapshot,
    worldTransform: Mat4,
  ): Promise<ReferenceAssetRef> {
    this.#assertUsable();
    const ref = await this.#referenceAssets.create(geometry, worldTransform);
    let surface: ReferenceSurface;
    try {
      const persisted = await this.#referenceAssets.resolve(ref);
      surface = this.#surfaceFactory.create(ref.id, persisted, ref.worldTransform);
    } catch (error) {
      try {
        await this.#referenceAssets.remove(ref.id);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Reference import failed and its durable asset could not be removed",
        );
      }
      throw error;
    }
    this.#surfaces = Object.freeze([...this.#surfaces, surface]);
    this.#referenceRefs = Object.freeze([...this.#referenceRefs, ref]);
    this.#rebuildReferenceGeometry();
    this.requestRender();
    return ref;
  }

  importReferenceObj(
    source: string,
    worldTransform: Mat4,
    projectUnitsPerSourceUnit = 1,
  ): Promise<ReferenceAssetRef> {
    return this.importReference(
      importObj(source, projectUnitsPerSourceUnit),
      worldTransform,
    );
  }

  referenceAssetRefs(): ReadonlyArray<ReferenceAssetRef> {
    return this.#referenceRefs;
  }

  renderedReferenceGeometry(): TriangleMeshSnapshot | undefined {
    return this.#referenceGeometry;
  }

  async importImage(source: Blob): Promise<ImageAssetRef> {
    this.#assertUsable();
    const ref = await this.#imageAssets.import(source);
    this.#imageRefs = dedupeImageRefs([...this.#imageRefs, ref]);
    return ref;
  }

  async saveProject(id: string, signal?: AbortSignal): Promise<ProjectDocument> {
    this.#assertUsable();
    const state = this.#state.save();
    const currentCoreImages = this.#imageRefs.map(
      (ref) => this.#imageAssets.current(ref.id) ?? ref,
    );
    const images = dedupeImageRefs([...currentCoreImages, ...state.imageAssets]);
    await this.#imageAssets.flush(images);
    const extensionData = state.values;
    const document: ProjectDocument = Object.freeze({
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      mesh: this.#document.serialize(),
      referenceAssets: this.#referenceRefs,
      imageAssets: images,
      ...(Object.keys(extensionData).length === 0 ? {} : { extensionData }),
    });
    await this.#projects.save(id, document, signal);
    return document;
  }

  async loadProject(id: string, signal?: AbortSignal): Promise<boolean> {
    this.#assertUsable();
    const source = await this.#projects.load(id, signal);
    if (source === null) {
      return false;
    }

    const nextDocument = this.#meshFactory.restore(source.mesh);
    const nextSurfaces: ReferenceSurface[] = [];
    let nextImages: ImageAssetService | null = null;
    try {
      for (const ref of source.referenceAssets) {
        const local = await this.#referenceAssets.resolve(ref);
        nextSurfaces.push(this.#surfaceFactory.create(ref.id, local, ref.worldTransform));
      }
      nextImages = this.#createImageAssets(source.imageAssets);
      await this.#state.load(source.extensionData ?? {});
    } catch (error) {
      for (const surface of nextSurfaces) {
        surface.dispose();
      }
      nextImages?.dispose();
      nextDocument.dispose();
      throw error;
    }

    this.#cancelForDocumentReplacement();
    this.#historyService.clear();
    this.selection.clear();

    const previousDocument = this.#document;
    const previousSurfaces = this.#surfaces;
    this.#document = nextDocument;
    this.#surfaces = Object.freeze(nextSurfaces);
    this.#referenceRefs = Object.freeze([...source.referenceAssets]);
    this.#imageRefs = Object.freeze([...source.imageAssets]);
    this.#imageAssets.replace(nextImages);
    this.#rebuildReferenceGeometry();

    previousDocument.dispose();
    for (const surface of previousSurfaces) {
      surface.dispose();
    }
    this.#publish({ kind: "document", meshVersion: this.#document.snapshot().version });
    this.requestRender();
    return true;
  }

  serializedMesh(): SerializedMesh {
    this.#assertUsable();
    return this.#document.serialize();
  }

  exportObj(sourceUnitsPerProjectUnit = 1): string {
    this.#assertUsable();
    return serializeObj(this.#document.serialize(), sourceUnitsPerProjectUnit);
  }

  exportGlb(metersPerProjectUnit = 1): ArrayBuffer {
    this.#assertUsable();
    return serializeGlb(this.#document.serialize(), metersPerProjectUnit);
  }

  handleContextLoss(): void {
    this.#assertUsable();
    this.renderer.handleContextLoss();
  }

  async restoreRenderer(): Promise<RendererInitResult> {
    this.#assertUsable();
    const result = await this.renderer.restore();
    if (result.status === "ready") {
      this.requestRender();
    }
    return result;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const errors: unknown[] = [];
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        errors.push(error);
      }
    };

    attempt(() => this.#inputConnection?.dispose());
    this.#inputConnection = null;
    attempt(() => this.#viewportSubscription?.());
    this.#viewportSubscription = null;
    attempt(() => this.#inputSurface?.dispose());
    this.#inputSurface = null;
    this.input.cancelNavigation();
    attempt(() => this.toolRuntime.cancel());
    attempt(() => this.#retopoTool.resetDocumentState());
    attempt(() => this.extensions.dispose());
    attempt(() => this.toolRuntime.dispose());
    attempt(() => this.renderer.dispose());
    for (const surface of this.#surfaces) {
      attempt(() => surface.dispose());
    }
    this.#surfaces = EMPTY_REFERENCE;
    attempt(() => this.#document.dispose());
    attempt(() => this.#referenceAssets.dispose());
    attempt(() => this.#projects.dispose());
    if (this.#disposeInfrastructure !== undefined) {
      attempt(this.#disposeInfrastructure);
    }
    this.#modelListeners.clear();

    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Core workspace disposal failed");
    }
  }

  #executeMutation(label: string, command: MeshCommand): MeshMutationResult {
    const result = this.#document.execute(label, command);
    this.selection.prune(this.mesh);
    this.#publish({ kind: "mesh", meshVersion: result.snapshot.version });
    this.requestRender();
    return result;
  }

  #historyOperation(operation: "undo" | "redo"): void {
    this.#historyService[operation]();
    this.selection.prune(this.mesh);
    this.#publish({ kind: "mesh", meshVersion: this.mesh.snapshot().version });
    this.requestRender();
  }

  #cancelForDocumentReplacement(): void {
    if (this.#inputConnection !== null && this.#inputSurface !== null) {
      this.#inputConnection.dispose();
      this.#inputConnection = this.#inputSurface.connect(this.input);
    }
    this.toolRuntime.cancel();
    this.#retopoTool.resetDocumentState();
    this.input.cancelNavigation();
    this.#preview = undefined;
  }

  #rebuildReferenceGeometry(): void {
    if (this.#surfaces.length === 0) {
      this.#referenceGeometry = undefined;
      return;
    }
    this.#referenceRevision = incrementNonNegativeSafeInteger(
      this.#referenceRevision,
      "reference composition revision",
    );
    const positions: Vec3[] = [];
    const normals: Vec3[] = [];
    const indices: number[] = [];
    const hasNormals = this.#surfaces.every(
      (surface) => surface.geometry.normals !== undefined,
    );
    for (const surface of this.#surfaces) {
      const offset = positions.length;
      positions.push(...surface.geometry.positions);
      if (hasNormals) {
        normals.push(...(surface.geometry.normals ?? []));
      }
      indices.push(...surface.geometry.indices.map((index) => index + offset));
    }
    this.#referenceGeometry = Object.freeze({
      version: this.#referenceRevision,
      positions: Object.freeze(positions),
      ...(hasNormals ? { normals: Object.freeze(normals) } : {}),
      indices: Object.freeze(indices),
    });
  }

  #publish(change: ModelingExtensionChange): void {
    for (const listener of [...this.#modelListeners]) {
      listener(Object.freeze({ ...change }));
    }
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Core workspace is disposed");
    }
  }
}

export function createProductionCoreWorkspace(
  options: CoreWorkspaceProductionOptions = {},
): CoreWorkspace {
  const storage: ProjectStorage = new IndexedDbProjectStorage(
    options.databaseName,
    options.indexedDbFactory,
  );
  return new CoreWorkspace({
    referenceAssets: new IndexedDbReferenceAssetService(storage),
    projects: new ProjectRepository(storage),
    createImageAssets: (initialRefs) =>
      new IndexedDbImageAssetService(storage, { initialRefs }),
    disposeInfrastructure: () => storage.dispose(),
  });
}
