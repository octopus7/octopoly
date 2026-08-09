import type {
  ExtensionActivationResult,
  ExtensionHost,
  OptionalExtension,
  ShadingSelectionSnapshot,
} from "@octopoly/contracts";

import { createExtensionRuntime } from "../optional-sdk/runtime";
import {
  defineOptionalManifest,
  type OptionalFeature,
  type OptionalManifest,
} from "./manifest";
import { OwnerExtensionScope, type OwnerResourceSnapshot } from "./owner-scope";

export interface OptionalActivationRecord {
  readonly feature: OptionalFeature;
  readonly extensionId: string | null;
  readonly status: ExtensionActivationResult["status"];
  readonly reason?: string;
}

export interface OptionalStartupReport {
  readonly activations: ReadonlyArray<OptionalActivationRecord>;
  readonly active: ReadonlyArray<string>;
}

interface ActivationAttempt {
  readonly feature: OptionalFeature;
  readonly extensionId: string;
  readonly scope: OwnerExtensionScope;
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function activationRecord(
  feature: OptionalFeature,
  extensionId: string | null,
  result: ExtensionActivationResult,
): OptionalActivationRecord {
  return Object.freeze({
    feature,
    extensionId,
    status: result.status,
    ...(result.status === "activated" ? {} : { reason: result.reason }),
  });
}

class OwnedExtension implements OptionalExtension {
  readonly id: string;
  readonly #extension: OptionalExtension;
  readonly #scope: OwnerExtensionScope;
  #disposed = false;

  constructor(extension: OptionalExtension, scope: OwnerExtensionScope) {
    this.id = extension.id;
    this.#extension = extension;
    this.#scope = scope;
  }

  async activate(_sharedHost: ExtensionHost): Promise<ExtensionActivationResult> {
    let succeeded = false;
    try {
      const result = await this.#extension.activate(this.#scope.host);
      succeeded = result.status === "activated";
      return result;
    } finally {
      this.#scope.finishActivation(succeeded && !this.#scope.disposed);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#extension.dispose();
    } catch (error) {
      this.#scope.addCleanupError(`extension dispose: ${reasonFrom(error)}`);
    } finally {
      this.#scope.dispose();
    }
  }
}

export class OptionalComposition {
  readonly #manifest: OptionalManifest;
  readonly #host: ExtensionHost;
  readonly #runtime: ReturnType<typeof createExtensionRuntime>;
  readonly #activeExtensions = new Map<string, OptionalExtension>();
  readonly #activeScopes = new Map<string, OwnerExtensionScope>();
  readonly #attempts: ActivationAttempt[] = [];
  readonly #records: OptionalActivationRecord[] = [];
  readonly #cleanupErrors: string[] = [];
  #started = false;
  #disposed = false;

  constructor(host: ExtensionHost, manifest: OptionalManifest) {
    this.#manifest = defineOptionalManifest(manifest.entries);
    this.#host = host;
    this.#runtime = createExtensionRuntime(host);
  }

  async start(signal?: AbortSignal): Promise<OptionalStartupReport> {
    if (this.#started) throw new Error("Optional composition has already started");
    if (this.#disposed) throw new Error("Optional composition is disposed");
    this.#started = true;

    const abort = (): void => this.dispose();
    if (signal?.aborted) {
      abort();
      return this.#report();
    }
    signal?.addEventListener("abort", abort, { once: true });

    try {
      for (const entry of this.#manifest.entries) {
        if (this.#disposed || signal?.aborted) break;

        let extension: OptionalExtension;
        try {
          extension = entry.create();
        } catch (error) {
          this.#records.push(activationRecord(entry.feature, null, {
            status: "failed",
            reason: reasonFrom(error),
          }));
          continue;
        }

        if (this.#activeExtensions.get(extension.id) === extension) {
          this.#records.push(activationRecord(entry.feature, extension.id, {
            status: "failed",
            reason: `Extension "${extension.id}" is already active or activating`,
          }));
          continue;
        }

        const scope = new OwnerExtensionScope(extension.id, this.#host);
        const owned = new OwnedExtension(extension, scope);
        const attempt: ActivationAttempt = {
          feature: entry.feature,
          extensionId: extension.id,
          scope,
        };
        this.#attempts.push(attempt);

        let result: ExtensionActivationResult;
        try {
          result = await this.#runtime.activate(owned);
        } catch (error) {
          owned.dispose();
          result = { status: "failed", reason: reasonFrom(error) };
        }
        this.#records.push(activationRecord(entry.feature, extension.id, result));

        if (result.status === "activated" && !this.#disposed) {
          this.#activeExtensions.set(extension.id, extension);
          this.#activeScopes.set(extension.id, scope);
        } else {
          scope.dispose();
        }
      }
    } finally {
      signal?.removeEventListener("abort", abort);
    }

    return this.#report();
  }

  active(): ReadonlyArray<string> {
    return this.#runtime.active();
  }

  extension<T extends OptionalExtension = OptionalExtension>(id: string): T | null {
    return (this.#activeExtensions.get(id) as T | undefined) ?? null;
  }

  deactivate(id: string): void {
    if (this.#disposed) return;
    this.#runtime.deactivate(id);
    this.#activeExtensions.delete(id);
    const scope = this.#activeScopes.get(id);
    this.#activeScopes.delete(id);
    scope?.dispose();
  }

  selectShading(
    extensionId: string,
    candidates?: ReadonlyArray<string>,
  ): ShadingSelectionSnapshot {
    if (this.#disposed) throw new Error("Optional composition is disposed");
    const scope = this.#activeScopes.get(extensionId);
    if (scope === undefined) {
      throw new Error(`Extension "${extensionId}" is not active`);
    }
    return scope.shading.select(candidates);
  }

  resources(): ReadonlyArray<OwnerResourceSnapshot> {
    return Object.freeze(this.#attempts.map(({ scope }) => scope.snapshot()));
  }

  cleanupErrors(): ReadonlyArray<string> {
    return Object.freeze([...this.#cleanupErrors]);
  }

  dispose(): void {
    if (!this.#disposed) {
      this.#disposed = true;
      try {
        this.#runtime.dispose();
      } catch (error) {
        this.#cleanupErrors.push(`runtime dispose: ${reasonFrom(error)}`);
      }
      this.#activeExtensions.clear();
      this.#activeScopes.clear();
    }

    // Retry any owner cleanup that reported a transient unregister/dispose error.
    for (const { scope } of [...this.#attempts].reverse()) scope.dispose();
  }

  #report(): OptionalStartupReport {
    return Object.freeze({
      activations: Object.freeze([...this.#records]),
      active: Object.freeze([...this.#runtime.active()]),
    });
  }
}

export function createOptionalComposition(
  host: ExtensionHost,
  manifest: OptionalManifest,
): OptionalComposition {
  return new OptionalComposition(host, manifest);
}
