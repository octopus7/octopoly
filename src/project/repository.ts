import type { ProjectDocument } from "@octopoly/contracts";
import type { ProjectStorage } from "./storage";
import { migrateProjectDocument, validateProjectDocument } from "./validation";
import { linkAbortSignals } from "./cancellation";

export const MAX_PROJECT_BYTES = 256 * 1024 * 1024;

export class ProjectRepository {
  #disposed = false;
  readonly #lifetime = new AbortController();

  constructor(
    private readonly storage: ProjectStorage,
    private readonly maximumBytes = MAX_PROJECT_BYTES,
  ) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new RangeError("maximumBytes must be a positive safe integer");
  }

  async load(id: string, signal?: AbortSignal): Promise<ProjectDocument | null> {
    this.#assertUsable();
    const operation = linkAbortSignals(this.#lifetime.signal, signal);
    try {
      const stored = await this.storage.get<unknown>("projects", this.#id(id), operation.signal);
      this.#assertUsable();
      return stored === undefined ? null : migrateProjectDocument(stored);
    } finally {
      operation.dispose();
    }
  }

  async save(id: string, document: ProjectDocument, signal?: AbortSignal): Promise<void> {
    this.#assertUsable();
    const validated = validateProjectDocument(document);
    const byteLength = new TextEncoder().encode(JSON.stringify(validated)).byteLength;
    if (byteLength > this.maximumBytes) throw new RangeError(`Project exceeds the ${this.maximumBytes} byte hard limit`);
    const operation = linkAbortSignals(this.#lifetime.signal, signal);
    try {
      await this.storage.transact([{ kind: "put", store: "projects", key: this.#id(id), value: validated }], operation.signal);
      this.#assertUsable();
    } finally {
      operation.dispose();
    }
  }

  async remove(id: string, signal?: AbortSignal): Promise<void> {
    this.#assertUsable();
    const operation = linkAbortSignals(this.#lifetime.signal, signal);
    try {
      await this.storage.transact([{ kind: "delete", store: "projects", key: this.#id(id) }], operation.signal);
      this.#assertUsable();
    } finally {
      operation.dispose();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifetime.abort();
  }

  #id(id: string): string {
    if (id.length === 0) throw new TypeError("project id must not be empty");
    return id;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Project repository is disposed");
  }
}
