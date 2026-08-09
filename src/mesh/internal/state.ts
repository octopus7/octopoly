import {
  assertNonNegativeSafeInteger,
  incrementNonNegativeSafeInteger,
  type AttributeDomain,
  type AttributeValue,
  type SerializedMesh,
  type Vec3,
} from "@octopoly/contracts";
import type {
  CreatedFaceRecords,
  ElementDomain,
  IdAllocatorState,
  MeshState,
  MutableAttributeStore,
  RemovedElementIds,
} from "./types";

const DOMAINS: ReadonlyArray<ElementDomain> = ["vertex", "edge", "corner", "face"];

export function attributeStoreKey(domain: AttributeDomain, name: string): string {
  return `${domain}\u0000${name}`;
}

export function edgePairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function canonicalEdgeVertices(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function allocator(): IdAllocatorState {
  return { next: 0, retired: new Set<number>() };
}

export function createMeshState(): MeshState {
  return {
    version: 0,
    stamp: 0,
    vertices: new Map(),
    edges: new Map(),
    corners: new Map(),
    faces: new Map(),
    attributes: new Map(),
    allocators: {
      vertex: allocator(),
      edge: allocator(),
      corner: allocator(),
      face: allocator(),
    },
    edgeByPair: new Map(),
    vertexEdges: new Map(),
    vertexFaces: new Map(),
    edgeFaces: new Map(),
    edgeCorners: new Map(),
  };
}

export function cloneAttributeValue<T extends AttributeValue>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as unknown as T;
  }
  if (typeof value === "object" && value !== null) {
    return { ...value } as T;
  }
  return value;
}

function cloneAllocator(source: IdAllocatorState): IdAllocatorState {
  return { next: source.next, retired: new Set(source.retired) };
}

function cloneAttributeStore(source: MutableAttributeStore): MutableAttributeStore {
  return {
    domain: source.domain,
    name: source.name,
    entries: new Map(
      [...source.entries].map(([id, value]) => [id, cloneAttributeValue(value)]),
    ),
  };
}

export function cloneMeshState(source: MeshState): MeshState {
  const state: MeshState = {
    version: source.version,
    stamp: source.stamp,
    vertices: new Map(
      [...source.vertices].map(([id, vertex]) => [
        id,
        { id: vertex.id, position: { ...vertex.position } },
      ]),
    ),
    edges: new Map(
      [...source.edges].map(([id, edge]) => [id, { id: edge.id, vertices: [...edge.vertices] }]),
    ),
    corners: new Map(
      [...source.corners].map(([id, corner]) => [id, { ...corner }]),
    ),
    faces: new Map(
      [...source.faces].map(([id, face]) => [id, { id: face.id, corners: [...face.corners] }]),
    ),
    attributes: new Map(
      [...source.attributes].map(([key, store]) => [key, cloneAttributeStore(store)]),
    ),
    allocators: {
      vertex: cloneAllocator(source.allocators.vertex),
      edge: cloneAllocator(source.allocators.edge),
      corner: cloneAllocator(source.allocators.corner),
      face: cloneAllocator(source.allocators.face),
    },
    edgeByPair: new Map(),
    vertexEdges: new Map(),
    vertexFaces: new Map(),
    edgeFaces: new Map(),
    edgeCorners: new Map(),
  };
  rebuildIndexes(state);
  return state;
}

export function allocateId(state: MeshState, domain: ElementDomain): number {
  const domainAllocator = state.allocators[domain];
  let candidate = domainAllocator.next;
  while (domainAllocator.retired.has(candidate) || elementMap(state, domain).has(candidate)) {
    candidate = incrementNonNegativeSafeInteger(candidate, `${domain} id`);
  }
  domainAllocator.next = incrementNonNegativeSafeInteger(candidate, `${domain} id`);
  return candidate;
}

export function reserveExistingId(state: MeshState, domain: ElementDomain, id: number): void {
  assertNonNegativeSafeInteger(id, `${domain} id`);
  const domainAllocator = state.allocators[domain];
  if (id >= domainAllocator.next) {
    domainAllocator.next = id === Number.MAX_SAFE_INTEGER
      ? id
      : incrementNonNegativeSafeInteger(id, `${domain} id`);
  }
  domainAllocator.retired.delete(id);
}

export function retireId(state: MeshState, domain: ElementDomain, id: number): void {
  state.allocators[domain].retired.add(id);
}

export function elementMap(state: MeshState, domain: ElementDomain): Map<number, unknown> {
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

export function domainMap(state: MeshState, domain: AttributeDomain): Map<number, unknown> {
  switch (domain) {
    case "vertex":
      return state.vertices;
    case "corner":
      return state.corners;
    case "face":
      return state.faces;
  }
}

export function rebuildIndexes(state: MeshState): void {
  state.edgeByPair.clear();
  state.vertexEdges = new Map([...state.vertices.keys()].map((id) => [id, new Set()]));
  state.vertexFaces = new Map([...state.vertices.keys()].map((id) => [id, new Set()]));
  state.edgeFaces = new Map([...state.edges.keys()].map((id) => [id, new Set()]));
  state.edgeCorners = new Map([...state.edges.keys()].map((id) => [id, new Set()]));

  for (const edge of state.edges.values()) {
    state.edgeByPair.set(edgePairKey(...edge.vertices), edge.id);
    state.vertexEdges.get(edge.vertices[0])?.add(edge.id);
    state.vertexEdges.get(edge.vertices[1])?.add(edge.id);
  }

  for (const corner of state.corners.values()) {
    state.vertexFaces.get(corner.vertex)?.add(corner.face);
    state.edgeFaces.get(corner.edge)?.add(corner.face);
    state.edgeCorners.get(corner.edge)?.add(corner.id);
  }
}

function assertFinitePosition(position: Vec3, label: string): void {
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new RangeError(`${label} must contain finite coordinates`);
  }
}

export function addVertex(state: MeshState, position: Vec3): number {
  assertFinitePosition(position, "position");
  const id = allocateId(state, "vertex");
  state.vertices.set(id, { id, position: { ...position } });
  state.vertexEdges.set(id, new Set());
  state.vertexFaces.set(id, new Set());
  return id;
}

function ensureFaceVertices(state: MeshState, vertices: ReadonlyArray<number>): void {
  if (vertices.length < 3) {
    throw new Error("face requires at least three vertices");
  }
  if (new Set(vertices).size !== vertices.length) {
    throw new Error("face vertices must be unique");
  }
  for (const id of vertices) {
    assertNonNegativeSafeInteger(id, "vertex id");
    if (!state.vertices.has(id)) {
      throw new Error(`missing vertex ${id}`);
    }
  }
}

function getOrCreateEdge(state: MeshState, a: number, b: number, created: number[]): number {
  if (a === b) {
    throw new Error("self-edge is not allowed");
  }
  const key = edgePairKey(a, b);
  const existing = state.edgeByPair.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const id = allocateId(state, "edge");
  state.edges.set(id, { id, vertices: canonicalEdgeVertices(a, b) });
  state.edgeByPair.set(key, id);
  created.push(id);
  return id;
}

export function addFace(
  state: MeshState,
  vertices: ReadonlyArray<number>,
  existingFaceId?: number,
): CreatedFaceRecords {
  ensureFaceVertices(state, vertices);
  const face = existingFaceId ?? allocateId(state, "face");
  if (state.faces.has(face)) {
    throw new Error(`face ${face} already exists`);
  }
  if (existingFaceId !== undefined) {
    reserveExistingId(state, "face", face);
  }

  const edges: number[] = [];
  const corners: number[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    if (vertex === undefined || next === undefined) {
      throw new Error("invalid face cycle");
    }
    const edge = getOrCreateEdge(state, vertex, next, edges);
    const corner = allocateId(state, "corner");
    state.corners.set(corner, { id: corner, face, vertex, edge });
    corners.push(corner);
  }
  state.faces.set(face, { id: face, corners });
  rebuildIndexes(state);
  return { face, corners, edges };
}

function removeAttributeEntries(state: MeshState, domain: AttributeDomain, ids: ReadonlyArray<number>): void {
  for (const store of state.attributes.values()) {
    if (store.domain !== domain) {
      continue;
    }
    for (const id of ids) {
      store.entries.delete(id);
    }
  }
}

function removeUnusedEdges(state: MeshState): number[] {
  const used = new Set([...state.corners.values()].map((corner) => corner.edge));
  const removed: number[] = [];
  for (const edge of [...state.edges.values()]) {
    if (!used.has(edge.id)) {
      state.edges.delete(edge.id);
      retireId(state, "edge", edge.id);
      removed.push(edge.id);
    }
  }
  return removed;
}

export function removeFace(state: MeshState, faceId: number): RemovedElementIds {
  const face = state.faces.get(faceId);
  if (!face) {
    throw new Error(`missing face ${faceId}`);
  }
  const corners = [...face.corners];
  for (const corner of corners) {
    state.corners.delete(corner);
    retireId(state, "corner", corner);
  }
  state.faces.delete(faceId);
  retireId(state, "face", faceId);
  removeAttributeEntries(state, "corner", corners);
  removeAttributeEntries(state, "face", [faceId]);
  const edges = removeUnusedEdges(state);
  rebuildIndexes(state);
  return { vertices: [], edges, corners, faces: [faceId] };
}

export function replaceFaceVertices(
  state: MeshState,
  faceId: number,
  vertices: ReadonlyArray<number>,
): CreatedFaceRecords & { readonly removedCorners: ReadonlyArray<number>; readonly removedEdges: ReadonlyArray<number> } {
  ensureFaceVertices(state, vertices);
  const face = state.faces.get(faceId);
  if (!face) {
    throw new Error(`missing face ${faceId}`);
  }
  const oldByDirectedPair = new Map<string, number>();
  for (let index = 0; index < face.corners.length; index += 1) {
    const cornerId = face.corners[index];
    const nextCornerId = face.corners[(index + 1) % face.corners.length];
    const corner = cornerId === undefined ? undefined : state.corners.get(cornerId);
    const nextCorner = nextCornerId === undefined ? undefined : state.corners.get(nextCornerId);
    if (corner && nextCorner) {
      oldByDirectedPair.set(`${corner.vertex}>${nextCorner.vertex}`, corner.id);
    }
  }

  const createdEdges: number[] = [];
  const nextCorners: number[] = [];
  const reusedCorners = new Set<number>();
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    if (vertex === undefined || next === undefined) {
      throw new Error("invalid face cycle");
    }
    const edge = getOrCreateEdge(state, vertex, next, createdEdges);
    const reusable = oldByDirectedPair.get(`${vertex}>${next}`);
    const corner = reusable ?? allocateId(state, "corner");
    state.corners.set(corner, { id: corner, face: faceId, vertex, edge });
    nextCorners.push(corner);
    if (reusable !== undefined) {
      reusedCorners.add(reusable);
    }
  }

  const removedCorners = face.corners.filter((corner) => !reusedCorners.has(corner));
  for (const corner of removedCorners) {
    state.corners.delete(corner);
    retireId(state, "corner", corner);
  }
  removeAttributeEntries(state, "corner", removedCorners);
  face.corners = nextCorners;
  const removedEdges = removeUnusedEdges(state);
  rebuildIndexes(state);
  return {
    face: faceId,
    corners: nextCorners.filter((corner) => !reusedCorners.has(corner)),
    edges: createdEdges,
    removedCorners,
    removedEdges,
  };
}

export function removeVertex(state: MeshState, vertexId: number): void {
  if (!state.vertices.has(vertexId)) {
    throw new Error(`missing vertex ${vertexId}`);
  }
  if ((state.vertexEdges.get(vertexId)?.size ?? 0) > 0 || (state.vertexFaces.get(vertexId)?.size ?? 0) > 0) {
    throw new Error(`vertex ${vertexId} is not isolated`);
  }
  state.vertices.delete(vertexId);
  state.vertexEdges.delete(vertexId);
  state.vertexFaces.delete(vertexId);
  retireId(state, "vertex", vertexId);
  removeAttributeEntries(state, "vertex", [vertexId]);
}

export function setVertexPosition(state: MeshState, vertexId: number, position: Vec3): void {
  assertFinitePosition(position, "position");
  const vertex = state.vertices.get(vertexId);
  if (!vertex) {
    throw new Error(`missing vertex ${vertexId}`);
  }
  vertex.position = { ...position };
}

export function setAttributeValue(
  state: MeshState,
  domain: AttributeDomain,
  name: string,
  elementId: number,
  value: AttributeValue | undefined,
): void {
  if (name.length === 0) {
    throw new Error("attribute name must not be empty");
  }
  if (!domainMap(state, domain).has(elementId)) {
    throw new Error(`missing ${domain} ${elementId}`);
  }
  const key = attributeStoreKey(domain, name);
  let store = state.attributes.get(key);
  if (!store) {
    store = { domain, name, entries: new Map() };
    state.attributes.set(key, store);
  }
  if (value === undefined) {
    store.entries.delete(elementId);
    if (store.entries.size === 0) {
      state.attributes.delete(key);
    }
  } else {
    store.entries.set(elementId, cloneAttributeValue(value));
  }
}

export function faceVertices(state: MeshState, faceId: number): ReadonlyArray<number> {
  const face = state.faces.get(faceId);
  if (!face) {
    throw new Error(`missing face ${faceId}`);
  }
  return face.corners.map((cornerId) => {
    const corner = state.corners.get(cornerId);
    if (!corner) {
      throw new Error(`missing corner ${cornerId}`);
    }
    return corner.vertex;
  });
}

export function restoreState(source: SerializedMesh): MeshState {
  const state = createMeshState();
  state.version = source.version;
  for (const vertex of source.vertices) {
    state.vertices.set(vertex.id, { id: vertex.id, position: { ...vertex.position } });
    reserveExistingId(state, "vertex", vertex.id);
  }
  for (const edge of source.edges) {
    state.edges.set(edge.id, { id: edge.id, vertices: [...edge.vertices] });
    reserveExistingId(state, "edge", edge.id);
  }
  for (const corner of source.corners) {
    state.corners.set(corner.id, { ...corner });
    reserveExistingId(state, "corner", corner.id);
  }
  for (const face of source.faces) {
    state.faces.set(face.id, { id: face.id, corners: [...face.corners] });
    reserveExistingId(state, "face", face.id);
  }
  for (const attribute of source.attributes) {
    const store: MutableAttributeStore = {
      domain: attribute.domain,
      name: attribute.name,
      entries: new Map(
        attribute.entries.map(([id, value]) => [id, cloneAttributeValue(value)]),
      ),
    };
    const key = attributeStoreKey(attribute.domain, attribute.name);
    if (state.attributes.has(key)) {
      throw new Error(`duplicate attribute ${attribute.domain}:${attribute.name}`);
    }
    state.attributes.set(key, store);
  }
  rebuildIndexes(state);
  return state;
}

export function mergeAllocatorHistory(current: MeshState, target: MeshState): MeshState {
  const merged = cloneMeshState(target);
  for (const domain of DOMAINS) {
    const currentAllocator = current.allocators[domain];
    const targetAllocator = merged.allocators[domain];
    targetAllocator.next = Math.max(currentAllocator.next, targetAllocator.next);
    targetAllocator.retired = new Set([...currentAllocator.retired, ...targetAllocator.retired]);
    for (const liveId of elementMap(merged, domain).keys()) {
      targetAllocator.retired.delete(liveId);
    }
    for (const currentLiveId of elementMap(current, domain).keys()) {
      if (!elementMap(merged, domain).has(currentLiveId)) {
        targetAllocator.retired.add(currentLiveId);
      }
    }
  }
  return merged;
}
