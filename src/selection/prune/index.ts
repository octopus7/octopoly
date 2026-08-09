import type {
  EdgeId,
  FaceId,
  MeshQuery,
  SelectionChange,
  SelectionSnapshot,
  VertexId,
} from "@octopoly/contracts";

function retainLiveIds<T extends VertexId | EdgeId | FaceId>(
  ids: ReadonlySet<T>,
  lookup: (id: T) => unknown | null,
): ReadonlySet<T> {
  const live = new Set<T>();

  for (const id of ids) {
    if (lookup(id) !== null) {
      live.add(id);
    }
  }

  return live;
}

/**
 * Computes a complete replacement change without mutating selection state.
 * All lookups finish before the caller can publish the resulting state.
 */
export function pruneSelection(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange {
  const vertices = retainLiveIds(selection.vertices, (id) => mesh.vertex(id));
  const edges = retainLiveIds(selection.edges, (id) => mesh.edge(id));
  const faces = retainLiveIds(selection.faces, (id) => mesh.face(id));

  return { vertices, edges, faces };
}
