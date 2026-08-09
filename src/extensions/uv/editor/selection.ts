import type { CornerId, SelectionMode, Unsubscribe } from "@octopoly/contracts";

export interface UvEditorSelectionSnapshot {
  readonly version: number;
  readonly corners: ReadonlySet<CornerId>;
  readonly islands: ReadonlySet<number>;
}

function assertId(id: number, label: string): void {
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function applySelectionMode(
  current: ReadonlySet<number>,
  mode: SelectionMode,
  values: ReadonlySet<number>,
): Set<number> {
  if (mode === "replace") {
    return new Set(values);
  }

  const next = new Set(current);
  for (const value of values) {
    if (mode === "add") {
      next.add(value);
    } else if (mode === "subtract") {
      next.delete(value);
    } else if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
  }
  return next;
}

function sameSet(first: ReadonlySet<number>, second: ReadonlySet<number>): boolean {
  if (first.size !== second.size) return false;
  for (const value of first) {
    if (!second.has(value)) return false;
  }
  return true;
}

class ImmutableReadonlySet<T> implements ReadonlySet<T> {
  readonly #values: Set<T>;

  constructor(values: Iterable<T>) {
    this.#values = new Set(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  has(value: T): boolean {
    return this.#values.has(value);
  }

  entries(): SetIterator<[T, T]> {
    return this.#values.entries();
  }

  keys(): SetIterator<T> {
    return this.#values.keys();
  }

  values(): SetIterator<T> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.#values) callbackfn.call(thisArg, value, value, this);
  }

  [Symbol.iterator](): SetIterator<T> {
    return this.#values[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "Set";
  }
}

export class UvEditorSelection {
  readonly #listeners = new Set<(snapshot: UvEditorSelectionSnapshot) => void>();
  #corners = new Set<CornerId>();
  #islands = new Set<number>();
  #version = 0;

  snapshot(): UvEditorSelectionSnapshot {
    return Object.freeze({
      version: this.#version,
      corners: new ImmutableReadonlySet(this.#corners),
      islands: new ImmutableReadonlySet(this.#islands),
    });
  }

  updateCorners(mode: SelectionMode, corners: ReadonlySet<CornerId>): void {
    for (const corner of corners) assertId(corner, "corner id");
    const next = applySelectionMode(this.#corners, mode, corners);
    this.#replace(next, this.#islands);
  }

  updateIslands(mode: SelectionMode, islands: ReadonlySet<number>): void {
    for (const island of islands) assertId(island, "island id");
    const next = applySelectionMode(this.#islands, mode, islands);
    this.#replace(this.#corners, next);
  }

  replace(corners: ReadonlySet<CornerId>, islands: ReadonlySet<number>): void {
    for (const corner of corners) assertId(corner, "corner id");
    for (const island of islands) assertId(island, "island id");
    this.#replace(new Set(corners), new Set(islands));
  }

  prune(liveCorners: ReadonlySet<CornerId>, liveIslands?: ReadonlySet<number>): void {
    const corners = new Set([...this.#corners].filter((corner) => liveCorners.has(corner)));
    const islands = liveIslands === undefined
      ? this.#islands
      : new Set([...this.#islands].filter((island) => liveIslands.has(island)));
    this.#replace(corners, islands);
  }

  clear(): void {
    this.#replace(new Set(), new Set());
  }

  subscribe(listener: (snapshot: UvEditorSelectionSnapshot) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #replace(corners: ReadonlySet<CornerId>, islands: ReadonlySet<number>): void {
    if (sameSet(this.#corners, corners) && sameSet(this.#islands, islands)) return;
    if (this.#version === Number.MAX_SAFE_INTEGER) {
      throw new Error("UV editor selection version overflow");
    }
    this.#corners = new Set(corners);
    this.#islands = new Set(islands);
    this.#version += 1;
    const snapshot = this.snapshot();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }
}
