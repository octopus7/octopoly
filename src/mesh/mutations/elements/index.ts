import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
  type MeshCommand,
  type Vec3,
} from "@octopoly/contracts";
import {
  MeshDraft,
  assertValidTopology,
  cloneMeshState,
  edgePairKey,
  type MeshState,
} from "../../internal";

type ElementMutationCommand = Extract<
  MeshCommand,
  {
    readonly kind:
      | "createVertex"
      | "setVertexPositions"
      | "deleteElements"
      | "splitEdge"
      | "collapseEdge"
      | "dissolveEdges"
      | "weldVertices";
  }
>;

function assertFinitePosition(position: Vec3, label: string): void {
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new RangeError(`${label} must contain finite coordinates`);
  }
}

function assertUniqueIds(ids: ReadonlyArray<number>, label: string): void {
  const seen = new Set<number>();
  for (const id of ids) {
    assertNonNegativeSafeInteger(id, `${label} id`);
    if (seen.has(id)) {
      throw new Error(`${label} ${id} is repeated`);
    }
    seen.add(id);
  }
}

function assertExistingIds(
  ids: ReadonlyArray<number>,
  records: ReadonlyMap<number, unknown>,
  label: string,
): void {
  assertUniqueIds(ids, label);
  for (const id of ids) {
    if (!records.has(id)) {
      throw new Error(`missing ${label} ${id}`);
    }
  }
}

function assertSupportedEdgeNeighborhood(state: MeshState, edgeId: number, operation: string): void {
  assertNonNegativeSafeInteger(edgeId, "edge id");
  if (!state.edges.has(edgeId)) {
    throw new Error(`missing edge ${edgeId}`);
  }
  const incidentFaces = state.edgeFaces.get(edgeId)?.size ?? 0;
  if (incidentFaces === 0) {
    throw new Error(`${operation} does not support an isolated edge`);
  }
  if (incidentFaces > 2) {
    throw new Error(`${operation} does not support a non-manifold edge`);
  }
}

function assertManifoldVertexNeighborhood(state: MeshState, vertices: ReadonlyArray<number>, operation: string): void {
  for (const vertex of vertices) {
    for (const edge of state.vertexEdges.get(vertex) ?? []) {
      if ((state.edgeFaces.get(edge)?.size ?? 0) > 2) {
        throw new Error(`${operation} does not support a non-manifold vertex neighborhood`);
      }
    }
  }
}

function cycleEdgeIndex(cycle: ReadonlyArray<number>, a: number, b: number): number {
  for (let index = 0; index < cycle.length; index += 1) {
    const current = cycle[index];
    const next = cycle[(index + 1) % cycle.length];
    if ((current === a && next === b) || (current === b && next === a)) {
      return index;
    }
  }
  return -1;
}

function directedCycleEdgeIndex(cycle: ReadonlyArray<number>, start: number, end: number): number {
  for (let index = 0; index < cycle.length; index += 1) {
    if (cycle[index] === start && cycle[(index + 1) % cycle.length] === end) {
      return index;
    }
  }
  return -1;
}

function pathOppositeDirectedEdge(
  cycle: ReadonlyArray<number>,
  directedEdgeIndex: number,
): ReadonlyArray<number> {
  const path: number[] = [];
  for (let offset = 1; offset <= cycle.length; offset += 1) {
    const vertex = cycle[(directedEdgeIndex + offset) % cycle.length];
    if (vertex === undefined) {
      throw new Error("invalid face cycle");
    }
    path.push(vertex);
  }
  return path;
}

function compactConsecutiveVertices(vertices: ReadonlyArray<number>): number[] {
  const compacted: number[] = [];
  for (const vertex of vertices) {
    if (compacted.at(-1) !== vertex) {
      compacted.push(vertex);
    }
  }
  if (compacted.length > 1 && compacted[0] === compacted.at(-1)) {
    compacted.pop();
  }
  return compacted;
}

function faceSetKey(vertices: ReadonlyArray<number>): string {
  return [...vertices].sort((a, b) => a - b).join(":");
}

function assertDistinctFaces(draft: MeshDraft): void {
  const seen = new Map<string, number>();
  for (const face of draft.state.faces.values()) {
    const vertices = draft.faceVertices(face.id);
    const key = faceSetKey(vertices);
    const duplicate = seen.get(key);
    if (duplicate !== undefined) {
      throw new Error(`faces ${duplicate} and ${face.id} have duplicate vertex sets`);
    }
    seen.set(key, face.id);
  }
}

function applyCreateVertex(draft: MeshDraft, command: Extract<MeshCommand, { readonly kind: "createVertex" }>): void {
  assertFinitePosition(command.position, "position");
  draft.createVertex(command.position);
}

function applySetVertexPositions(
  draft: MeshDraft,
  command: Extract<MeshCommand, { readonly kind: "setVertexPositions" }>,
): void {
  const entries = [...command.positions];
  assertExistingIds(entries.map(([vertex]) => vertex), draft.state.vertices, "vertex");
  for (const [vertex, position] of entries) {
    assertFinitePosition(position, `position for vertex ${vertex}`);
  }
  for (const [vertex, position] of entries) {
    draft.setVertexPosition(vertex, position);
  }
}

function applyDeleteElements(
  draft: MeshDraft,
  command: Extract<MeshCommand, { readonly kind: "deleteElements" }>,
): void {
  const vertices = [...(command.elements.vertices ?? [])];
  const edges = [...(command.elements.edges ?? [])];
  const corners = [...(command.elements.corners ?? [])];
  const faces = [...(command.elements.faces ?? [])];
  if (vertices.length + edges.length + corners.length + faces.length === 0) {
    throw new Error("deleteElements requires at least one element");
  }

  assertExistingIds(vertices, draft.state.vertices, "vertex");
  assertExistingIds(edges, draft.state.edges, "edge");
  assertExistingIds(corners, draft.state.corners, "corner");
  assertExistingIds(faces, draft.state.faces, "face");
  for (const edge of edges) {
    if ((draft.state.edgeFaces.get(edge)?.size ?? 0) === 0) {
      throw new Error("deleteElements does not support deleting an isolated edge");
    }
  }

  const facesToRemove = new Set<number>(faces);
  for (const vertex of vertices) {
    for (const face of draft.incidentFaces(vertex)) {
      facesToRemove.add(face);
    }
  }
  for (const edge of edges) {
    for (const face of draft.adjacentFaces(edge)) {
      facesToRemove.add(face);
    }
  }
  for (const corner of corners) {
    const face = draft.state.corners.get(corner)?.face;
    if (face === undefined) {
      throw new Error(`missing corner ${corner}`);
    }
    facesToRemove.add(face);
  }

  for (const face of [...facesToRemove].sort((a, b) => a - b)) {
    draft.removeFace(face);
  }
  for (const vertex of vertices.sort((a, b) => a - b)) {
    draft.removeVertex(vertex);
  }
}

function applySplitEdge(draft: MeshDraft, command: Extract<MeshCommand, { readonly kind: "splitEdge" }>): void {
  assertSupportedEdgeNeighborhood(draft.state, command.edge, "splitEdge");
  if (!Number.isFinite(command.t)) {
    throw new RangeError("splitEdge t must be finite");
  }
  const tolerance = NUMERIC_TOLERANCE_POLICY.barycentric;
  if (command.t <= tolerance || command.t >= 1 - tolerance) {
    throw new RangeError("splitEdge t must be strictly inside the edge");
  }

  const edge = draft.state.edges.get(command.edge);
  if (!edge) {
    throw new Error(`missing edge ${command.edge}`);
  }
  const [a, b] = edge.vertices;
  const positionA = draft.state.vertices.get(a)?.position;
  const positionB = draft.state.vertices.get(b)?.position;
  if (!positionA || !positionB) {
    throw new Error(`edge ${command.edge} has a missing endpoint`);
  }
  const incidentFaces = draft.adjacentFaces(command.edge);
  const faceCycles = incidentFaces.map((face) => {
    const cycle = draft.faceVertices(face);
    const index = cycleEdgeIndex(cycle, a, b);
    if (index < 0) {
      throw new Error(`edge ${command.edge} is not present in face ${face}`);
    }
    return { face, cycle, index };
  });

  const vertex = draft.createVertex({
    x: positionA.x + (positionB.x - positionA.x) * command.t,
    y: positionA.y + (positionB.y - positionA.y) * command.t,
    z: positionA.z + (positionB.z - positionA.z) * command.t,
  });
  for (const { face, cycle, index } of faceCycles) {
    const next = [...cycle];
    next.splice(index + 1, 0, vertex);
    draft.replaceFace(face, next);
  }
}

function applyCollapseEdge(
  draft: MeshDraft,
  command: Extract<MeshCommand, { readonly kind: "collapseEdge" }>,
): void {
  assertSupportedEdgeNeighborhood(draft.state, command.edge, "collapseEdge");
  const edge = draft.state.edges.get(command.edge);
  if (!edge) {
    throw new Error(`missing edge ${command.edge}`);
  }
  const keep = command.keep ?? edge.vertices[0];
  assertNonNegativeSafeInteger(keep, "collapseEdge keep vertex id");
  if (keep !== edge.vertices[0] && keep !== edge.vertices[1]) {
    throw new Error("collapseEdge keep must be one of the edge endpoints");
  }
  const drop = keep === edge.vertices[0] ? edge.vertices[1] : edge.vertices[0];
  assertManifoldVertexNeighborhood(draft.state, [keep, drop], "collapseEdge");

  const plans = draft.incidentFaces(drop).map((face) => {
    const replaced = draft.faceVertices(face).map((vertex) => (vertex === drop ? keep : vertex));
    const cycle = compactConsecutiveVertices(replaced);
    if (cycle.length >= 3 && new Set(cycle).size !== cycle.length) {
      throw new Error(`collapseEdge would make face ${face} repeat a vertex`);
    }
    return { face, cycle };
  });
  for (const { face, cycle } of plans.filter(({ cycle }) => cycle.length < 3)) {
    void cycle;
    draft.removeFace(face);
  }
  for (const { face, cycle } of plans.filter(({ cycle }) => cycle.length >= 3)) {
    draft.replaceFace(face, cycle);
  }
  draft.removeVertex(drop);
  assertDistinctFaces(draft);
  for (const incident of draft.state.vertexEdges.get(keep) ?? []) {
    if ((draft.state.edgeFaces.get(incident)?.size ?? 0) > 2) {
      throw new Error("collapseEdge would create a non-manifold edge");
    }
  }
}

function mergeFacesAcrossEdge(draft: MeshDraft, edgeId: number): void {
  assertSupportedEdgeNeighborhood(draft.state, edgeId, "dissolveEdges");
  const faces = draft.adjacentFaces(edgeId);
  if (faces.length !== 2) {
    throw new Error("dissolveEdges requires an edge with exactly two incident faces");
  }
  const edge = draft.state.edges.get(edgeId);
  if (!edge) {
    throw new Error(`missing edge ${edgeId}`);
  }
  const firstFace = faces[0];
  const secondFace = faces[1];
  if (firstFace === undefined || secondFace === undefined) {
    throw new Error("dissolveEdges requires two incident faces");
  }
  const first = draft.faceVertices(firstFace);
  const second = draft.faceVertices(secondFace);
  const [a, b] = edge.vertices;
  let firstIndex = directedCycleEdgeIndex(first, a, b);
  let start = a;
  let end = b;
  if (firstIndex < 0) {
    firstIndex = directedCycleEdgeIndex(first, b, a);
    start = b;
    end = a;
  }
  if (firstIndex < 0) {
    throw new Error(`edge ${edgeId} is not present in face ${firstFace}`);
  }
  const secondIndex = directedCycleEdgeIndex(second, end, start);
  if (secondIndex < 0) {
    throw new Error("dissolveEdges requires opposite winding across the shared edge");
  }

  const firstPath = pathOppositeDirectedEdge(first, firstIndex);
  const secondPath = pathOppositeDirectedEdge(second, secondIndex);
  const merged = [...secondPath.slice(0, -1), ...firstPath.slice(0, -1)];
  if (merged.length < 3 || new Set(merged).size !== merged.length) {
    throw new Error("dissolveEdges would create a degenerate face");
  }
  draft.removeFace(secondFace);
  draft.replaceFace(firstFace, merged);
}

function applyDissolveEdges(
  draft: MeshDraft,
  command: Extract<MeshCommand, { readonly kind: "dissolveEdges" }>,
): void {
  if (command.edges.length === 0) {
    throw new Error("dissolveEdges requires at least one edge");
  }
  assertExistingIds(command.edges, draft.state.edges, "edge");
  const originalPairs = command.edges.map((edge) => {
    const vertices = draft.state.edges.get(edge)?.vertices;
    if (!vertices) {
      throw new Error(`missing edge ${edge}`);
    }
    return { edge, pair: edgePairKey(...vertices) };
  });
  for (const original of originalPairs) {
    const currentEdge = draft.state.edges.has(original.edge)
      ? original.edge
      : draft.state.edgeByPair.get(original.pair);
    if (currentEdge === undefined) {
      throw new Error(`dissolveEdges target edge ${original.edge} no longer exists`);
    }
    mergeFacesAcrossEdge(draft, currentEdge);
  }
  assertDistinctFaces(draft);
}

function applyWeldVertices(
  draft: MeshDraft,
  command: Extract<MeshCommand, { readonly kind: "weldVertices" }>,
): void {
  if (command.vertices.length < 2) {
    throw new Error("weldVertices requires at least two vertices");
  }
  assertExistingIds(command.vertices, draft.state.vertices, "vertex");
  assertFinitePosition(command.target, "weldVertices target");
  assertManifoldVertexNeighborhood(draft.state, command.vertices, "weldVertices");

  const selected = new Set(command.vertices);
  const survivor = Math.min(...command.vertices);
  const affectedFaces = new Set<number>();
  for (const vertex of command.vertices) {
    for (const face of draft.incidentFaces(vertex)) {
      affectedFaces.add(face);
    }
  }
  const plans = [...affectedFaces].sort((a, b) => a - b).map((face) => {
    const replaced = draft.faceVertices(face).map((vertex) => (selected.has(vertex) ? survivor : vertex));
    const cycle = compactConsecutiveVertices(replaced);
    if (cycle.length >= 3 && new Set(cycle).size !== cycle.length) {
      throw new Error(`weldVertices would make face ${face} repeat a vertex`);
    }
    return { face, cycle };
  });
  for (const { face } of plans.filter(({ cycle }) => cycle.length < 3)) {
    draft.removeFace(face);
  }
  for (const { face, cycle } of plans.filter(({ cycle }) => cycle.length >= 3)) {
    draft.replaceFace(face, cycle);
  }
  draft.setVertexPosition(survivor, command.target);
  for (const vertex of [...command.vertices].sort((a, b) => a - b)) {
    if (vertex !== survivor) {
      draft.removeVertex(vertex);
    }
  }
  assertDistinctFaces(draft);
  for (const edge of draft.state.vertexEdges.get(survivor) ?? []) {
    if ((draft.state.edgeFaces.get(edge)?.size ?? 0) > 2) {
      throw new Error("weldVertices would create a non-manifold edge");
    }
  }
}

function applyToWorkingDraft(draft: MeshDraft, command: ElementMutationCommand): void {
  switch (command.kind) {
    case "createVertex":
      applyCreateVertex(draft, command);
      return;
    case "setVertexPositions":
      applySetVertexPositions(draft, command);
      return;
    case "deleteElements":
      applyDeleteElements(draft, command);
      return;
    case "splitEdge":
      applySplitEdge(draft, command);
      return;
    case "collapseEdge":
      applyCollapseEdge(draft, command);
      return;
    case "dissolveEdges":
      applyDissolveEdges(draft, command);
      return;
    case "weldVertices":
      applyWeldVertices(draft, command);
      return;
  }
}

function installDraftState(target: MeshState, source: MeshState): void {
  target.version = source.version;
  target.stamp = source.stamp;
  target.vertices = source.vertices;
  target.edges = source.edges;
  target.corners = source.corners;
  target.faces = source.faces;
  target.attributes = source.attributes;
  target.allocators = source.allocators;
  target.edgeByPair = source.edgeByPair;
  target.vertexEdges = source.vertexEdges;
  target.vertexFaces = source.vertexFaces;
  target.edgeFaces = source.edgeFaces;
  target.edgeCorners = source.edgeCorners;
}

function isElementMutation(command: MeshCommand): command is ElementMutationCommand {
  switch (command.kind) {
    case "createVertex":
    case "setVertexPositions":
    case "deleteElements":
    case "splitEdge":
    case "collapseEdge":
    case "dissolveEdges":
    case "weldVertices":
      return true;
    default:
      return false;
  }
}

/** Applies one supported element mutation atomically to the supplied transaction draft. */
export function applyElementMutation(draft: MeshDraft, command: MeshCommand): void {
  if (!isElementMutation(command)) {
    throw new Error(`unsupported element mutation command: ${command.kind}`);
  }
  const working = new MeshDraft(cloneMeshState(draft.state));
  applyToWorkingDraft(working, command);
  assertValidTopology(working.state);
  installDraftState(draft.state, working.state);
}
