import type { EdgeId, FaceId, MeshQuery, SelectionChange } from "@octopoly/contracts";

function uniqueIds<Value extends number>(values: ReadonlyArray<Value>): ReadonlyArray<Value> | null {
  const unique = new Set(values);
  return unique.size === values.length ? [...unique] : null;
}

function oppositeEdgeInQuad(
  mesh: MeshQuery,
  faceId: FaceId,
  currentEdgeId: EdgeId,
): EdgeId | null {
  const face = mesh.face(faceId);
  const currentEdge = mesh.edge(currentEdgeId);
  if (face === null || currentEdge === null || face.corners.length !== 4) {
    return null;
  }

  const faceEdges: EdgeId[] = [];
  for (const cornerId of face.corners) {
    const corner = mesh.corner(cornerId);
    if (corner === null || corner.face !== faceId) {
      return null;
    }
    faceEdges.push(corner.edge);
  }

  const uniqueFaceEdges = uniqueIds(faceEdges);
  if (
    uniqueFaceEdges === null ||
    uniqueFaceEdges.length !== 4 ||
    !uniqueFaceEdges.includes(currentEdgeId)
  ) {
    return null;
  }

  const currentVertices = new Set(currentEdge.vertices);
  const candidates = uniqueFaceEdges.filter((edgeId) => {
    if (edgeId === currentEdgeId) {
      return false;
    }
    const edge = mesh.edge(edgeId);
    return edge !== null && edge.vertices.every((vertexId) => !currentVertices.has(vertexId));
  });

  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function nextFaceAcrossEdge(
  mesh: MeshQuery,
  edgeId: EdgeId,
  previousFaceId: FaceId,
): FaceId | null {
  const adjacentFaces = uniqueIds(mesh.adjacentFaces(edgeId));
  if (
    adjacentFaces === null ||
    adjacentFaces.length !== 2 ||
    !adjacentFaces.includes(previousFaceId)
  ) {
    return null;
  }

  return adjacentFaces[0] === previousFaceId
    ? adjacentFaces[1] ?? null
    : adjacentFaces[0] ?? null;
}

function walkDirection(
  mesh: MeshQuery,
  seed: EdgeId,
  firstFace: FaceId,
  selected: Set<EdgeId>,
): void {
  let currentEdge = seed;
  let currentFace: FaceId | null = firstFace;

  while (currentFace !== null) {
    const nextEdge = oppositeEdgeInQuad(mesh, currentFace, currentEdge);
    if (nextEdge === null || selected.has(nextEdge)) {
      return;
    }

    selected.add(nextEdge);
    const nextFace = nextFaceAcrossEdge(mesh, nextEdge, currentFace);
    currentEdge = nextEdge;
    currentFace = nextFace;
  }
}

/** Selects the deterministic topological edge ring containing `seed`. */
export function selectEdgeRing(mesh: MeshQuery, seed: EdgeId): SelectionChange {
  if (mesh.edge(seed) === null) {
    return { edges: new Set<EdgeId>() };
  }

  const selected = new Set<EdgeId>([seed]);
  const seedFaces = uniqueIds(mesh.adjacentFaces(seed));
  if (seedFaces !== null && seedFaces.length <= 2) {
    for (const faceId of seedFaces) {
      walkDirection(mesh, seed, faceId, selected);
    }
  }

  return { edges: new Set([...selected].sort((left, right) => left - right)) };
}
