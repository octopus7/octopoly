import type {
  Disposable,
  ExtensionHost,
  ExtensionPanel,
  ExtensionStateBundle,
  ExtensionStateContribution,
  ExtensionStateProvider,
  ExtensionStateRegistry,
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  ImageMutationResult,
  ImageTileUpdate,
  ModelingExtensionChange,
  ModelingExtensionServices,
  PanelRegistry,
  RenderExtensionRegistry,
  ShadingProvider,
  ShadingSelectionLease,
  ShadingSelectionSnapshot,
  Tool,
  ToolRegistry,
  Unsubscribe,
} from "@octopoly/contracts";

export interface OwnerResourceSnapshot {
  readonly ownerId: string;
  readonly tools: number;
  readonly panels: number;
  readonly providers: number;
  readonly stateProviders: number;
  readonly toolLeases: number;
  readonly shadingLeases: number;
  readonly imageEdits: number;
  readonly subscriptions: number;
  readonly total: number;
  readonly cleanupErrors: ReadonlyArray<string>;
}

type ResourceKind =
  | "tools"
  | "panels"
  | "providers"
  | "stateProviders"
  | "toolLeases"
  | "shadingLeases"
  | "imageEdits"
  | "subscriptions";

const RESOURCE_KINDS: ReadonlyArray<ResourceKind> = Object.freeze([
  "tools",
  "panels",
  "providers",
  "stateProviders",
  "toolLeases",
  "shadingLeases",
  "imageEdits",
  "subscriptions",
]);

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class ResourceRecord {
  readonly kind: ResourceKind;
  readonly id: string;
  readonly #cleanup: () => void;
  active = true;

  constructor(kind: ResourceKind, id: string, cleanup: () => void) {
    this.kind = kind;
    this.id = id;
    this.#cleanup = cleanup;
  }

  release(): void {
    if (!this.active) return;
    this.#cleanup();
    this.active = false;
  }

  dismiss(): void {
    this.active = false;
  }
}

function emptyShadingSnapshot(candidates: ReadonlyArray<string>): ShadingSelectionSnapshot {
  return Object.freeze({
    candidates: Object.freeze([...candidates]),
    effectiveProviderId: null,
    failures: Object.freeze([]),
  });
}

class OwnerShadingLease implements ShadingSelectionLease {
  readonly #registry: RenderExtensionRegistry;
  readonly #canPromote: () => boolean;
  readonly #listeners = new Set<(snapshot: ShadingSelectionSnapshot) => void>();
  #record: ResourceRecord | null = null;
  #candidates: ReadonlyArray<string>;
  #snapshot: ShadingSelectionSnapshot;
  #delegate: ShadingSelectionLease | null = null;
  #unsubscribe: Unsubscribe | null = null;
  #disposed = false;

  constructor(
    registry: RenderExtensionRegistry,
    candidates: ReadonlyArray<string>,
    canPromote: () => boolean,
  ) {
    this.#registry = registry;
    this.#canPromote = canPromote;
    this.#candidates = Object.freeze([...candidates]);
    this.#snapshot = emptyShadingSnapshot(this.#candidates);
  }

  bind(record: ResourceRecord): void {
    this.#record = record;
  }

  setCandidates(providerIds: ReadonlyArray<string>): void {
    this.#assertUsable();
    this.#candidates = Object.freeze([...providerIds]);
    if (this.#canPromote()) {
      this.promote();
      return;
    }
    this.#publish(emptyShadingSnapshot(this.#candidates));
  }

  snapshot(): ShadingSelectionSnapshot {
    this.#assertUsable();
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: ShadingSelectionSnapshot) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
    };
  }

  promote(providerIds?: ReadonlyArray<string>): ShadingSelectionSnapshot {
    this.#assertUsable();
    if (providerIds !== undefined) {
      this.#candidates = Object.freeze([...providerIds]);
    }
    if (!this.#canPromote()) {
      this.#publish(emptyShadingSnapshot(this.#candidates));
      return this.#snapshot;
    }

    this.#releaseDelegate();
    const delegate = this.#registry.activateScoped(this.#candidates);
    this.#delegate = delegate;
    this.#unsubscribe = delegate.subscribe((snapshot) => this.#publish(snapshot));
    this.#publish(delegate.snapshot());
    return this.#snapshot;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#record?.release();
  }

  disposeOwned(): void {
    if (this.#disposed) return;
    this.#releaseDelegate();
    this.#listeners.clear();
    this.#disposed = true;
  }

  disposed(): boolean {
    return this.#disposed;
  }

  #releaseDelegate(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    const delegate = this.#delegate;
    if (delegate === null) return;
    delegate.dispose();
    this.#delegate = null;
  }

  #publish(snapshot: ShadingSelectionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch {
        // One owner-local observer cannot prevent the remaining observers from updating.
      }
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Owner shading lease is disposed");
  }
}

class OwnerToolRegistry implements ToolRegistry {
  readonly #scope: OwnerExtensionScope;
  readonly #delegate: ToolRegistry;
  readonly #registrations = new Map<string, ResourceRecord>();

  constructor(scope: OwnerExtensionScope, delegate: ToolRegistry) {
    this.#scope = scope;
    this.#delegate = delegate;
  }

  register(tool: Tool): void {
    this.#scope.assertUsable();
    this.#delegate.register(tool);
    const record = this.#scope.track("tools", tool.id, () => this.#delegate.unregister(tool.id));
    this.#registrations.set(tool.id, record);
  }

  unregister(id: string): void {
    this.#scope.assertUsable();
    const record = this.#registrations.get(id);
    if (record === undefined) return;
    record.release();
    this.#registrations.delete(id);
  }

  activate(id: string): void {
    this.#scope.assertUsable();
    this.#requireOwned(id);
    this.#delegate.activate(id);
  }

  activateScoped(id: string): Disposable {
    this.#scope.assertUsable();
    this.#requireOwned(id);
    const lease = this.#delegate.activateScoped(id);
    const record = this.#scope.track("toolLeases", id, () => lease.dispose());
    return Object.freeze({ dispose: () => record.release() });
  }

  active(): Tool | null {
    this.#scope.assertUsable();
    return this.#delegate.active();
  }

  dispose(): void {
    this.#scope.dispose();
  }

  #requireOwned(id: string): void {
    if (!this.#registrations.get(id)?.active) {
      throw new Error(`Tool "${id}" is not registered by owner "${this.#scope.ownerId}"`);
    }
  }
}

class OwnerPanelRegistry implements PanelRegistry {
  readonly #scope: OwnerExtensionScope;
  readonly #delegate: PanelRegistry;
  readonly #registrations = new Map<string, ResourceRecord>();

  constructor(scope: OwnerExtensionScope, delegate: PanelRegistry) {
    this.#scope = scope;
    this.#delegate = delegate;
  }

  register(panel: ExtensionPanel): void {
    this.#scope.assertUsable();
    this.#delegate.register(panel);
    const record = this.#scope.track("panels", panel.id, () => this.#delegate.unregister(panel.id));
    this.#registrations.set(panel.id, record);
  }

  unregister(id: string): void {
    this.#scope.assertUsable();
    const record = this.#registrations.get(id);
    if (record === undefined) return;
    record.release();
    this.#registrations.delete(id);
  }

  get(id: string): ExtensionPanel | null {
    this.#scope.assertUsable();
    if (!this.#registrations.get(id)?.active) return null;
    return this.#delegate.get(id);
  }

  dispose(): void {
    this.#scope.dispose();
  }
}

class OwnerRenderExtensionRegistry implements RenderExtensionRegistry {
  readonly #scope: OwnerExtensionScope;
  readonly #delegate: RenderExtensionRegistry;
  readonly #registrations = new Map<string, ResourceRecord>();
  readonly #leases: OwnerShadingLease[] = [];

  constructor(scope: OwnerExtensionScope, delegate: RenderExtensionRegistry) {
    this.#scope = scope;
    this.#delegate = delegate;
  }

  register(provider: ShadingProvider): void {
    this.#scope.assertUsable();
    this.#delegate.register(provider);
    const record = this.#scope.track(
      "providers",
      provider.id,
      () => this.#delegate.unregister(provider.id),
    );
    this.#registrations.set(provider.id, record);
  }

  unregister(id: string): void {
    this.#scope.assertUsable();
    const record = this.#registrations.get(id);
    if (record === undefined) return;
    record.release();
    this.#registrations.delete(id);
  }

  get(id: string): ShadingProvider | null {
    this.#scope.assertUsable();
    if (!this.#registrations.get(id)?.active) return null;
    return this.#delegate.get(id);
  }

  list(): ReadonlyArray<ShadingProvider> {
    this.#scope.assertUsable();
    return Object.freeze(this.#delegate.list().filter((provider) => (
      this.#registrations.get(provider.id)?.active === true
    )));
  }

  activateScoped(providerIds: ReadonlyArray<string>): ShadingSelectionLease {
    this.#scope.assertUsable();
    const lease = new OwnerShadingLease(
      this.#delegate,
      providerIds,
      () => this.#scope.activationFinished,
    );
    const record = this.#scope.track("shadingLeases", providerIds.join(","), () => lease.disposeOwned());
    lease.bind(record);
    this.#leases.push(lease);
    if (this.#scope.activationFinished) lease.promote();
    return lease;
  }

  active(): string | null {
    this.#scope.assertUsable();
    return this.#delegate.active();
  }

  select(providerIds?: ReadonlyArray<string>): ShadingSelectionSnapshot {
    this.#scope.assertUsable();
    const latest = [...this.#leases].reverse().find((lease) => !lease.disposed());
    if (latest !== undefined) return latest.promote(providerIds);
    if (providerIds === undefined) {
      throw new Error(`Owner "${this.#scope.ownerId}" has no shading selection`);
    }
    return this.activateScoped(providerIds).snapshot();
  }

  dispose(): void {
    this.#scope.dispose();
  }
}

class OwnerStateRegistry implements ExtensionStateRegistry {
  readonly #scope: OwnerExtensionScope;
  readonly #delegate: ExtensionStateRegistry;
  readonly #registrations = new Map<string, ResourceRecord>();

  constructor(scope: OwnerExtensionScope, delegate: ExtensionStateRegistry) {
    this.#scope = scope;
    this.#delegate = delegate;
  }

  register(provider: ExtensionStateProvider): void {
    this.#scope.assertUsable();
    const ownedProvider: ExtensionStateProvider = {
      id: provider.id,
      load: (value) => provider.load(value),
      save: () => this.#scope.activationSucceeded ? provider.save() : undefined,
      dispose: () => provider.dispose(),
    };
    this.#delegate.register(ownedProvider);
    const record = this.#scope.track(
      "stateProviders",
      provider.id,
      () => this.#delegate.unregister(provider.id),
    );
    this.#registrations.set(provider.id, record);
  }

  unregister(id: string): void {
    this.#scope.assertUsable();
    const record = this.#registrations.get(id);
    if (record === undefined) return;
    record.release();
    this.#registrations.delete(id);
  }

  async load(values: Readonly<Record<string, ExtensionStateContribution>>): Promise<void> {
    this.#scope.assertUsable();
    await this.#delegate.load(values);
    this.#scope.assertUsable();
  }

  save(): ExtensionStateBundle {
    this.#scope.assertUsable();
    return this.#delegate.save();
  }

  dispose(): void {
    this.#scope.dispose();
  }
}

class OwnerImageEditSession implements ImageEditSession {
  readonly base: ImageAssetRef;
  readonly #delegate: ImageEditSession;
  #record: ResourceRecord | null = null;

  constructor(delegate: ImageEditSession) {
    this.#delegate = delegate;
    this.base = delegate.base;
  }

  bind(record: ResourceRecord): void {
    this.#record = record;
  }

  current(): ImageAssetRef {
    return this.#delegate.current();
  }

  write(update: ImageTileUpdate): ImageAssetRef {
    return this.#delegate.write(update);
  }

  commit(label: string): ImageMutationResult {
    const result = this.#delegate.commit(label);
    this.#record?.dismiss();
    return result;
  }

  cancel(): void {
    this.#delegate.cancel();
    this.#record?.dismiss();
  }

  dispose(): void {
    if (this.#record?.active === false) return;
    this.#delegate.dispose();
    this.#record?.dismiss();
  }
}

class OwnerImageAssetService implements ImageAssetService {
  readonly #scope: OwnerExtensionScope;
  readonly #delegate: ImageAssetService;

  constructor(scope: OwnerExtensionScope, delegate: ImageAssetService) {
    this.#scope = scope;
    this.#delegate = delegate;
  }

  async import(source: Blob): Promise<ImageAssetRef> {
    this.#scope.assertUsable();
    const ref = await this.#delegate.import(source);
    if (!this.#scope.disposed) return ref;
    try {
      await this.#delegate.remove(ref.id);
    } catch (error) {
      this.#scope.addCleanupError(`image import ${ref.id}: ${reasonFrom(error)}`);
    }
    throw new Error(`Owner "${this.#scope.ownerId}" was disposed during image import`);
  }

  current(id: string): ImageAssetRef | null {
    this.#scope.assertUsable();
    return this.#delegate.current(id);
  }

  async prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    this.#scope.assertUsable();
    const delegate = await this.#delegate.prepareEdit(ref);
    if (this.#scope.disposed) {
      delegate.dispose();
      throw new Error(`Owner "${this.#scope.ownerId}" was disposed during image edit preparation`);
    }
    const session = new OwnerImageEditSession(delegate);
    const record = this.#scope.track("imageEdits", `${ref.id}@${ref.revision}`, () => session.dispose());
    session.bind(record);
    return session;
  }

  remove(id: string): Promise<void> {
    this.#scope.assertUsable();
    return this.#delegate.remove(id);
  }

  flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void> {
    this.#scope.assertUsable();
    return refs === undefined ? this.#delegate.flush() : this.#delegate.flush(refs);
  }

  async resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    this.#scope.assertUsable();
    const bitmap = await this.#delegate.resolve(ref);
    this.#scope.assertUsable();
    return bitmap;
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    this.#scope.assertUsable();
    const unsubscribe = this.#delegate.subscribe((event) => {
      if (!this.#scope.disposed) listener(event);
    });
    const record = this.#scope.track("subscriptions", "images", unsubscribe);
    return () => record.release();
  }

  dispose(): void {
    this.#scope.dispose();
  }
}

class OwnerModelingServices implements ModelingExtensionServices {
  readonly mesh: ModelingExtensionServices["mesh"];
  readonly mutations: ModelingExtensionServices["mutations"];
  readonly selection: ModelingExtensionServices["selection"];
  readonly history: ModelingExtensionServices["history"];
  readonly picking: ModelingExtensionServices["picking"];
  readonly triangulation: ModelingExtensionServices["triangulation"];
  readonly #scope: OwnerExtensionScope;
  readonly #delegate: ModelingExtensionServices;

  constructor(scope: OwnerExtensionScope, delegate: ModelingExtensionServices) {
    this.#scope = scope;
    this.#delegate = delegate;
    this.mesh = delegate.mesh;
    this.mutations = delegate.mutations;
    this.selection = delegate.selection;
    this.history = delegate.history;
    this.picking = delegate.picking;
    this.triangulation = delegate.triangulation;
  }

  getCamera(): ReturnType<ModelingExtensionServices["getCamera"]> {
    this.#scope.assertUsable();
    return this.#delegate.getCamera();
  }

  getViewport(): ReturnType<ModelingExtensionServices["getViewport"]> {
    this.#scope.assertUsable();
    return this.#delegate.getViewport();
  }

  subscribe(listener: (change: ModelingExtensionChange) => void): Unsubscribe {
    this.#scope.assertUsable();
    const unsubscribe = this.#delegate.subscribe((change) => {
      if (!this.#scope.disposed) listener(change);
    });
    const record = this.#scope.track("subscriptions", "modeling", unsubscribe);
    return () => record.release();
  }
}

export class OwnerExtensionScope {
  readonly ownerId: string;
  readonly host: ExtensionHost;
  readonly shading: OwnerRenderExtensionRegistry;
  readonly #records: ResourceRecord[] = [];
  readonly #cleanupErrors: string[] = [];
  activationFinished = false;
  activationSucceeded = false;
  disposed = false;

  constructor(ownerId: string, shared: ExtensionHost) {
    this.ownerId = ownerId;
    const tools = new OwnerToolRegistry(this, shared.tools);
    const shading = new OwnerRenderExtensionRegistry(this, shared.shading);
    const panels = new OwnerPanelRegistry(this, shared.panels);
    const state = new OwnerStateRegistry(this, shared.state);
    const images = new OwnerImageAssetService(this, shared.images);
    const modeling = new OwnerModelingServices(this, shared.modeling);
    this.shading = shading;
    this.host = Object.freeze({
      tools,
      shading,
      images,
      panels,
      renderer: shared.renderer,
      modeling,
      state,
      dispose: () => this.dispose(),
    });
  }

  finishActivation(succeeded: boolean): void {
    this.activationSucceeded = succeeded;
    this.activationFinished = true;
  }

  track(kind: ResourceKind, id: string, cleanup: () => void): ResourceRecord {
    this.assertUsable();
    const record = new ResourceRecord(kind, id, cleanup);
    this.#records.push(record);
    return record;
  }

  assertUsable(): void {
    if (this.disposed) {
      throw new Error(`Extension owner "${this.ownerId}" is disposed`);
    }
  }

  addCleanupError(message: string): void {
    this.#cleanupErrors.push(message);
  }

  snapshot(): OwnerResourceSnapshot {
    const counts: Record<ResourceKind, number> = {
      tools: 0,
      panels: 0,
      providers: 0,
      stateProviders: 0,
      toolLeases: 0,
      shadingLeases: 0,
      imageEdits: 0,
      subscriptions: 0,
    };
    for (const record of this.#records) {
      if (record.active) counts[record.kind] += 1;
    }
    const total = RESOURCE_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
    return Object.freeze({
      ownerId: this.ownerId,
      ...counts,
      total,
      cleanupErrors: Object.freeze([...this.#cleanupErrors]),
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const record of [...this.#records].reverse()) {
      if (!record.active) continue;
      try {
        record.release();
      } catch (error) {
        this.#cleanupErrors.push(`${record.kind} ${record.id}: ${reasonFrom(error)}`);
      }
    }
  }
}
