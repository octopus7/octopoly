import type { EdgeId, FaceId, MeshQuery, SelectionChange, VertexId } from "@octopoly/contracts";

function uniqueIds<Value extends number>(values: ReadonlyArray<Value>): ReadonlyArray<Value> | null {
  const unique = new Set(values);
  return unique.size === values.length ? [...unique] : null;
}

function otherEndpoint(
  mesh: MeshQuery,
  edgeId: EdgeId,
  vertexId: VertexId,
): VertexId | null {
  const edge = mesh.edge(edgeId);
  if (edge === null) {
    return null;
  }

  const [first, second] = edge.vertices;
  if (first === vertexId && second !== vertexId) {
    return second;
  }
  if (second === vertexId && first !== vertexId) {
    return first;
  }
  return null;
}

function oppositeEdgeAtVertex(
  mesh: MeshQuery,
  currentEdgeId: EdgeId,
  vertexId: VertexId,
): EdgeId | null {
  if (mesh.vertex(vertexId) === null) {
    return null;
  }

  const incidentEdges = uniqueIds(mesh.incidentEdges(vertexId));
  const incidentFaces = uniqueIds(mesh.incidentFaces(vertexId));
  if (incidentEdges === null || incidentEdges.length !== 4 || !incidentEdges.includes(currentEdgeId)) {
    return null;
  }
  if (incidentFaces === null || incidentFaces.length !== 4) {
    return null;
  }

  const incidentFaceSet = new Set<FaceId>(incidentFaces);
  const faceUseCount = new Map<FaceId, number>();
  const edgeFaces = new Map<EdgeId, ReadonlySet<FaceId>>();

  for (const faceId of incidentFaces) {
    if (mesh.face(faceId) === null) {
      return null;
    }
    faceUseCount.set(faceId, 0);
  }

  for (const edgeId of incidentEdges) {
    if (otherEndpoint(mesh, edgeId, vertexId) === null) {
      return null;
    }

    const adjacentFaces = uniqueIds(mesh.adjacentFaces(edgeId));
    if (adjacentFaces === null || adjacentFaces.length !== 2) {
      return null;
    }

    for (const faceId of adjacentFaces) {
      if (!incidentFaceSet.has(faceId)) {
        return null;
      }
      faceUseCount.set(faceId, (faceUseCount.get(faceId) ?? 0) + 1);
    }
    edgeFaces.set(edgeId, new Set(adjacentFaces));
  }

  if ([...faceUseCount.values()].some((count) => count !== 2)) {
    return null;
  }

  const currentFaces = edgeFaces.get(currentEdgeId);
  if (currentFaces === undefined) {
    return null;
  }

  const candidates = incidentEdges.filter((edgeId) => {
    if (edgeId === currentEdgeId) {
      return false;
    }
    const candidateFaces = edgeFaces.get(edgeId);
    return candidateFaces !== undefined && [...candidateFaces].every((faceId) => !currentFaces.has(faceId));
  });

  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function walkDirection(
  mesh: MeshQuery,
  seed: EdgeId,
  startVertex: VertexId,
  selected: Set<EdgeId>,
): void {
  let currentEdge = seed;
  let currentVertex = startVertex;

  while (true) {
    const nextEdge = oppositeEdgeAtVertex(mesh, currentEdge, currentVertex);
    if (nextEdge === null || selected.has(nextEdge)) {
      return;
    }

    const nextVertex = otherEndpoint(mesh, nextEdge, currentVertex);
    if (nextVertex === null) {
      return;
    }

    selected.add(nextEdge);
    currentEdge = nextEdge;
    currentVertex = nextVertex;
  }
}

/** Selects the deterministic topological edge loop containing `seed`. */
export function selectEdgeLoop(mesh: MeshQuery, seed: EdgeId): SelectionChange {
  const seedEdge = mesh.edge(seed);
  if (seedEdge === null) {
    return { edges: new Set<EdgeId>() };
  }

  const selected = new Set<EdgeId>([seed]);
  const [first, second] = seedEdge.vertices;
  if (first !== second) {
    walkDirection(mesh, seed, first, selected);
    walkDirection(mesh, seed, second, selected);
  }

  return { edges: new Set([...selected].sort((left, right) => left - right)) };
}
