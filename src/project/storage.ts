export type ProjectStoreName = "projects" | "images" | "references";

export type ProjectStoreMutation =
  | { readonly kind: "put"; readonly store: ProjectStoreName; readonly key: string; readonly value: unknown }
  | { readonly kind: "delete"; readonly store: ProjectStoreName; readonly key: string };

/** Internal persistence seam; IndexedDB is the production implementation and tests may inject a fake. */
export interface ProjectStorage {
  get<T>(store: ProjectStoreName, key: string, signal?: AbortSignal): Promise<T | undefined>;
  transact(mutations: ReadonlyArray<ProjectStoreMutation>, signal?: AbortSignal): Promise<void>;
  dispose(): void;
}

function abortError(): DOMException {
  return new DOMException("The storage operation was aborted", "AbortError");
}

function requestResult<T>(request: IDBRequest<T>, transaction: IDBTransaction, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => transaction.abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.addEventListener("success", () => {
      signal?.removeEventListener("abort", abort);
      resolve(request.result);
    }, { once: true });
    request.addEventListener("error", () => {
      signal?.removeEventListener("abort", abort);
      reject(request.error ?? new Error("IndexedDB request failed"));
    }, { once: true });
    transaction.addEventListener("abort", () => {
      signal?.removeEventListener("abort", abort);
      reject(signal?.aborted ? abortError() : transaction.error ?? new Error("IndexedDB transaction aborted"));
    }, { once: true });
  });
}

export class IndexedDbProjectStorage implements ProjectStorage {
  readonly #database: Promise<IDBDatabase>;
  #disposed = false;

  constructor(
    name = "octopoly-projects",
    factory: IDBFactory = indexedDB,
  ) {
    this.#database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        for (const store of ["projects", "images", "references"] as const) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
        }
      });
      request.addEventListener("success", () => {
        if (this.#disposed) {
          request.result.close();
          reject(new Error("Project storage is disposed"));
        } else resolve(request.result);
      }, { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("Could not open IndexedDB")), { once: true });
    });
  }

  async get<T>(store: ProjectStoreName, key: string, signal?: AbortSignal): Promise<T | undefined> {
    this.#assertUsable();
    if (signal?.aborted) throw abortError();
    const database = await this.#database;
    this.#assertUsable();
    if (signal?.aborted) throw abortError();
    const transaction = database.transaction(store, "readonly");
    return requestResult(transaction.objectStore(store).get(key) as IDBRequest<T | undefined>, transaction, signal);
  }

  async transact(mutations: ReadonlyArray<ProjectStoreMutation>, signal?: AbortSignal): Promise<void> {
    this.#assertUsable();
    if (signal?.aborted) throw abortError();
    if (mutations.length === 0) return;
    const database = await this.#database;
    this.#assertUsable();
    if (signal?.aborted) throw abortError();
    const stores = [...new Set(mutations.map((mutation) => mutation.store))];
    const transaction = database.transaction(stores, "readwrite");
    const abort = () => transaction.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const completion = new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, { once: true });
      transaction.addEventListener("abort", () => {
        signal?.removeEventListener("abort", abort);
        reject(signal?.aborted ? abortError() : transaction.error ?? new Error("IndexedDB transaction aborted"));
      }, { once: true });
      transaction.addEventListener("error", () => {
        signal?.removeEventListener("abort", abort);
        reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      }, { once: true });
    });
    for (const mutation of mutations) {
      const store = transaction.objectStore(mutation.store);
      if (mutation.kind === "put") store.put(mutation.value, mutation.key);
      else store.delete(mutation.key);
    }
    await completion;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    void this.#database.then((database) => database.close(), () => undefined);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Project storage is disposed");
  }
}
