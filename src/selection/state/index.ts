import type {
  EdgeId,
  FaceId,
  MeshQuery,
  SelectionChange,
  SelectionMode,
  SelectionService,
  SelectionSnapshot,
  Unsubscribe,
  VertexId,
} from "@octopoly/contracts";
import { incrementNonNegativeSafeInteger } from "@octopoly/contracts";

import { pruneSelection } from "../prune";

class ImmutableSet<T> implements ReadonlySet<T> {
  readonly #valuesSet: ReadonlySet<T>;

  constructor(values: Iterable<T>) {
    this.#valuesSet = new Set(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#valuesSet.size;
  }

  has(value: T): boolean {
    return this.#valuesSet.has(value);
  }

  forEach(
    callback: (value: T, value2: T, set: ReadonlySet<T>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.#valuesSet) {
      callback.call(thisArg, value, value, this);
    }
  }

  entries() {
    return this.#valuesSet.entries();
  }

  keys() {
    return this.#valuesSet.keys();
  }

  values() {
    return this.#valuesSet.values();
  }

  [Symbol.iterator]() {
    return this.#valuesSet[Symbol.iterator]();
  }
}

interface SelectionSets {
  readonly vertices: Set<VertexId>;
  readonly edges: Set<EdgeId>;
  readonly faces: Set<FaceId>;
}

interface Subscription {
  readonly listener: (snapshot: SelectionSnapshot) => void;
  active: boolean;
}

function immutableSnapshot(version: number, sets: SelectionSets): SelectionSnapshot {
  return Object.freeze({
    version,
    vertices: new ImmutableSet(sets.vertices),
    edges: new ImmutableSet(sets.edges),
    faces: new ImmutableSet(sets.faces),
  });
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function updateSet<T>(
  current: Set<T>,
  mode: SelectionMode,
  change: ReadonlySet<T> | undefined,
): Set<T> {
  if (mode === "replace") {
    return new Set(change ?? []);
  }

  if (change === undefined) {
    return current;
  }

  const next = new Set(current);

  for (const value of change) {
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

export class SelectionStore implements SelectionService {
  private version = 0;
  private sets: SelectionSets = {
    vertices: new Set(),
    edges: new Set(),
    faces: new Set(),
  };
  private currentSnapshot: SelectionSnapshot = immutableSnapshot(this.version, this.sets);
  private readonly subscriptions = new Set<Subscription>();

  snapshot(): SelectionSnapshot {
    return this.currentSnapshot;
  }

  update(mode: SelectionMode, change: SelectionChange): void {
    const next: SelectionSets = {
      vertices: updateSet(this.sets.vertices, mode, change.vertices),
      edges: updateSet(this.sets.edges, mode, change.edges),
      faces: updateSet(this.sets.faces, mode, change.faces),
    };

    this.commit(next);
  }

  clear(): void {
    this.commit({ vertices: new Set(), edges: new Set(), faces: new Set() });
  }

  prune(mesh: MeshQuery): void {
    this.update("replace", pruneSelection(mesh, this.currentSnapshot));
  }

  subscribe(listener: (snapshot: SelectionSnapshot) => void): Unsubscribe {
    const subscription: Subscription = { listener, active: true };
    this.subscriptions.add(subscription);

    return () => {
      if (!subscription.active) {
        return;
      }

      subscription.active = false;
      this.subscriptions.delete(subscription);
    };
  }

  private commit(next: SelectionSets): void {
    if (
      setsEqual(this.sets.vertices, next.vertices) &&
      setsEqual(this.sets.edges, next.edges) &&
      setsEqual(this.sets.faces, next.faces)
    ) {
      return;
    }

    const nextVersion = incrementNonNegativeSafeInteger(this.version, "selection version");
    this.version = nextVersion;
    this.sets = next;
    this.currentSnapshot = immutableSnapshot(nextVersion, next);

    const publishedSnapshot = this.currentSnapshot;
    const subscriptions = [...this.subscriptions];
    for (const subscription of subscriptions) {
      if (subscription.active) {
        subscription.listener(publishedSnapshot);
      }
    }
  }
}
