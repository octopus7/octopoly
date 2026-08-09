import {
  assertNonNegativeSafeInteger,
  type AttributeValue,
} from "@octopoly/contracts";
import { domainMap, edgePairKey } from "./state";
import type { MeshState } from "./types";

function finiteAttribute(value: AttributeValue): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => Number.isFinite(entry));
  }
  const keys = Object.keys(value).sort();
  const expected = keys.length === 2
    ? ["x", "y"]
    : keys.length === 3
      ? ["x", "y", "z"]
      : keys.length === 4
        ? ["w", "x", "y", "z"]
        : [];
  return expected.length === keys.length
    && keys.every((key, index) => key === expected[index])
    && Object.values(value).every((entry) => Number.isFinite(entry));
}

function sameSet(a: ReadonlySet<number> | undefined, b: ReadonlySet<number>): boolean {
  return a !== undefined && a.size === b.size && [...a].every((value) => b.has(value));
}

function validateId(id: number, label: string, errors: string[]): void {
  try {
    assertNonNegativeSafeInteger(id, label);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

export function validateTopology(state: MeshState): ReadonlyArray<string> {
  const errors: string[] = [];
  const expectedVertexEdges = new Map([...state.vertices.keys()].map((id) => [id, new Set<number>()]));
  const expectedVertexFaces = new Map([...state.vertices.keys()].map((id) => [id, new Set<number>()]));
  const expectedEdgeFaces = new Map([...state.edges.keys()].map((id) => [id, new Set<number>()]));
  const expectedEdgeCorners = new Map([...state.edges.keys()].map((id) => [id, new Set<number>()]));
  const pairIds = new Map<string, number>();

  validateId(state.version, "mesh version", errors);
  validateId(state.stamp, "mesh state stamp", errors);
  for (const domain of ["vertex", "edge", "corner", "face"] as const) {
    const allocator = state.allocators[domain];
    validateId(allocator.next, `${domain} next id`, errors);
    const live = domain === "vertex"
      ? state.vertices
      : domain === "edge"
        ? state.edges
        : domain === "corner"
          ? state.corners
          : state.faces;
    for (const id of allocator.retired) {
      validateId(id, `retired ${domain} id`, errors);
      if (live.has(id)) {
        errors.push(`live ${domain} ${id} is also retired`);
      }
    }
    for (const id of live.keys()) {
      if (id > allocator.next || (id === allocator.next && id !== Number.MAX_SAFE_INTEGER)) {
        errors.push(`live ${domain} ${id} is beyond allocator high-water mark`);
      }
    }
  }
  for (const [id, vertex] of state.vertices) {
    validateId(id, "vertex id", errors);
    if (id !== vertex.id) {
      errors.push(`vertex map key ${id} does not match record id ${vertex.id}`);
    }
    if (![vertex.position.x, vertex.position.y, vertex.position.z].every(Number.isFinite)) {
      errors.push(`vertex ${id} position must be finite`);
    }
  }

  for (const [id, edge] of state.edges) {
    validateId(id, "edge id", errors);
    if (id !== edge.id) {
      errors.push(`edge map key ${id} does not match record id ${edge.id}`);
    }
    const [a, b] = edge.vertices;
    if (a === b) {
      errors.push(`edge ${id} is a self-edge`);
    }
    if (!state.vertices.has(a) || !state.vertices.has(b)) {
      errors.push(`edge ${id} references a missing vertex`);
    }
    if (a > b) {
      errors.push(`edge ${id} endpoints are not canonical`);
    }
    const key = edgePairKey(a, b);
    const duplicate = pairIds.get(key);
    if (duplicate !== undefined) {
      errors.push(`edges ${duplicate} and ${id} duplicate endpoint pair ${key}`);
    } else {
      pairIds.set(key, id);
    }
    expectedVertexEdges.get(a)?.add(id);
    expectedVertexEdges.get(b)?.add(id);
  }

  for (const [id, face] of state.faces) {
    validateId(id, "face id", errors);
    if (id !== face.id) {
      errors.push(`face map key ${id} does not match record id ${face.id}`);
    }
    if (face.corners.length < 3) {
      errors.push(`face ${id} has fewer than three corners`);
    }
    if (new Set(face.corners).size !== face.corners.length) {
      errors.push(`face ${id} repeats a corner`);
    }
    const vertices: number[] = [];
    for (let index = 0; index < face.corners.length; index += 1) {
      const cornerId = face.corners[index];
      const nextCornerId = face.corners[(index + 1) % face.corners.length];
      if (cornerId === undefined || nextCornerId === undefined) {
        continue;
      }
      const corner = state.corners.get(cornerId);
      const nextCorner = state.corners.get(nextCornerId);
      if (!corner || !nextCorner) {
        errors.push(`face ${id} references a missing corner`);
        continue;
      }
      if (corner.face !== id) {
        errors.push(`corner ${corner.id} references face ${corner.face}, expected ${id}`);
      }
      vertices.push(corner.vertex);
      const edge = state.edges.get(corner.edge);
      if (!edge) {
        errors.push(`corner ${corner.id} references missing edge ${corner.edge}`);
      } else {
        const pair = edgePairKey(corner.vertex, nextCorner.vertex);
        if (pair !== edgePairKey(...edge.vertices)) {
          errors.push(`corner ${corner.id} outgoing edge does not match its face cycle`);
        }
      }
      expectedVertexFaces.get(corner.vertex)?.add(id);
      expectedEdgeFaces.get(corner.edge)?.add(id);
      expectedEdgeCorners.get(corner.edge)?.add(corner.id);
    }
    for (let index = 0; index < vertices.length; index += 1) {
      if (vertices[index] === vertices[(index + 1) % vertices.length]) {
        errors.push(`face ${id} has consecutive duplicate vertices`);
      }
    }
    if (new Set(vertices).size !== vertices.length) {
      errors.push(`face ${id} repeats a vertex`);
    }
  }

  for (const [id, corner] of state.corners) {
    validateId(id, "corner id", errors);
    if (id !== corner.id) {
      errors.push(`corner map key ${id} does not match record id ${corner.id}`);
    }
    if (!state.faces.has(corner.face) || !state.vertices.has(corner.vertex) || !state.edges.has(corner.edge)) {
      errors.push(`corner ${id} has a dangling reference`);
    }
    if (!state.faces.get(corner.face)?.corners.includes(id)) {
      errors.push(`corner ${id} is missing from face ${corner.face} cycle`);
    }
  }

  for (const [id, expected] of expectedVertexEdges) {
    if (!sameSet(state.vertexEdges.get(id), expected)) {
      errors.push(`vertex ${id} incident-edge adjacency mismatch`);
    }
  }
  if (state.vertexEdges.size !== expectedVertexEdges.size) {
    errors.push("vertex incident-edge adjacency count mismatch");
  }
  for (const [id, expected] of expectedVertexFaces) {
    if (!sameSet(state.vertexFaces.get(id), expected)) {
      errors.push(`vertex ${id} incident-face adjacency mismatch`);
    }
  }
  if (state.vertexFaces.size !== expectedVertexFaces.size) {
    errors.push("vertex incident-face adjacency count mismatch");
  }
  for (const [id, expected] of expectedEdgeFaces) {
    if (!sameSet(state.edgeFaces.get(id), expected)) {
      errors.push(`edge ${id} incident-face adjacency mismatch`);
    }
  }
  if (state.edgeFaces.size !== expectedEdgeFaces.size) {
    errors.push("edge incident-face adjacency count mismatch");
  }
  for (const [id, expected] of expectedEdgeCorners) {
    if (!sameSet(state.edgeCorners.get(id), expected)) {
      errors.push(`edge ${id} incident-corner adjacency mismatch`);
    }
  }
  if (state.edgeCorners.size !== expectedEdgeCorners.size) {
    errors.push("edge incident-corner adjacency count mismatch");
  }
  if (state.edgeByPair.size !== pairIds.size || [...pairIds].some(([key, id]) => state.edgeByPair.get(key) !== id)) {
    errors.push("edge endpoint lookup mismatch");
  }

  for (const [key, store] of state.attributes) {
    if (store.domain !== "vertex" && store.domain !== "corner" && store.domain !== "face") {
      errors.push(`attribute domain ${String(store.domain)} is invalid`);
      continue;
    }
    if (key !== `${store.domain}\u0000${store.name}`) {
      errors.push(`attribute store key mismatch for ${store.domain}:${store.name}`);
    }
    if (store.name.length === 0) {
      errors.push("attribute name must not be empty");
    }
    const live = domainMap(state, store.domain);
    for (const [id, value] of store.entries) {
      if (!live.has(id)) {
        errors.push(`attribute ${store.domain}:${store.name} references missing ${store.domain} ${id}`);
      }
      if (!finiteAttribute(value)) {
        errors.push(`attribute ${store.domain}:${store.name} value for ${id} must be finite`);
      }
    }
  }

  return Object.freeze(errors);
}

export function assertValidTopology(state: MeshState): void {
  const errors = validateTopology(state);
  if (errors.length > 0) {
    throw new Error(`mesh invariant violation: ${errors.join("; ")}`);
  }
}
