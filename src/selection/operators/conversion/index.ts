import type {
  EdgeId,
  FaceId,
  MeshQuery,
  SelectionChange,
  SelectionSnapshot,
  VertexId,
} from "@octopoly/contracts";

type SelectionTarget = "vertex" | "edge" | "face";

interface FaceElements {
  readonly complete: boolean;
  readonly edges: ReadonlyArray<EdgeId>;
  readonly vertices: ReadonlyArray<VertexId>;
}

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

function faceElements(mesh: MeshQuery, faceId: FaceId): FaceElements {
  const face = mesh.face(faceId);
  if (face === null) {
    return { complete: false, edges: [], vertices: [] };
  }

  let complete = face.corners.length > 0;
  const edges = new Set<EdgeId>();
  const vertices = new Set<VertexId>();
  for (const cornerId of face.corners) {
    const corner = mesh.corner(cornerId);
    if (corner === null || corner.face !== faceId) {
      complete = false;
      continue;
    }

    if (mesh.edge(corner.edge) === null) {
      complete = false;
    } else {
      edges.add(corner.edge);
    }
    if (mesh.vertex(corner.vertex) === null) {
      complete = false;
    } else {
      vertices.add(corner.vertex);
    }
  }

  return {
    complete,
    edges: [...ascendingSet(edges)],
    vertices: [...ascendingSet(vertices)],
  };
}

function convertToVertices(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange {
  const result = new Set(liveVertices(mesh, selection.vertices));

  for (const edgeId of liveEdges(mesh, selection.edges)) {
    const edge = mesh.edge(edgeId);
    if (edge === null) {
      continue;
    }
    for (const vertexId of edge.vertices) {
      if (mesh.vertex(vertexId) !== null) {
        result.add(vertexId);
      }
    }
  }

  for (const faceId of liveFaces(mesh, selection.faces)) {
    for (const vertexId of faceElements(mesh, faceId).vertices) {
      result.add(vertexId);
    }
  }

  return { vertices: ascendingSet(result) };
}

function convertToEdges(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange {
  const result = new Set(liveEdges(mesh, selection.edges));

  for (const faceId of liveFaces(mesh, selection.faces)) {
    for (const edgeId of faceElements(mesh, faceId).edges) {
      result.add(edgeId);
    }
  }

  const selectedVertices = liveVertices(mesh, selection.vertices);
  if (selectedVertices.size > 0) {
    for (const edgeRecord of mesh.snapshot().edges) {
      const edge = mesh.edge(edgeRecord.id);
      if (
        edge !== null &&
        edge.vertices.every(
          (vertexId) => mesh.vertex(vertexId) !== null && selectedVertices.has(vertexId),
        )
      ) {
        result.add(edge.id);
      }
    }
  }

  return { edges: ascendingSet(result) };
}

function convertToFaces(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange {
  const result = new Set(liveFaces(mesh, selection.faces));
  const selectedVertices = liveVertices(mesh, selection.vertices);
  const selectedEdges = liveEdges(mesh, selection.edges);

  if (selectedVertices.size > 0 || selectedEdges.size > 0) {
    for (const faceRecord of mesh.snapshot().faces) {
      if (mesh.face(faceRecord.id) === null) {
        continue;
      }

      const elements = faceElements(mesh, faceRecord.id);
      if (!elements.complete) {
        continue;
      }

      const allVerticesSelected =
        selectedVertices.size > 0 &&
        elements.vertices.length > 0 &&
        elements.vertices.every((vertexId) => selectedVertices.has(vertexId));
      const allEdgesSelected =
        selectedEdges.size > 0 &&
        elements.edges.length > 0 &&
        elements.edges.every((edgeId) => selectedEdges.has(edgeId));
      if (allVerticesSelected || allEdgesSelected) {
        result.add(faceRecord.id);
      }
    }
  }

  return { faces: ascendingSet(result) };
}

export function convertSelection(
  mesh: MeshQuery,
  selection: SelectionSnapshot,
  target: SelectionTarget,
): SelectionChange {
  switch (target) {
    case "vertex":
      return convertToVertices(mesh, selection);
    case "edge":
      return convertToEdges(mesh, selection);
    case "face":
      return convertToFaces(mesh, selection);
  }
}
