import type { MeshGeometry } from "./workspace";

export type ProportionalFalloff = "smooth" | "linear" | "sharp";

export interface ProportionalEditState {
  readonly enabled: boolean;
  readonly radiusRatio: number;
  readonly falloff: ProportionalFalloff;
  readonly connectedOnly: boolean;
}

export type ProportionalEditAction =
  | { readonly type: "toggle-enabled" }
  | { readonly type: "set-radius-ratio"; readonly radiusRatio: number }
  | { readonly type: "set-falloff"; readonly falloff: ProportionalFalloff }
  | { readonly type: "set-connected-only"; readonly connectedOnly: boolean };

export const PROPORTIONAL_RADIUS_MIN = 0.05;
export const PROPORTIONAL_RADIUS_MAX = 2;
export const PROPORTIONAL_RADIUS_STEP = 0.05;

export function createProportionalEditState(): ProportionalEditState {
  return { enabled: false, radiusRatio: 0.25, falloff: "smooth", connectedOnly: false };
}

export function proportionalEditReducer(
  state: ProportionalEditState,
  action: ProportionalEditAction,
): ProportionalEditState {
  if (action.type === "toggle-enabled") return { ...state, enabled: !state.enabled };
  if (action.type === "set-falloff") return { ...state, falloff: action.falloff };
  if (action.type === "set-connected-only") {
    return { ...state, connectedOnly: action.connectedOnly };
  }
  const radiusRatio = Math.round(Math.min(
    PROPORTIONAL_RADIUS_MAX,
    Math.max(PROPORTIONAL_RADIUS_MIN, action.radiusRatio),
  ) * 100) / 100;
  return { ...state, radiusRatio };
}

export function sampleInfluencedVertexIndices(
  weights: readonly number[],
  maximum: number,
): number[] {
  if (!Number.isInteger(maximum) || maximum <= 0) {
    throw new RangeError("표시할 정점 수는 0보다 큰 정수여야 합니다.");
  }
  const influenced = weights.flatMap((weight, index) => (
    Number.isFinite(weight) && weight > 0 ? [index] : []
  ));
  if (influenced.length <= maximum) return influenced;
  if (maximum === 1) return [influenced[0]!];
  return Array.from({ length: maximum }, (_, index) => (
    influenced[Math.round(index * (influenced.length - 1) / (maximum - 1))]!
  ));
}

function calculateTopologyDistances(
  geometry: MeshGeometry,
  selectedVertex: number,
  radius: number,
): Float64Array {
  const vertexCount = geometry.positions.length / 3;
  const adjacency = Array.from({ length: vertexCount }, () => [] as Array<{
    readonly vertex: number;
    readonly length: number;
  }>);
  const addEdge = (from: number, to: number): void => {
    if (!Number.isInteger(from) || !Number.isInteger(to)
      || from < 0 || to < 0 || from >= vertexCount || to >= vertexCount) {
      throw new RangeError("메시 topology index가 정점 범위를 벗어났습니다.");
    }
    const fromOffset = from * 3;
    const toOffset = to * 3;
    const length = Math.hypot(
      geometry.positions[toOffset]! - geometry.positions[fromOffset]!,
      geometry.positions[toOffset + 1]! - geometry.positions[fromOffset + 1]!,
      geometry.positions[toOffset + 2]! - geometry.positions[fromOffset + 2]!,
    );
    adjacency[from]!.push({ vertex: to, length });
    adjacency[to]!.push({ vertex: from, length });
  };
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const a = geometry.indices[offset]!;
    const b = geometry.indices[offset + 1]!;
    const c = geometry.indices[offset + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  type QueueEntry = { readonly vertex: number; readonly distance: number };
  const queue: QueueEntry[] = [];
  const push = (entry: QueueEntry): void => {
    queue.push(entry);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent]!.distance <= entry.distance) break;
      queue[index] = queue[parent]!;
      index = parent;
    }
    queue[index] = entry;
  };
  const pop = (): QueueEntry | undefined => {
    const first = queue[0];
    const last = queue.pop();
    if (!first || !last || queue.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= queue.length) break;
      const right = left + 1;
      const child = right < queue.length && queue[right]!.distance < queue[left]!.distance ? right : left;
      if (queue[child]!.distance >= last.distance) break;
      queue[index] = queue[child]!;
      index = child;
    }
    queue[index] = last;
    return first;
  };

  const distances = new Float64Array(vertexCount);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[selectedVertex] = 0;
  push({ vertex: selectedVertex, distance: 0 });
  for (let current = pop(); current; current = pop()) {
    if (current.distance !== distances[current.vertex]) continue;
    for (const edge of adjacency[current.vertex]!) {
      const distance = current.distance + edge.length;
      if (distance >= radius || distance >= distances[edge.vertex]!) continue;
      distances[edge.vertex] = distance;
      push({ vertex: edge.vertex, distance });
    }
  }
  return distances;
}

export function calculateProportionalWeights(
  geometry: MeshGeometry,
  selectedVertex: number,
  radius: number,
  falloff: ProportionalFalloff,
  connectedOnly: boolean,
): number[] {
  const vertexCount = geometry.positions.length / 3;
  if (!Number.isInteger(selectedVertex) || selectedVertex < 0 || selectedVertex >= vertexCount) {
    throw new RangeError("선택 정점이 메시 범위를 벗어났습니다.");
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("영향 반경은 0보다 큰 유한한 값이어야 합니다.");
  }
  const topologyDistances = connectedOnly
    ? calculateTopologyDistances(geometry, selectedVertex, radius)
    : null;
  const selectedOffset = selectedVertex * 3;
  const selected = [
    geometry.positions[selectedOffset]!,
    geometry.positions[selectedOffset + 1]!,
    geometry.positions[selectedOffset + 2]!,
  ] as const;
  return Array.from({ length: vertexCount }, (_, vertexIndex) => {
    if (vertexIndex === selectedVertex) return 1;
    const offset = vertexIndex * 3;
    const distance = topologyDistances
      ? topologyDistances[vertexIndex]!
      : Math.hypot(
          geometry.positions[offset]! - selected[0],
          geometry.positions[offset + 1]! - selected[1],
          geometry.positions[offset + 2]! - selected[2],
        );
    if (distance >= radius) return 0;
    const normalized = distance / radius;
    if (falloff === "linear") return 1 - normalized;
    if (falloff === "sharp") return (1 - normalized) ** 2;
    return 1 - normalized * normalized * (3 - 2 * normalized);
  });
}
