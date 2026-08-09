import type {
  Disposable,
  ExtensionPanel,
  PanelRegistry,
  RenderExtensionControl,
  RenderExtensionRegistry,
  RendererCapabilities,
  ShadingCandidateFailure,
  ShadingFailureCode,
  ShadingProvider,
  ShadingSelectionLease,
  ShadingSelectionSnapshot,
  Tool,
  ToolRegistry,
  Unsubscribe,
} from "@octopoly/contracts";

function assertIdentifier(id: string, label: string): void {
  if (id.trim().length === 0) {
    throw new Error(`${label} id must not be empty`);
  }
}

export class ContractTestPanelRegistry implements PanelRegistry {
  readonly #panels = new Map<string, ExtensionPanel>();
  readonly #disposedPanels = new Set<ExtensionPanel>();
  #disposed = false;

  register(panel: ExtensionPanel): void {
    this.#assertUsable();
    assertIdentifier(panel.id, "Panel");
    if (this.#panels.has(panel.id)) {
      throw new Error(`Panel "${panel.id}" is already registered`);
    }
    this.#panels.set(panel.id, panel);
  }

  unregister(id: string): void {
    this.#assertUsable();
    const panel = this.#panels.get(id);
    if (panel === undefined) {
      return;
    }
    this.#panels.delete(id);
    this.#disposePanel(panel);
  }

  get(id: string): ExtensionPanel | null {
    this.#assertUsable();
    return this.#panels.get(id) ?? null;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const panels = [...this.#panels.values()];
    this.#panels.clear();
    for (const panel of panels.reverse()) {
      this.#disposePanel(panel);
    }
  }

  #disposePanel(panel: ExtensionPanel): void {
    if (this.#disposedPanels.has(panel)) {
      return;
    }
    this.#disposedPanels.add(panel);
    panel.dispose();
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Panel registry is disposed");
    }
  }
}

interface ToolScope {
  readonly id: string;
  disposed: boolean;
}

export class ContractTestToolRegistry implements ToolRegistry {
  readonly #tools = new Map<string, Tool>();
  readonly #disposedTools = new Set<Tool>();
  readonly #scopes: ToolScope[] = [];
  #baseId: string | null = null;
  #disposed = false;

  register(tool: Tool): void {
    this.#assertUsable();
    assertIdentifier(tool.id, "Tool");
    if (this.#tools.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered`);
    }
    this.#tools.set(tool.id, tool);
  }

  unregister(id: string): void {
    this.#assertUsable();
    const tool = this.#tools.get(id);
    if (tool === undefined) {
      return;
    }
    this.#tools.delete(id);
    if (this.#baseId === id) {
      this.#baseId = null;
    }
    for (let index = this.#scopes.length - 1; index >= 0; index -= 1) {
      if (this.#scopes[index]?.id === id) {
        this.#scopes.splice(index, 1);
      }
    }
    this.#disposeTool(tool);
  }

  activate(id: string): void {
    this.#assertUsable();
    this.#requireTool(id);
    this.#baseId = id;
    this.#scopes.splice(0, this.#scopes.length);
  }

  activateScoped(id: string): Disposable {
    this.#assertUsable();
    this.#requireTool(id);
    const scope: ToolScope = { id, disposed: false };
    this.#scopes.push(scope);
    return {
      dispose: () => {
        if (scope.disposed) {
          return;
        }
        scope.disposed = true;
        const index = this.#scopes.indexOf(scope);
        if (index >= 0) {
          this.#scopes.splice(index, 1);
        }
      },
    };
  }

  active(): Tool | null {
    this.#assertUsable();
    const id = this.#scopes.at(-1)?.id ?? this.#baseId;
    return id === null ? null : (this.#tools.get(id) ?? null);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#scopes.splice(0, this.#scopes.length);
    this.#baseId = null;
    const tools = [...this.#tools.values()];
    this.#tools.clear();
    for (const tool of tools.reverse()) {
      this.#disposeTool(tool);
    }
  }

  #requireTool(id: string): Tool {
    const tool = this.#tools.get(id);
    if (tool === undefined) {
      throw new Error(`Unknown tool "${id}"`);
    }
    return tool;
  }

  #disposeTool(tool: Tool): void {
    if (this.#disposedTools.has(tool)) {
      return;
    }
    this.#disposedTools.add(tool);
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Tool registry is disposed");
    }
  }
}

interface ConfiguredFailure {
  readonly code: ShadingFailureCode;
  readonly reason: string;
}

class ContractTestShadingLease implements ShadingSelectionLease {
  readonly #registry: ContractTestRenderExtensionRegistry;
  readonly #listeners = new Set<(snapshot: ShadingSelectionSnapshot) => void>();
  #candidates: ReadonlyArray<string>;
  #snapshot: ShadingSelectionSnapshot;
  #disposed = false;

  constructor(registry: ContractTestRenderExtensionRegistry, candidates: ReadonlyArray<string>) {
    this.#registry = registry;
    this.#candidates = Object.freeze([...candidates]);
    this.#snapshot = registry.evaluate(this.#candidates);
  }

  setCandidates(providerIds: ReadonlyArray<string>): void {
    this.#assertUsable();
    this.#candidates = Object.freeze([...providerIds]);
    this.refresh();
  }

  snapshot(): ShadingSelectionSnapshot {
    this.#assertUsable();
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: ShadingSelectionSnapshot) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  refresh(): void {
    if (this.#disposed) {
      return;
    }
    this.#snapshot = this.#registry.evaluate(this.#candidates);
    for (const listener of [...this.#listeners]) {
      listener(this.#snapshot);
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#listeners.clear();
    this.#registry.release(this);
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Shading selection lease is disposed");
    }
  }
}

export class ContractTestRenderExtensionRegistry implements RenderExtensionRegistry {
  readonly #providers = new Map<string, ShadingProvider>();
  readonly #disposedProviders = new Set<ShadingProvider>();
  readonly #leases: ContractTestShadingLease[] = [];
  readonly #failures = new Map<string, ConfiguredFailure>();
  #capabilities: RendererCapabilities | null;
  #disposed = false;

  constructor(capabilities: RendererCapabilities | null = null) {
    this.#capabilities = capabilities;
  }

  register(provider: ShadingProvider): void {
    this.#assertUsable();
    assertIdentifier(provider.id, "Shading provider");
    if (this.#providers.has(provider.id)) {
      throw new Error(`Shading provider "${provider.id}" is already registered`);
    }
    this.#providers.set(provider.id, provider);
    this.#refresh();
  }

  unregister(id: string): void {
    this.#assertUsable();
    const provider = this.#providers.get(id);
    if (provider === undefined) {
      return;
    }
    this.#providers.delete(id);
    this.#disposeProvider(provider);
    this.#refresh();
  }

  get(id: string): ShadingProvider | null {
    this.#assertUsable();
    return this.#providers.get(id) ?? null;
  }

  list(): ReadonlyArray<ShadingProvider> {
    this.#assertUsable();
    return Object.freeze([...this.#providers.values()]);
  }

  activateScoped(providerIds: ReadonlyArray<string>): ShadingSelectionLease {
    this.#assertUsable();
    const lease = new ContractTestShadingLease(this, providerIds);
    this.#leases.push(lease);
    return lease;
  }

  active(): string | null {
    this.#assertUsable();
    return this.#leases.at(-1)?.snapshot().effectiveProviderId ?? null;
  }

  setCapabilities(capabilities: RendererCapabilities | null): void {
    this.#assertUsable();
    this.#capabilities = capabilities;
    this.#refresh();
  }

  fail(providerId: string, code: ShadingFailureCode, reason: string): void {
    this.#assertUsable();
    this.#failures.set(providerId, { code, reason });
    this.#refresh();
  }

  clearFailure(providerId: string): void {
    this.#assertUsable();
    this.#failures.delete(providerId);
    this.#refresh();
  }

  evaluate(candidates: ReadonlyArray<string>): ShadingSelectionSnapshot {
    const failures: ShadingCandidateFailure[] = [];
    let effectiveProviderId: string | null = null;

    for (const providerId of candidates) {
      const provider = this.#providers.get(providerId);
      if (provider === undefined) {
        failures.push({ providerId, code: "missing", reason: "Provider is not registered" });
        continue;
      }

      const configured = this.#failures.get(providerId);
      if (configured !== undefined) {
        failures.push({ providerId, code: configured.code, reason: configured.reason });
        continue;
      }

      if (this.#capabilities === null) {
        failures.push({ providerId, code: "unsupported", reason: "Renderer is not ready" });
        continue;
      }

      try {
        if (!provider.supports(this.#capabilities)) {
          failures.push({ providerId, code: "unsupported", reason: "Provider does not support renderer capabilities" });
          continue;
        }
      } catch (error) {
        failures.push({
          providerId,
          code: "unsupported",
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      effectiveProviderId = providerId;
      break;
    }

    return Object.freeze({
      candidates: Object.freeze([...candidates]),
      effectiveProviderId,
      failures: Object.freeze(failures.map((failure) => Object.freeze(failure))),
    });
  }

  release(lease: ContractTestShadingLease): void {
    const index = this.#leases.indexOf(lease);
    if (index >= 0) {
      this.#leases.splice(index, 1);
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const leases = [...this.#leases];
    this.#leases.splice(0, this.#leases.length);
    for (const lease of leases.reverse()) {
      lease.dispose();
    }
    const providers = [...this.#providers.values()];
    this.#providers.clear();
    for (const provider of providers.reverse()) {
      this.#disposeProvider(provider);
    }
    this.#failures.clear();
  }

  #refresh(): void {
    for (const lease of this.#leases) {
      lease.refresh();
    }
  }

  #disposeProvider(provider: ShadingProvider): void {
    if (this.#disposedProviders.has(provider)) {
      return;
    }
    this.#disposedProviders.add(provider);
    provider.dispose();
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Render extension registry is disposed");
    }
  }
}

export class ContractTestRenderControl implements RenderExtensionControl {
  #capabilities: RendererCapabilities | null;
  #requestCount = 0;

  constructor(capabilities: RendererCapabilities | null = null) {
    this.#capabilities = capabilities;
  }

  capabilities(): RendererCapabilities | null {
    return this.#capabilities;
  }

  requestRender(): void {
    this.#requestCount += 1;
  }

  setCapabilities(capabilities: RendererCapabilities | null): void {
    this.#capabilities = capabilities;
  }

  requestCount(): number {
    return this.#requestCount;
  }
}
