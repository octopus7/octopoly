import {
  assertNonNegativeSafeInteger,
  incrementNonNegativeSafeInteger,
  type AttributeValue,
  type MeshCommand,
  type MeshDocument,
  type MeshElementSet,
  type MeshFactory,
  type MeshMutationResult,
  type MeshSnapshot,
  type SerializedAttribute,
  type SerializedMesh,
} from "@octopoly/contracts";
import {
  assertValidTopology,
  cloneAttributeValue,
  cloneMeshState,
  createMeshState,
  mergeAllocatorHistory,
  MeshDraft,
  restoreState,
  type ElementDomain,
  type MeshState,
} from "./internal";
import { applyElementMutation } from "./mutations/elements";
import { applyFaceMutation } from "./mutations/faces";
import { KernelMeshPatch, type MeshPatchHost } from "./patch";
import { InternalMeshQuery } from "./query";

const MAX_BATCH_COMMANDS = 4_096;
const MAX_RETOPO_VERTICES = 250_000;
const MAX_RETOPO_TRIANGLES = 500_000;
const ELEMENT_COMMANDS = new Set<MeshCommand["kind"]>([
  "createVertex",
  "setVertexPositions",
  "deleteElements",
  "splitEdge",
  "collapseEdge",
  "dissolveEdges",
  "weldVertices",
]);
const FACE_COMMANDS = new Set<MeshCommand["kind"]>([
  "createFace",
  "bridgeEdges",
  "extrudeEdges",
  "extrudeFaces",
  "rotateDiagonal",
]);
const DOMAINS: ReadonlyArray<ElementDomain> = ["vertex", "edge", "corner", "face"];

function immutableNumbers(values: Iterable<number>): ReadonlyArray<number> {
  return Object.freeze([...values].sort((a, b) => a - b));
}

function elementSet(values: Record<ElementDomain, Iterable<number>>): MeshElementSet {
  return Object.freeze({
    vertices: immutableNumbers(values.vertex),
    edges: immutableNumbers(values.edge),
    corners: immutableNumbers(values.corner),
    faces: immutableNumbers(values.face),
  });
}

function mapFor(state: MeshState, domain: ElementDomain): ReadonlyMap<number, unknown> {
  switch (domain) {
    case "vertex":
      return state.vertices;
    case "edge":
      return state.edges;
    case "corner":
      return state.corners;
    case "face":
      return state.faces;
  }
}

function stableValue(value: unknown): string {
  if (value instanceof Set) {
    return JSON.stringify([...value].sort((a, b) => Number(a) - Number(b)));
  }
  return JSON.stringify(value);
}

function adjacencyValue(state: MeshState, domain: ElementDomain, id: number): string {
  if (domain === "vertex") {
    return `${stableValue(state.vertexEdges.get(id) ?? new Set())}|${stableValue(state.vertexFaces.get(id) ?? new Set())}`;
  }
  if (domain === "edge") {
    return `${stableValue(state.edgeFaces.get(id) ?? new Set())}|${stableValue(state.edgeCorners.get(id) ?? new Set())}`;
  }
  return "";
}

function attributeValue(state: MeshState, domain: ElementDomain, id: number): string {
  if (domain === "edge") {
    return "";
  }
  const entries = [...state.attributes.values()]
    .filter((store) => store.domain === domain && store.entries.has(id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((store) => [store.name, store.entries.get(id)]);
  return JSON.stringify(entries);
}

interface StateDifference {
  readonly created: MeshElementSet;
  readonly updated: MeshElementSet;
  readonly deleted: MeshElementSet;
  readonly affected: MeshElementSet;
}

function stateDifference(before: MeshState, after: MeshState): StateDifference {
  const created: Record<ElementDomain, Set<number>> = {
    vertex: new Set(), edge: new Set(), corner: new Set(), face: new Set(),
  };
  const updated: Record<ElementDomain, Set<number>> = {
    vertex: new Set(), edge: new Set(), corner: new Set(), face: new Set(),
  };
  const deleted: Record<ElementDomain, Set<number>> = {
    vertex: new Set(), edge: new Set(), corner: new Set(), face: new Set(),
  };
  const affected: Record<ElementDomain, Set<number>> = {
    vertex: new Set(), edge: new Set(), corner: new Set(), face: new Set(),
  };

  for (const domain of DOMAINS) {
    const beforeMap = mapFor(before, domain);
    const afterMap = mapFor(after, domain);
    for (const id of afterMap.keys()) {
      if (!beforeMap.has(id)) {
        created[domain].add(id);
      } else if (
        stableValue(beforeMap.get(id)) !== stableValue(afterMap.get(id))
        || adjacencyValue(before, domain, id) !== adjacencyValue(after, domain, id)
        || attributeValue(before, domain, id) !== attributeValue(after, domain, id)
      ) {
        updated[domain].add(id);
      }
    }
    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) {
        deleted[domain].add(id);
      }
    }
    for (const values of [created[domain], updated[domain], deleted[domain]]) {
      for (const id of values) {
        affected[domain].add(id);
      }
    }
  }

  return {
    created: elementSet(created),
    updated: elementSet(updated),
    deleted: elementSet(deleted),
    affected: elementSet(affected),
  };
}

function applySetAttribute(state: MeshState, command: Extract<MeshCommand, { kind: "setAttribute" }>): void {
  if (command.values.size === 0) {
    throw new Error("setAttribute requires at least one value");
  }
  const draft = new MeshDraft(state);
  for (const [element, value] of command.values) {
    draft.setAttribute(command.key.domain, command.key.name, element, value);
  }
}

function flattenCommand(command: MeshCommand): ReadonlyArray<MeshCommand> {
  const flattened: MeshCommand[] = [];
  const stack: MeshCommand[] = [command];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) {
      continue;
    }
    if (next.kind === "batch") {
      if (next.commands.length === 0) {
        throw new Error("batch requires at least one command");
      }
      for (let index = next.commands.length - 1; index >= 0; index -= 1) {
        const nested = next.commands[index];
        if (nested) {
          stack.push(nested);
        }
      }
    } else {
      flattened.push(next);
    }
    if (flattened.length + stack.length > MAX_BATCH_COMMANDS) {
      throw new Error(`batch exceeds ${MAX_BATCH_COMMANDS} command hard limit`);
    }
  }
  return flattened;
}

function applyCommand(state: MeshState, command: MeshCommand): void {
  const draft = new MeshDraft(state);
  for (const item of flattenCommand(command)) {
    if (ELEMENT_COMMANDS.has(item.kind)) {
      applyElementMutation(draft, item);
    } else if (FACE_COMMANDS.has(item.kind)) {
      applyFaceMutation(draft, item);
    } else if (item.kind === "setAttribute") {
      applySetAttribute(state, item);
    } else {
      throw new Error(`unsupported mesh command ${item.kind}`);
    }
  }
}

function assertWithinMeshBudget(state: MeshState): void {
  if (state.vertices.size > MAX_RETOPO_VERTICES) {
    throw new Error(`mesh exceeds ${MAX_RETOPO_VERTICES} vertex hard limit`);
  }
  let triangles = 0;
  for (const face of state.faces.values()) {
    triangles += Math.max(0, face.corners.length - 2);
    if (triangles > MAX_RETOPO_TRIANGLES) {
      throw new Error(`mesh exceeds ${MAX_RETOPO_TRIANGLES} triangle hard limit`);
    }
  }
}

function prepareState(current: MeshState, command: MeshCommand, stamp: number): MeshState {
  incrementNonNegativeSafeInteger(current.version, "mesh version");
  const draft = cloneMeshState(current);
  applyCommand(draft, command);
  draft.version = incrementNonNegativeSafeInteger(current.version, "mesh version");
  draft.stamp = stamp;
  assertValidTopology(draft);
  assertWithinMeshBudget(draft);
  return draft;
}

function immutableAttributeValue(value: AttributeValue): AttributeValue {
  const copy = cloneAttributeValue(value);
  if (typeof copy === "object" && copy !== null) {
    Object.freeze(copy);
  }
  return copy;
}

function serializeState(state: MeshState): SerializedMesh {
  const query = new InternalMeshQuery(() => state);
  const snapshot = query.snapshot();
  const attributes: ReadonlyArray<SerializedAttribute> = Object.freeze(
    [...state.attributes.values()]
      .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))
      .map((store) => Object.freeze({
        domain: store.domain,
        name: store.name,
        entries: Object.freeze(
          [...store.entries]
            .sort(([a], [b]) => a - b)
            .map(([id, value]) => Object.freeze([id, immutableAttributeValue(value)] as const)),
        ),
      })),
  );
  return Object.freeze({
    version: snapshot.version,
    vertices: snapshot.vertices,
    edges: snapshot.edges,
    corners: snapshot.corners,
    faces: snapshot.faces,
    attributes,
  });
}

function assertUniqueIds(values: ReadonlyArray<{ readonly id: number }>, label: string): void {
  const seen = new Set<number>();
  for (const value of values) {
    assertNonNegativeSafeInteger(value.id, `${label} id`);
    if (seen.has(value.id)) {
      throw new Error(`duplicate ${label} id ${value.id}`);
    }
    seen.add(value.id);
  }
}

function validateSerializedSource(source: SerializedMesh): void {
  if (!source || typeof source !== "object") {
    throw new Error("serialized mesh must be an object");
  }
  assertNonNegativeSafeInteger(source.version, "mesh version");
  for (const [values, label] of [
    [source.vertices, "vertex"],
    [source.edges, "edge"],
    [source.corners, "corner"],
    [source.faces, "face"],
  ] as const) {
    if (!Array.isArray(values)) {
      throw new Error(`serialized ${label} records must be an array`);
    }
    assertUniqueIds(values, label);
  }
  if (!Array.isArray(source.attributes)) {
    throw new Error("serialized attributes must be an array");
  }
  const attributes = new Set<string>();
  for (const attribute of source.attributes) {
    const key = `${attribute.domain}\u0000${attribute.name}`;
    if (attributes.has(key)) {
      throw new Error(`duplicate attribute ${attribute.domain}:${attribute.name}`);
    }
    attributes.add(key);
    const ids = new Set<number>();
    for (const [id] of attribute.entries) {
      assertNonNegativeSafeInteger(id, "attribute element id");
      if (ids.has(id)) {
        throw new Error(`duplicate attribute entry ${attribute.domain}:${attribute.name}:${id}`);
      }
      ids.add(id);
    }
  }
}

export class MeshKernel implements MeshDocument, MeshPatchHost {
  #state: MeshState;
  readonly #query: InternalMeshQuery;
  #disposed = false;
  #nextPatch = 0;
  #nextStamp = 1;

  public constructor(state: MeshState = createMeshState()) {
    assertValidTopology(state);
    this.#state = cloneMeshState(state);
    this.#query = new InternalMeshQuery(() => this.#state);
  }

  public snapshot(): MeshSnapshot {
    this.assertActive();
    return this.#query.snapshot();
  }

  public vertex(id: number) {
    this.assertActive();
    return this.#query.vertex(id);
  }

  public edge(id: number) {
    this.assertActive();
    return this.#query.edge(id);
  }

  public corner(id: number) {
    this.assertActive();
    return this.#query.corner(id);
  }

  public face(id: number) {
    this.assertActive();
    return this.#query.face(id);
  }

  public incidentEdges(vertex: number): ReadonlyArray<number> {
    this.assertActive();
    return this.#query.incidentEdges(vertex);
  }

  public incidentFaces(vertex: number): ReadonlyArray<number> {
    this.assertActive();
    return this.#query.incidentFaces(vertex);
  }

  public adjacentFaces(edge: number): ReadonlyArray<number> {
    this.assertActive();
    return this.#query.adjacentFaces(edge);
  }

  public findEdge(a: number, b: number): number | null {
    this.assertActive();
    return this.#query.findEdge(a, b);
  }

  public validate(command: MeshCommand): ReadonlyArray<string> {
    this.assertActive();
    try {
      prepareState(this.#state, command, this.#nextStamp);
      return Object.freeze([]);
    } catch (error) {
      return Object.freeze([error instanceof Error ? error.message : String(error)]);
    }
  }

  public execute(label: string, command: MeshCommand): MeshMutationResult {
    this.assertActive();
    const before = cloneMeshState(this.#state);
    const after = prepareState(this.#state, command, this.#nextStamp);
    const difference = stateDifference(before, after);
    const patchId = `mesh-patch-${this.#nextPatch}`;
    this.#nextPatch = incrementNonNegativeSafeInteger(this.#nextPatch, "mesh patch id");
    this.#nextStamp = incrementNonNegativeSafeInteger(this.#nextStamp, "mesh state stamp");
    this.#state = after;
    const patch = new KernelMeshPatch(this, patchId, label, before, after, difference.affected);
    return Object.freeze({
      patch,
      snapshot: this.#query.snapshot(),
      created: difference.created,
      updated: difference.updated,
      deleted: difference.deleted,
    });
  }

  public serialize(): SerializedMesh {
    this.assertActive();
    return serializeState(this.#state);
  }

  public transitionPatch(expectedStamp: number, target: MeshState): void {
    this.assertActive();
    if (this.#state.stamp !== expectedStamp) {
      throw new Error(`mesh patch state mismatch: expected stamp ${expectedStamp}, received ${this.#state.stamp}`);
    }
    const next = mergeAllocatorHistory(this.#state, target);
    assertValidTopology(next);
    this.#state = next;
  }

  public assertActive(): void {
    if (this.#disposed) {
      throw new Error("mesh document is disposed");
    }
  }

  public dispose(): void {
    this.#disposed = true;
  }
}

export class MeshKernelFactory implements MeshFactory {
  public createEmpty(): MeshKernel {
    return new MeshKernel();
  }

  public restore(source: SerializedMesh): MeshKernel {
    validateSerializedSource(source);
    const state = restoreState(source);
    assertValidTopology(state);
    assertWithinMeshBudget(state);
    return new MeshKernel(state);
  }
}
