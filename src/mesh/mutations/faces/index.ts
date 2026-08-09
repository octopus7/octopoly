import {
  NUMERIC_TOLERANCE_POLICY,
  assertNonNegativeSafeInteger,
  incrementNonNegativeSafeInteger,
  type MeshCommand,
  type Vec3,
} from "@octopoly/contracts";
import {
  MeshDraft,
  edgePairKey,
  type ElementDomain,
  type MeshState,
} from "../../internal";

interface EdgeChain {
  readonly edges: ReadonlyArray<number>;
  readonly vertices: ReadonlyArray<number>;
  readonly closed: boolean;
  readonly direction: 1 | -1;
}

interface BoundaryEdge {
  readonly edge: number;
  readonly start: number;
  readonly end: number;
}

function assertFiniteVector(vector: Vec3, label: string): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new RangeError(`${label} must contain finite coordinates`);
  }
}

function positionOf(state: MeshState, vertex: number): Vec3 {
  const position = state.vertices.get(vertex)?.position;
  if (!position) {
    throw new Error(`missing vertex ${vertex}`);
  }
  return position;
}

function translated(position: Vec3, offset: Vec3): Vec3 {
  const result = {
    x: position.x + offset.x,
    y: position.y + offset.y,
    z: position.z + offset.z,
  };
  assertFiniteVector(result, "translated position");
  return result;
}

function sceneScale(state: MeshState, extra: ReadonlyArray<Vec3> = []): number {
  const positions = [...state.vertices.values()].map(({ position }) => position).concat(extra);
  if (positions.length === 0) {
    return 1;
  }
  let minX = positions[0]!.x;
  let minY = positions[0]!.y;
  let minZ = positions[0]!.z;
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;
  for (const position of positions) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }
  return Math.max(1, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ));
}

function distanceTolerance(scale: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance,
    NUMERIC_TOLERANCE_POLICY.relativeDistance * scale,
  );
}

function areaTolerance(scale: number): number {
  return Math.max(
    NUMERIC_TOLERANCE_POLICY.absoluteDistance ** 2,
    NUMERIC_TOLERANCE_POLICY.areaScaleFactor * scale ** 2,
  );
}

function assertUsableOffset(state: MeshState, offset: Vec3): void {
  assertFiniteVector(offset, "offset");
  const moved = [...state.vertices.values()].map(({ position }) => translated(position, offset));
  if (Math.hypot(offset.x, offset.y, offset.z) <= distanceTolerance(sceneScale(state, moved))) {
    throw new Error("offset is degenerate");
  }
}

function assertPolygonGeometry(
  state: MeshState,
  positions: ReadonlyArray<Vec3>,
  label: string,
): void {
  if (positions.length < 3) {
    throw new Error(`${label} requires at least three vertices`);
  }
  for (const position of positions) {
    assertFiniteVector(position, `${label} position`);
  }
  const scale = sceneScale(state, positions);
  const distance = distanceTolerance(scale);
  for (let first = 0; first < positions.length; first += 1) {
    for (let second = first + 1; second < positions.length; second += 1) {
      const a = positions[first]!;
      const b = positions[second]!;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= distance) {
        throw new Error(`${label} contains coincident vertices`);
      }
    }
  }

  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index]!;
    const next = positions[(index + 1) % positions.length]!;
    normalX += (current.y - next.y) * (current.z + next.z);
    normalY += (current.z - next.z) * (current.x + next.x);
    normalZ += (current.x - next.x) * (current.y + next.y);
  }
  const area = Math.hypot(normalX, normalY, normalZ) * 0.5;
  if (area <= areaTolerance(scale)) {
    throw new Error(`${label} is degenerate`);
  }
}

function assertVertexIds(state: MeshState, vertices: ReadonlyArray<number>, label: string): void {
  if (vertices.length < 3) {
    throw new Error(`${label} requires at least three vertices`);
  }
  if (new Set(vertices).size !== vertices.length) {
    throw new Error(`${label} vertices must be unique`);
  }
  for (const vertex of vertices) {
    assertNonNegativeSafeInteger(vertex, "vertex id");
    if (!state.vertices.has(vertex)) {
      throw new Error(`missing vertex ${vertex}`);
    }
  }
}

function faceVertices(state: MeshState, faceId: number): ReadonlyArray<number> {
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

function cyclesEquivalent(first: ReadonlyArray<number>, second: ReadonlyArray<number>): boolean {
  if (first.length !== second.length || first.length === 0) {
    return false;
  }
  for (let offset = 0; offset < second.length; offset += 1) {
    if (second[offset] !== first[0]) {
      continue;
    }
    const forward = first.every(
      (vertex, index) => vertex === second[(offset + index) % second.length],
    );
    const reverse = first.every(
      (vertex, index) => vertex === second[(offset - index + second.length) % second.length],
    );
    if (forward || reverse) {
      return true;
    }
  }
  return false;
}

function directedEdgeInFace(
  state: MeshState,
  faceId: number,
  edgeId: number,
): readonly [number, number] {
  const face = state.faces.get(faceId);
  if (!face) {
    throw new Error(`missing face ${faceId}`);
  }
  let result: readonly [number, number] | undefined;
  for (let index = 0; index < face.corners.length; index += 1) {
    const corner = state.corners.get(face.corners[index]!);
    const next = state.corners.get(face.corners[(index + 1) % face.corners.length]!);
    if (!corner || !next) {
      throw new Error(`face ${faceId} has an invalid corner cycle`);
    }
    if (corner.edge === edgeId) {
      if (result) {
        throw new Error(`face ${faceId} repeats edge ${edgeId}`);
      }
      result = [corner.vertex, next.vertex];
    }
  }
  if (!result) {
    throw new Error(`face ${faceId} does not use edge ${edgeId}`);
  }
  return result;
}

function directionAgainst(
  direction: readonly [number, number],
  start: number,
  end: number,
): 1 | -1 {
  if (direction[0] === start && direction[1] === end) {
    return 1;
  }
  if (direction[0] === end && direction[1] === start) {
    return -1;
  }
  throw new Error("edge direction does not match its endpoints");
}

function assertCreateFacePreconditions(state: MeshState, vertices: ReadonlyArray<number>): void {
  assertVertexIds(state, vertices, "face");
  assertPolygonGeometry(state, vertices.map((vertex) => positionOf(state, vertex)), "face");
  for (const face of state.faces.values()) {
    if (cyclesEquivalent(vertices, faceVertices(state, face.id))) {
      throw new Error(`face duplicates existing face ${face.id}`);
    }
  }
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index]!;
    const end = vertices[(index + 1) % vertices.length]!;
    const edge = state.edgeByPair.get(edgePairKey(start, end));
    if (edge === undefined) {
      continue;
    }
    const adjacent = [...(state.edgeFaces.get(edge) ?? [])];
    if (adjacent.length === 1) {
      const direction = directedEdgeInFace(state, adjacent[0]!, edge);
      if (direction[0] === start && direction[1] === end) {
        throw new Error(`face winding conflicts across edge ${edge}`);
      }
    }
  }
}

function stateMap(state: MeshState, domain: ElementDomain): Map<number, unknown> {
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

function assertAllocationCapacity(state: MeshState, domain: ElementDomain, count: number): void {
  let candidate = state.allocators[domain].next;
  const retired = state.allocators[domain].retired;
  const live = stateMap(state, domain);
  for (let allocated = 0; allocated < count; allocated += 1) {
    while (retired.has(candidate) || live.has(candidate)) {
      candidate = incrementNonNegativeSafeInteger(candidate, `${domain} id`);
    }
    candidate = incrementNonNegativeSafeInteger(candidate, `${domain} id`);
  }
}

function missingPolygonEdges(state: MeshState, vertices: ReadonlyArray<number>): number {
  let missing = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    if (!state.edgeByPair.has(edgePairKey(vertices[index]!, vertices[(index + 1) % vertices.length]!))) {
      missing += 1;
    }
  }
  return missing;
}

function applyCreateFace(draft: MeshDraft, vertices: ReadonlyArray<number>): void {
  assertCreateFacePreconditions(draft.state, vertices);
  assertAllocationCapacity(draft.state, "edge", missingPolygonEdges(draft.state, vertices));
  assertAllocationCapacity(draft.state, "corner", vertices.length);
  assertAllocationCapacity(draft.state, "face", 1);
  draft.createFace(vertices);
}

function sharedEndpoint(
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  const shared = first.filter((vertex) => second.includes(vertex));
  if (shared.length !== 1) {
    throw new Error("edge chain contains disconnected or duplicate neighboring edges");
  }
  return shared[0]!;
}

function boundaryChain(state: MeshState, edgeIds: ReadonlyArray<number>, label: string): EdgeChain {
  if (edgeIds.length === 0) {
    throw new Error(`${label} edge chain must not be empty`);
  }
  if (new Set(edgeIds).size !== edgeIds.length) {
    throw new Error(`${label} edge chain must not repeat an edge`);
  }
  const edges = edgeIds.map((edgeId) => {
    assertNonNegativeSafeInteger(edgeId, "edge id");
    const edge = state.edges.get(edgeId);
    if (!edge) {
      throw new Error(`missing edge ${edgeId}`);
    }
    const adjacent = [...(state.edgeFaces.get(edgeId) ?? [])];
    if (adjacent.length !== 1) {
      throw new Error(`edge ${edgeId} must be a manifold boundary edge`);
    }
    return edge;
  });

  let vertices: number[];
  if (edges.length === 1) {
    vertices = [...edges[0]!.vertices];
  } else {
    const shared = sharedEndpoint(edges[0]!.vertices, edges[1]!.vertices);
    const start = edges[0]!.vertices[0] === shared
      ? edges[0]!.vertices[1]
      : edges[0]!.vertices[0];
    vertices = [start, shared];
    for (let index = 1; index < edges.length; index += 1) {
      const edge = edges[index]!;
      const current = vertices[vertices.length - 1]!;
      if (!edge.vertices.includes(current)) {
        throw new Error(`${label} edges are not an ordered connected chain`);
      }
      const next = edge.vertices[0] === current ? edge.vertices[1] : edge.vertices[0];
      if (next === vertices[0] && index !== edges.length - 1) {
        throw new Error(`${label} edge chain closes before its final edge`);
      }
      vertices.push(next);
    }
  }

  const closed = vertices.length > 2 && vertices[vertices.length - 1] === vertices[0];
  if (closed) {
    vertices.pop();
  }
  const expectedVertexCount = closed ? edges.length : edges.length + 1;
  if (vertices.length !== expectedVertexCount || new Set(vertices).size !== vertices.length) {
    throw new Error(`${label} edge chain repeats a vertex`);
  }
  if (closed && edges.length < 3) {
    throw new Error(`${label} closed edge chain requires at least three edges`);
  }

  let direction: 1 | -1 | undefined;
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index]!;
    const start = vertices[index]!;
    const end = vertices[(index + 1) % vertices.length]!;
    if (edgePairKey(start, end) !== edgePairKey(...edge.vertices)) {
      throw new Error(`${label} edge order is incompatible with its vertex chain`);
    }
    const adjacentFace = [...state.edgeFaces.get(edge.id)!][0]!;
    const current = directionAgainst(directedEdgeInFace(state, adjacentFace, edge.id), start, end);
    if (direction !== undefined && current !== direction) {
      throw new Error(`${label} boundary winding is inconsistent`);
    }
    direction = current;
  }

  return {
    edges: [...edgeIds],
    vertices,
    closed,
    direction: direction!,
  };
}

function bridgeFaces(
  first: EdgeChain,
  secondVertices: ReadonlyArray<number>,
  secondDirection: 1 | -1,
): ReadonlyArray<ReadonlyArray<number>> {
  const result: number[][] = [];
  for (let index = 0; index < first.edges.length; index += 1) {
    const firstStart = first.vertices[index]!;
    const firstEnd = first.vertices[(index + 1) % first.vertices.length]!;
    const secondStart = secondVertices[index]!;
    const secondEnd = secondVertices[(index + 1) % secondVertices.length]!;
    if (first.direction === 1 && secondDirection === -1) {
      result.push([firstEnd, firstStart, secondStart, secondEnd]);
    } else if (first.direction === -1 && secondDirection === 1) {
      result.push([firstStart, firstEnd, secondEnd, secondStart]);
    } else {
      throw new Error("bridge chains have incompatible boundary winding");
    }
  }
  return result;
}

function applyBridgeEdges(
  draft: MeshDraft,
  firstIds: ReadonlyArray<number>,
  secondIds: ReadonlyArray<number>,
): void {
  const first = boundaryChain(draft.state, firstIds, "first bridge");
  const second = boundaryChain(draft.state, secondIds, "second bridge");
  if (first.edges.length !== second.edges.length || first.closed !== second.closed) {
    throw new Error("bridge chains must have matching edge counts and closure");
  }
  if (first.vertices.some((vertex) => second.vertices.includes(vertex))) {
    throw new Error("bridge chains must not share vertices");
  }

  let secondVertices = [...second.vertices];
  let secondDirection = second.direction;
  if (first.edges.length === 1 && first.direction === secondDirection) {
    secondVertices.reverse();
    secondDirection = secondDirection === 1 ? -1 : 1;
  }
  const faces = bridgeFaces(first, secondVertices, secondDirection);
  const rails = new Set<string>();
  for (let index = 0; index < first.vertices.length; index += 1) {
    const key = edgePairKey(first.vertices[index]!, secondVertices[index]!);
    if (draft.state.edgeByPair.has(key)) {
      throw new Error(`bridge rail ${key} already exists`);
    }
    rails.add(key);
  }
  if (rails.size !== first.vertices.length) {
    throw new Error("bridge would create duplicate rail edges");
  }
  for (const [index, face] of faces.entries()) {
    assertPolygonGeometry(
      draft.state,
      face.map((vertex) => positionOf(draft.state, vertex)),
      `bridge face ${index}`,
    );
  }

  assertAllocationCapacity(draft.state, "edge", rails.size);
  assertAllocationCapacity(draft.state, "corner", faces.length * 4);
  assertAllocationCapacity(draft.state, "face", faces.length);
  for (const face of faces) {
    draft.createFace(face);
  }
}

function applyRotateDiagonal(draft: MeshDraft, edgeId: number): void {
  assertNonNegativeSafeInteger(edgeId, "edge id");
  const edge = draft.state.edges.get(edgeId);
  if (!edge) {
    throw new Error(`missing edge ${edgeId}`);
  }
  const adjacent = draft.adjacentFaces(edgeId);
  if (adjacent.length !== 2) {
    throw new Error(`edge ${edgeId} must have exactly two adjacent faces`);
  }
  const firstVertices = faceVertices(draft.state, adjacent[0]!);
  const secondVertices = faceVertices(draft.state, adjacent[1]!);
  if (firstVertices.length !== 3 || secondVertices.length !== 3) {
    throw new Error("diagonal rotation requires two triangles");
  }
  const firstDirection = directedEdgeInFace(draft.state, adjacent[0]!, edgeId);
  const secondDirection = directedEdgeInFace(draft.state, adjacent[1]!, edgeId);
  if (firstDirection[0] !== secondDirection[1] || firstDirection[1] !== secondDirection[0]) {
    throw new Error("diagonal faces have incompatible winding");
  }
  const [start, end] = firstDirection;
  const firstOpposite = firstVertices.find((vertex) => vertex !== start && vertex !== end);
  const secondOpposite = secondVertices.find((vertex) => vertex !== start && vertex !== end);
  if (firstOpposite === undefined || secondOpposite === undefined || firstOpposite === secondOpposite) {
    throw new Error("diagonal rotation would be degenerate");
  }
  const replacementKey = edgePairKey(firstOpposite, secondOpposite);
  if (draft.state.edgeByPair.has(replacementKey)) {
    throw new Error(`rotated diagonal ${replacementKey} already exists`);
  }
  const firstReplacement = [firstOpposite, start, secondOpposite];
  const secondReplacement = [firstOpposite, secondOpposite, end];
  assertPolygonGeometry(
    draft.state,
    firstReplacement.map((vertex) => positionOf(draft.state, vertex)),
    "first rotated face",
  );
  assertPolygonGeometry(
    draft.state,
    secondReplacement.map((vertex) => positionOf(draft.state, vertex)),
    "second rotated face",
  );
  const firstOuterStart = draft.state.edgeByPair.get(edgePairKey(firstOpposite, start))!;
  const firstOuterEnd = draft.state.edgeByPair.get(edgePairKey(end, firstOpposite))!;
  const secondOuterEnd = draft.state.edgeByPair.get(edgePairKey(secondOpposite, end))!;
  const recreatedOuterEdges = [firstOuterStart, firstOuterEnd, secondOuterEnd].filter(
    (outerEdge) => (draft.state.edgeFaces.get(outerEdge)?.size ?? 0) === 1,
  ).length;
  assertAllocationCapacity(draft.state, "edge", 1 + recreatedOuterEdges);
  assertAllocationCapacity(draft.state, "corner", 6);

  draft.replaceFace(adjacent[0]!, firstReplacement);
  draft.replaceFace(adjacent[1]!, secondReplacement);
}

function applyExtrudeEdges(draft: MeshDraft, edgeIds: ReadonlyArray<number>, offset: Vec3): void {
  assertUsableOffset(draft.state, offset);
  const chain = boundaryChain(draft.state, edgeIds, "extrude");
  const moved = chain.vertices.map((vertex) => translated(positionOf(draft.state, vertex), offset));
  const sidePositions: Vec3[][] = [];
  for (let index = 0; index < chain.edges.length; index += 1) {
    const current = positionOf(draft.state, chain.vertices[index]!);
    const next = positionOf(draft.state, chain.vertices[(index + 1) % chain.vertices.length]!);
    const movedCurrent = moved[index]!;
    const movedNext = moved[(index + 1) % moved.length]!;
    sidePositions.push(
      chain.direction === 1
        ? [next, current, movedCurrent, movedNext]
        : [current, next, movedNext, movedCurrent],
    );
  }
  for (const [index, positions] of sidePositions.entries()) {
    assertPolygonGeometry(draft.state, positions, `extruded edge face ${index}`);
  }

  assertAllocationCapacity(draft.state, "vertex", chain.vertices.length);
  assertAllocationCapacity(draft.state, "edge", chain.edges.length + chain.vertices.length);
  assertAllocationCapacity(draft.state, "corner", chain.edges.length * 4);
  assertAllocationCapacity(draft.state, "face", chain.edges.length);

  const movedVertices = chain.vertices.map((_, index) => draft.createVertex(moved[index]!));
  for (let index = 0; index < chain.edges.length; index += 1) {
    const current = chain.vertices[index]!;
    const next = chain.vertices[(index + 1) % chain.vertices.length]!;
    const movedCurrent = movedVertices[index]!;
    const movedNext = movedVertices[(index + 1) % movedVertices.length]!;
    draft.createFace(
      chain.direction === 1
        ? [next, current, movedCurrent, movedNext]
        : [current, next, movedNext, movedCurrent],
    );
  }
}

function applyExtrudeFaces(draft: MeshDraft, faceIds: ReadonlyArray<number>, offset: Vec3): void {
  assertUsableOffset(draft.state, offset);
  if (faceIds.length === 0) {
    throw new Error("face extrusion must not be empty");
  }
  if (new Set(faceIds).size !== faceIds.length) {
    throw new Error("face extrusion must not repeat a face");
  }
  for (const face of faceIds) {
    assertNonNegativeSafeInteger(face, "face id");
    if (!draft.state.faces.has(face)) {
      throw new Error(`missing face ${face}`);
    }
  }

  const selected = new Set(faceIds);
  const selectedVertices = new Set<number>();
  const selectedEdges = new Set<number>();
  const boundaries: BoundaryEdge[] = [];
  let replacementCornerCount = 0;
  for (const face of [...faceIds].sort((a, b) => a - b)) {
    const vertices = faceVertices(draft.state, face);
    replacementCornerCount += vertices.length;
    vertices.forEach((vertex) => selectedVertices.add(vertex));
    assertPolygonGeometry(
      draft.state,
      vertices.map((vertex) => positionOf(draft.state, vertex)),
      `face ${face}`,
    );
    const faceRecord = draft.state.faces.get(face)!;
    for (const cornerId of faceRecord.corners) {
      const corner = draft.state.corners.get(cornerId)!;
      const edge = corner.edge;
      selectedEdges.add(edge);
      const adjacent = [...(draft.state.edgeFaces.get(edge) ?? [])].sort((a, b) => a - b);
      if (adjacent.length > 2) {
        throw new Error(`face extrusion does not support non-manifold edge ${edge}`);
      }
      if (adjacent.length === 2) {
        const firstDirection = directedEdgeInFace(draft.state, adjacent[0]!, edge);
        const secondDirection = directedEdgeInFace(draft.state, adjacent[1]!, edge);
        if (firstDirection[0] !== secondDirection[1] || firstDirection[1] !== secondDirection[0]) {
          throw new Error(`edge ${edge} has incompatible face winding`);
        }
      }
      const selectedAdjacent = adjacent.filter((candidate) => selected.has(candidate));
      if (selectedAdjacent.length === 1 && selectedAdjacent[0] === face) {
        const [start, end] = directedEdgeInFace(draft.state, face, edge);
        boundaries.push({ edge, start, end });
      }
    }
  }

  const uniqueBoundaries = new Map(boundaries.map((boundary) => [boundary.edge, boundary]));
  const orderedBoundaries = [...uniqueBoundaries.values()].sort((a, b) => a.edge - b.edge);
  const boundaryDegree = new Map<number, number>();
  for (const boundary of orderedBoundaries) {
    boundaryDegree.set(boundary.start, (boundaryDegree.get(boundary.start) ?? 0) + 1);
    boundaryDegree.set(boundary.end, (boundaryDegree.get(boundary.end) ?? 0) + 1);
  }
  for (const [vertex, degree] of boundaryDegree) {
    if (degree !== 2) {
      throw new Error(`face extrusion boundary is non-manifold at vertex ${vertex}`);
    }
  }

  const orderedVertices = [...selectedVertices].sort((a, b) => a - b);
  const movedPositions = new Map(
    orderedVertices.map((vertex) => [vertex, translated(positionOf(draft.state, vertex), offset)]),
  );
  for (const boundary of orderedBoundaries) {
    assertPolygonGeometry(
      draft.state,
      [
        positionOf(draft.state, boundary.start),
        positionOf(draft.state, boundary.end),
        movedPositions.get(boundary.end)!,
        movedPositions.get(boundary.start)!,
      ],
      `extruded face side ${boundary.edge}`,
    );
  }
  for (const face of faceIds) {
    assertPolygonGeometry(
      draft.state,
      faceVertices(draft.state, face).map((vertex) => movedPositions.get(vertex)!),
      `extruded top face ${face}`,
    );
  }

  const railCount = boundaryDegree.size;
  assertAllocationCapacity(draft.state, "vertex", orderedVertices.length);
  assertAllocationCapacity(draft.state, "edge", selectedEdges.size + railCount);
  assertAllocationCapacity(
    draft.state,
    "corner",
    orderedBoundaries.length * 4 + replacementCornerCount,
  );
  assertAllocationCapacity(draft.state, "face", orderedBoundaries.length);

  const movedVertices = new Map<number, number>();
  for (const vertex of orderedVertices) {
    movedVertices.set(vertex, draft.createVertex(movedPositions.get(vertex)!));
  }
  for (const boundary of orderedBoundaries) {
    draft.createFace([
      boundary.start,
      boundary.end,
      movedVertices.get(boundary.end)!,
      movedVertices.get(boundary.start)!,
    ]);
  }
  for (const face of [...faceIds].sort((a, b) => a - b)) {
    draft.replaceFace(
      face,
      faceVertices(draft.state, face).map((vertex) => movedVertices.get(vertex)!),
    );
  }
}

export function applyFaceMutation(draft: MeshDraft, command: MeshCommand): void {
  switch (command.kind) {
    case "createFace":
      applyCreateFace(draft, command.vertices);
      return;
    case "bridgeEdges":
      applyBridgeEdges(draft, command.first, command.second);
      return;
    case "rotateDiagonal":
      applyRotateDiagonal(draft, command.edge);
      return;
    case "extrudeEdges":
      applyExtrudeEdges(draft, command.edges, command.offset);
      return;
    case "extrudeFaces":
      applyExtrudeFaces(draft, command.faces, command.offset);
      return;
    default:
      throw new Error(`unsupported face mutation command: ${command.kind}`);
  }
}
