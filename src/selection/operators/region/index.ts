import type {
  EdgeId,
  FaceId,
  MeshQuery,
  SelectionChange,
  SelectionSnapshot,
  VertexId,
} from "@octopoly/contracts";

function ascendingSet<Id extends number>(ids: Iterable<Id>): ReadonlySet<Id> {
  return new Set([...new Set(ids)].sort((left, right) => left - right));
}

function liveVertices(mesh: MeshQuery, ids: ReadonlySet<VertexId>): ReadonlySet<VertexId> {
  return ascendingSet([...ids].filter((id) => mesh.vertex(id) !== null));
}

function liveEdges(mesh: MeshQuery, ids: ReadonlySet<EdgeId>): ReadonlySet<EdgeId> {
  return ascendingSet([...ids].filter((id) => mesh.edge(id) !== null));
}

function liveFaces(mesh: MeshQuery, ids: ReadonlySet<FaceId>): ReadonlySet<FaceId> {
  return ascendingSet([...ids].filter((id) => mesh.face(id) !== null));
}

function faceEdges(mesh: MeshQuery, faceId: FaceId): ReadonlyArray<EdgeId> {
  const face = mesh.face(faceId);
  if (face === null) {
    return [];
  }

  const edges = new Set<EdgeId>();
  for (const cornerId of face.corners) {
    const corner = mesh.corner(cornerId);
    if (corner !== null && corner.face === faceId && mesh.edge(corner.edge) !== null) {
      edges.add(corner.edge);
    }
  }
  return [...ascendingSet(edges)];
}

function vertexNeighbors(mesh: MeshQuery, vertexId: VertexId): ReadonlyArray<VertexId> {
  if (mesh.vertex(vertexId) === null) {
    return [];
  }

  const neighbors = new Set<VertexId>();
  for (const edgeId of mesh.incidentEdges(vertexId)) {
    const edge = mesh.edge(edgeId);
    if (edge === null || !edge.vertices.includes(vertexId)) {
      continue;
    }
    for (const candidate of edge.vertices) {
      if (candidate !== vertexId && mesh.vertex(candidate) !== null) {
        neighbors.add(candidate);
      }
    }
  }
  return [...ascendingSet(neighbors)];
}

function edgeNeighbors(mesh: MeshQuery, edgeId: EdgeId): ReadonlyArray<EdgeId> {
  const edge = mesh.edge(edgeId);
  if (edge === null) {
    return [];
  }

  const neighbors = new Set<EdgeId>();
  for (const vertexId of edge.vertices) {
    if (mesh.vertex(vertexId) === null) {
      continue;
    }
    for (const candidate of mesh.incidentEdges(vertexId)) {
      if (candidate !== edgeId && mesh.edge(candidate) !== null) {
        neighbors.add(candidate);
      }
    }
  }
  return [...ascendingSet(neighbors)];
}

function faceNeighbors(mesh: MeshQuery, faceId: FaceId): ReadonlyArray<FaceId> {
  if (mesh.face(faceId) === null) {
    return [];
  }

  const neighbors = new Set<FaceId>();
  for (const edgeId of faceEdges(mesh, faceId)) {
    for (const candidate of mesh.adjacentFaces(edgeId)) {
      if (candidate !== faceId && mesh.face(candidate) !== null) {
        neighbors.add(candidate);
      }
    }
  }
  return [...ascendingSet(neighbors)];
}

function growDomain<Id extends number>(
  selected: ReadonlySet<Id>,
  neighbors: (id: Id) => ReadonlyArray<Id>,
): ReadonlySet<Id> {
  const result = new Set(selected);
  for (const id of selected) {
    for (const neighbor of neighbors(id)) {
      result.add(neighbor);
    }
  }
  return ascendingSet(result);
}

function shrinkDomain<Id extends number>(
  selected: ReadonlySet<Id>,
  neighbors: (id: Id) => ReadonlyArray<Id>,
): ReadonlySet<Id> {
  const result = new Set<Id>();
  for (const id of selected) {
    const touchesUnselectedNeighbor = neighbors(id).some((neighbor) => !selected.has(neighbor));
    if (!touchesUnselectedNeighbor) {
      result.add(id);
    }
  }
  return ascendingSet(result);
}

function connectedDomain<Id extends number>(
  selected: ReadonlySet<Id>,
  neighbors: (id: Id) => ReadonlyArray<Id>,
): ReadonlySet<Id> {
  const visited = new Set<Id>();

  for (const seed of selected) {
    if (visited.has(seed)) {
      continue;
    }

    const queue: Id[] = [seed];
    visited.add(seed);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        continue;
      }
      for (const neighbor of neighbors(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return ascendingSet(visited);
}

export function selectAll(mesh: MeshQuery): SelectionChange {
  const snapshot = mesh.snapshot();
  return {
    vertices: ascendingSet(
      snapshot.vertices.filter((vertex) => mesh.vertex(vertex.id) !== null).map((vertex) => vertex.id),
    ),
    edges: ascendingSet(
      snapshot.edges.filter((edge) => mesh.edge(edge.id) !== null).map((edge) => edge.id),
    ),
    faces: ascendingSet(
      snapshot.faces.filter((face) => mesh.face(face.id) !== null).map((face) => face.id),
    ),
  };
}

export function growSelection(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange {
  const vertices = liveVertices(mesh, selection.vertices);
  const edges = liveEdges(mesh, selection.edges);
  const faces = liveFaces(mesh, selection.faces);

  return {
    vertices: growDomain(vertices, (id) => vertexNeighbors(mesh, id)),
    edges: growDomain(edges, (id) => edgeNeighbors(mesh, id)),
    faces: growDomain(faces, (id) => faceNeighbors(mesh, id)),
  };
}

export function shrinkSelection(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange {
  const vertices = liveVertices(mesh, selection.vertices);
  const edges = liveEdges(mesh, selection.edges);
  const faces = liveFaces(mesh, selection.faces);

  return {
    vertices: shrinkDomain(vertices, (id) => vertexNeighbors(mesh, id)),
    edges: shrinkDomain(edges, (id) => edgeNeighbors(mesh, id)),
    faces: shrinkDomain(faces, (id) => faceNeighbors(mesh, id)),
  };
}

export function connectedSelection(
  mesh: MeshQuery,
  selection: SelectionSnapshot,
): SelectionChange {
  const vertices = liveVertices(mesh, selection.vertices);
  const edges = liveEdges(mesh, selection.edges);
  const faces = liveFaces(mesh, selection.faces);

  return {
    vertices: connectedDomain(vertices, (id) => vertexNeighbors(mesh, id)),
    edges: connectedDomain(edges, (id) => edgeNeighbors(mesh, id)),
    faces: connectedDomain(faces, (id) => faceNeighbors(mesh, id)),
  };
}
