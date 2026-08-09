import type {
  ExtensionActivationResult,
  ExtensionHost,
  ExtensionRuntime,
  OptionalExtension,
} from "@octopoly/contracts";

interface PendingActivation {
  readonly extension: OptionalExtension;
  cancelled: boolean;
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class ExtensionRuntimeImpl implements ExtensionRuntime {
  readonly #host: ExtensionHost;
  readonly #active = new Map<string, OptionalExtension>();
  readonly #pending = new Map<string, PendingActivation>();
  readonly #disposedExtensions = new Set<OptionalExtension>();
  #disposed = false;

  constructor(host: ExtensionHost) {
    this.#host = host;
  }

  async activate(extension: OptionalExtension): Promise<ExtensionActivationResult> {
    this.#assertUsable();
    this.#assertIdentifier(extension.id);

    const activeDuplicate = this.#active.get(extension.id);
    const pendingDuplicate = this.#pending.get(extension.id)?.extension;
    if (activeDuplicate !== undefined || pendingDuplicate !== undefined) {
      if (activeDuplicate !== extension && pendingDuplicate !== extension) {
        this.#disposeExtension(extension);
      }
      return {
        status: "failed",
        reason: `Extension "${extension.id}" is already active or activating`,
      };
    }

    const pending: PendingActivation = { extension, cancelled: false };
    this.#pending.set(extension.id, pending);

    let result: ExtensionActivationResult;
    try {
      result = await extension.activate(this.#host);
    } catch (error) {
      result = { status: "failed", reason: failureReason(error) };
    }

    if (this.#pending.get(extension.id) === pending) {
      this.#pending.delete(extension.id);
    }

    if (pending.cancelled || this.#disposed) {
      this.#disposeExtension(extension);
      return {
        status: "failed",
        reason: `Extension "${extension.id}" activation was cancelled`,
      };
    }

    if (result.status !== "activated") {
      this.#disposeExtension(extension);
      return result;
    }

    this.#active.set(extension.id, extension);
    return result;
  }

  deactivate(id: string): void {
    if (this.#disposed) {
      return;
    }

    const pending = this.#pending.get(id);
    if (pending !== undefined) {
      pending.cancelled = true;
      this.#pending.delete(id);
      this.#disposeExtension(pending.extension);
    }

    const extension = this.#active.get(id);
    if (extension === undefined) {
      return;
    }

    this.#active.delete(id);
    this.#disposeExtension(extension);
  }

  active(): ReadonlyArray<string> {
    return Object.freeze([...this.#active.keys()]);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;

    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const activation of pending.reverse()) {
      activation.cancelled = true;
      this.#disposeExtension(activation.extension);
    }

    const active = [...this.#active.values()];
    this.#active.clear();
    try {
      for (const extension of active.reverse()) {
        this.#disposeExtension(extension);
      }
    } finally {
      this.#host.dispose();
    }
  }

  #disposeExtension(extension: OptionalExtension): void {
    if (this.#disposedExtensions.has(extension)) {
      return;
    }

    this.#disposedExtensions.add(extension);
    extension.dispose();
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Extension runtime is disposed");
    }
  }

  #assertIdentifier(id: string): void {
    if (id.trim().length === 0) {
      throw new Error("Extension id must not be empty");
    }
  }
}

export function createExtensionRuntime(host: ExtensionHost): ExtensionRuntime {
  return new ExtensionRuntimeImpl(host);
}
