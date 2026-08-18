export type VertexMovementMode = "gizmo" | "view-plane" | "constrained-plane";
export type WorldPlane = "xy" | "yz" | "xz";

export interface VertexMovementModeState {
  readonly mode: VertexMovementMode;
  readonly enabledConstrainedPlanes: readonly WorldPlane[];
  readonly activeConstrainedPlane: WorldPlane;
  readonly constrainedPlaneScreenSpace: boolean;
}

export type VertexMovementModeAction =
  | {
      readonly type: "set-mode";
      readonly mode: VertexMovementMode;
    }
  | {
      readonly type: "set-constrained-plane-enabled";
      readonly plane: WorldPlane;
      readonly enabled: boolean;
    }
  | {
      readonly type: "select-constrained-plane";
      readonly plane: WorldPlane;
    }
  | {
      readonly type: "set-constrained-plane-screen-space";
      readonly enabled: boolean;
    };

export const WORLD_PLANES: readonly WorldPlane[] = ["xy", "yz", "xz"];

export function isVertexMovementModeState(value: unknown): value is VertexMovementModeState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== 4
    || !["mode", "enabledConstrainedPlanes", "activeConstrainedPlane", "constrainedPlaneScreenSpace"]
      .every((key) => Object.hasOwn(candidate, key))) return false;
  if (candidate.mode !== "gizmo"
    && candidate.mode !== "view-plane"
    && candidate.mode !== "constrained-plane") return false;
  if (!Array.isArray(candidate.enabledConstrainedPlanes)
    || candidate.enabledConstrainedPlanes.length === 0
    || candidate.enabledConstrainedPlanes.length > WORLD_PLANES.length) return false;
  const enabled = candidate.enabledConstrainedPlanes;
  if (new Set(enabled).size !== enabled.length
    || enabled.some((plane) => !WORLD_PLANES.includes(plane as WorldPlane))) return false;
  if (!WORLD_PLANES.includes(candidate.activeConstrainedPlane as WorldPlane)
    || !enabled.includes(candidate.activeConstrainedPlane)) return false;
  return typeof candidate.constrainedPlaneScreenSpace === "boolean";
}

export function createVertexMovementModeState(): VertexMovementModeState {
  return {
    mode: "gizmo",
    enabledConstrainedPlanes: [...WORLD_PLANES],
    activeConstrainedPlane: "xy",
    constrainedPlaneScreenSpace: false,
  };
}

export function vertexMovementModeReducer(
  state: VertexMovementModeState,
  action: VertexMovementModeAction,
): VertexMovementModeState {
  if (action.type === "set-mode") {
    return { ...state, mode: action.mode };
  }
  if (action.type === "select-constrained-plane") {
    return state.enabledConstrainedPlanes.includes(action.plane)
      ? { ...state, activeConstrainedPlane: action.plane }
      : state;
  }
  if (action.type === "set-constrained-plane-screen-space") {
    return action.enabled === state.constrainedPlaneScreenSpace
      ? state
      : { ...state, constrainedPlaneScreenSpace: action.enabled };
  }

  const isEnabled = state.enabledConstrainedPlanes.includes(action.plane);
  if (action.enabled === isEnabled) return state;
  if (!action.enabled && state.enabledConstrainedPlanes.length === 1) return state;

  const enabledConstrainedPlanes = action.enabled
    ? WORLD_PLANES.filter((plane) => (
        plane === action.plane || state.enabledConstrainedPlanes.includes(plane)
      ))
    : state.enabledConstrainedPlanes.filter((plane) => plane !== action.plane);

  const activeConstrainedPlane = action.plane === state.activeConstrainedPlane && !action.enabled
    ? (enabledConstrainedPlanes[0] ?? state.activeConstrainedPlane)
    : state.activeConstrainedPlane;

  return { ...state, enabledConstrainedPlanes, activeConstrainedPlane };
}

export function getConstrainedPlaneSelectorPlanes(
  state: VertexMovementModeState,
): readonly WorldPlane[] {
  return state.enabledConstrainedPlanes.length === 1
    ? []
    : state.enabledConstrainedPlanes;
}
