import type {
  RenderExtensionRegistry,
  ShadingCandidateFailure,
  ShadingProvider,
  ShadingSelectionLease,
  ShadingSelectionSnapshot,
  Unsubscribe,
} from "@octopoly/contracts";

const EMPTY_SNAPSHOT: ShadingSelectionSnapshot = freezeSnapshot([], null, []);

type ProviderEvaluator = (provider: ShadingProvider) => ShadingCandidateFailure | null;

export class WebGL2RenderExtensionRegistry implements RenderExtensionRegistry {
  readonly #providers = new Map<string, ShadingProvider>();
  readonly #leases: SelectionLease[] = [];
  #lastEvaluator: ProviderEvaluator | null = null;
  #disposed = false;

  register(provider: ShadingProvider): void {
    this.#assertAlive();
    if (provider.id.length === 0) {
      throw new Error("Shading provider id must not be empty");
    }
    if (this.#providers.has(provider.id)) {
      throw new Error(`Shading provider '${provider.id}' is already registered`);
    }
    this.#providers.set(provider.id, provider);
    // Registration by itself must never select a shading mode.
  }

  unregister(id: string): void {
    this.#assertAlive();
    const provider = this.#providers.get(id);
    if (provider === undefined) {
      return;
    }

    this.#providers.delete(id);
    try {
      provider.dispose();
    } catch {
      // Optional provider teardown cannot leave registry selection half-updated.
    }

    for (const lease of this.#leases) {
      if (lease.disposed || !lease.candidates.includes(id)) {
        continue;
      }
      lease.publish(markMissing(lease.currentSnapshot, id));
    }

    const top = this.#topLease();
    if (top !== null && this.#lastEvaluator !== null) {
      this.#evaluateLease(top, this.#lastEvaluator);
    }
  }

  get(id: string): ShadingProvider | null {
    this.#assertAlive();
    return this.#providers.get(id) ?? null;
  }

  list(): ReadonlyArray<ShadingProvider> {
    this.#assertAlive();
    return Object.freeze([...this.#providers.values()]);
  }

  activateScoped(providerIds: ReadonlyArray<string>): ShadingSelectionLease {
    this.#assertAlive();
    const lease = new SelectionLease(this, providerIds);
    this.#leases.push(lease);
    if (this.#lastEvaluator !== null) {
      this.#evaluateLease(lease, this.#lastEvaluator);
    }
    return lease;
  }

  active(): string | null {
    if (this.#disposed) {
      return null;
    }
    return this.#topLease()?.currentSnapshot.effectiveProviderId ?? null;
  }

  /** Renderer-local hook that validates the top lease in candidate order. */
  evaluateActive(evaluator: ProviderEvaluator): ShadingSelectionSnapshot {
    this.#assertAlive();
    this.#lastEvaluator = evaluator;
    const lease = this.#topLease();
    if (lease === null) {
      return EMPTY_SNAPSHOT;
    }
    return this.#evaluateLease(lease, evaluator);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#lastEvaluator = null;

    for (const lease of this.#leases) {
      lease.disposeFromRegistry();
    }
    this.#leases.length = 0;

    const providers = [...this.#providers.values()];
    this.#providers.clear();
    for (const provider of providers) {
      try {
        provider.dispose();
      } catch {
        // Continue disposing the remaining independently owned providers.
      }
    }
  }

  setLeaseCandidates(lease: SelectionLease, providerIds: ReadonlyArray<string>): void {
    this.#assertLeaseUsable(lease);
    lease.replaceCandidates(providerIds);
    if (this.#topLease() === lease && this.#lastEvaluator !== null) {
      this.#evaluateLease(lease, this.#lastEvaluator);
    }
  }

  disposeLease(lease: SelectionLease): void {
    if (lease.disposed) {
      return;
    }
    this.#assertAlive();
    const wasTop = this.#topLease() === lease;
    const index = this.#leases.indexOf(lease);
    if (index < 0) {
      throw new Error("Shading selection lease does not belong to this registry");
    }
    this.#leases.splice(index, 1);
    lease.disposeFromRegistry();

    if (wasTop) {
      const restored = this.#topLease();
      if (restored !== null && this.#lastEvaluator !== null) {
        this.#evaluateLease(restored, this.#lastEvaluator);
      }
    }
  }

  #evaluateLease(
    lease: SelectionLease,
    evaluator: ProviderEvaluator,
  ): ShadingSelectionSnapshot {
    const failures: ShadingCandidateFailure[] = [];
    let effectiveProviderId: string | null = null;

    for (const providerId of lease.candidates) {
      const provider = this.#providers.get(providerId);
      if (provider === undefined) {
        failures.push(failure(providerId, "missing", `Provider '${providerId}' is not registered`));
        continue;
      }

      let rejected: ShadingCandidateFailure | null;
      try {
        rejected = evaluator(provider);
      } catch (error) {
        rejected = failure(providerId, "unsupported", reasonFrom(error));
      }
      if (rejected === null) {
        effectiveProviderId = providerId;
        break;
      }
      failures.push(rejected);
    }

    const snapshot = freezeSnapshot(lease.candidates, effectiveProviderId, failures);
    lease.publish(snapshot);
    return snapshot;
  }

  #topLease(): SelectionLease | null {
    return this.#leases.at(-1) ?? null;
  }

  #assertLeaseUsable(lease: SelectionLease): void {
    this.#assertAlive();
    if (lease.disposed || !this.#leases.includes(lease)) {
      throw new Error("Shading selection lease is disposed");
    }
  }

  #assertAlive(): void {
    if (this.#disposed) {
      throw new Error("Render extension registry is disposed");
    }
  }
}

class SelectionLease implements ShadingSelectionLease {
  readonly #registry: WebGL2RenderExtensionRegistry;
  readonly #listeners = new Set<(snapshot: ShadingSelectionSnapshot) => void>();
  candidates: ReadonlyArray<string>;
  currentSnapshot: ShadingSelectionSnapshot;
  disposed = false;

  constructor(registry: WebGL2RenderExtensionRegistry, providerIds: ReadonlyArray<string>) {
    this.#registry = registry;
    this.candidates = freezeCandidates(providerIds);
    this.currentSnapshot = freezeSnapshot(this.candidates, null, []);
  }

  setCandidates(providerIds: ReadonlyArray<string>): void {
    this.#registry.setLeaseCandidates(this, providerIds);
  }

  snapshot(): ShadingSelectionSnapshot {
    if (this.disposed) {
      throw new Error("Shading selection lease is disposed");
    }
    return this.currentSnapshot;
  }

  subscribe(listener: (snapshot: ShadingSelectionSnapshot) => void): Unsubscribe {
    if (this.disposed) {
      throw new Error("Shading selection lease is disposed");
    }
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.#listeners.delete(listener);
    };
  }

  dispose(): void {
    this.#registry.disposeLease(this);
  }

  replaceCandidates(providerIds: ReadonlyArray<string>): void {
    this.candidates = freezeCandidates(providerIds);
    this.publish(freezeSnapshot(this.candidates, null, []));
  }

  publish(snapshot: ShadingSelectionSnapshot): void {
    if (sameSnapshot(this.currentSnapshot, snapshot)) {
      return;
    }
    this.currentSnapshot = snapshot;
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch {
        // One observer must not prevent the remaining observers from seeing state.
      }
    }
  }

  disposeFromRegistry(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.#listeners.clear();
  }
}

function freezeCandidates(providerIds: ReadonlyArray<string>): ReadonlyArray<string> {
  return Object.freeze([...providerIds]);
}

function failure(
  providerId: string,
  code: ShadingCandidateFailure["code"],
  reason: string,
): ShadingCandidateFailure {
  return Object.freeze({ providerId, code, reason });
}

function freezeSnapshot(
  candidates: ReadonlyArray<string>,
  effectiveProviderId: string | null,
  failures: ReadonlyArray<ShadingCandidateFailure>,
): ShadingSelectionSnapshot {
  return Object.freeze({
    candidates: Object.freeze([...candidates]),
    effectiveProviderId,
    failures: Object.freeze([...failures]),
  });
}

function markMissing(
  snapshot: ShadingSelectionSnapshot,
  providerId: string,
): ShadingSelectionSnapshot {
  const failures = snapshot.failures.filter((entry) => entry.providerId !== providerId);
  failures.push(failure(providerId, "missing", `Provider '${providerId}' is not registered`));
  return freezeSnapshot(
    snapshot.candidates,
    snapshot.effectiveProviderId === providerId ? null : snapshot.effectiveProviderId,
    failures,
  );
}

function sameSnapshot(a: ShadingSelectionSnapshot, b: ShadingSelectionSnapshot): boolean {
  if (a.effectiveProviderId !== b.effectiveProviderId) {
    return false;
  }
  if (a.candidates.length !== b.candidates.length || a.failures.length !== b.failures.length) {
    return false;
  }
  for (let index = 0; index < a.candidates.length; index += 1) {
    if (a.candidates[index] !== b.candidates[index]) {
      return false;
    }
  }
  for (let index = 0; index < a.failures.length; index += 1) {
    const left = a.failures[index];
    const right = b.failures[index];
    if (
      left?.providerId !== right?.providerId ||
      left?.code !== right?.code ||
      left?.reason !== right?.reason
    ) {
      return false;
    }
  }
  return true;
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
