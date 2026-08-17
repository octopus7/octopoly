import { describe, expect, it } from "vitest";

import {
  createVertexMovementModeState,
  getConstrainedPlaneSelectorPlanes,
  vertexMovementModeReducer,
} from "../src/facial/movement-mode";

describe("vertex movement mode state", () => {
  it("defaults to gizmo movement with every world plane enabled", () => {
    const state = createVertexMovementModeState();

    expect(state).toEqual({
      mode: "gizmo",
      enabledConstrainedPlanes: ["xy", "yz", "xz"],
      activeConstrainedPlane: "xy",
      constrainedPlaneScreenSpace: false,
    });
    expect(getConstrainedPlaneSelectorPlanes(state)).toEqual(["xy", "yz", "xz"]);
  });

  it("changes among all movement modes without disturbing constrained-plane state", () => {
    const initial = createVertexMovementModeState();
    const viewPlane = vertexMovementModeReducer(initial, {
      type: "set-mode",
      mode: "view-plane",
    });
    const constrainedPlane = vertexMovementModeReducer(viewPlane, {
      type: "set-mode",
      mode: "constrained-plane",
    });
    const gizmo = vertexMovementModeReducer(constrainedPlane, {
      type: "set-mode",
      mode: "gizmo",
    });

    expect(viewPlane).toEqual({ ...initial, mode: "view-plane" });
    expect(constrainedPlane).toEqual({ ...initial, mode: "constrained-plane" });
    expect(gizmo).toEqual(initial);
  });

  it("toggles screen-space presentation without changing the active world plane", () => {
    const initial = createVertexMovementModeState();

    const enabled = vertexMovementModeReducer(initial, {
      type: "set-constrained-plane-screen-space",
      enabled: true,
    });
    const disabled = vertexMovementModeReducer(enabled, {
      type: "set-constrained-plane-screen-space",
      enabled: false,
    });

    expect(enabled).toEqual({
      ...initial,
      constrainedPlaneScreenSpace: true,
    });
    expect(enabled.activeConstrainedPlane).toBe("xy");
    expect(disabled).toEqual(initial);
  });

  it("configures constrained planes while retaining at least one enabled", () => {
    const initial = createVertexMovementModeState();
    const twoEnabled = vertexMovementModeReducer(initial, {
      type: "set-constrained-plane-enabled",
      plane: "xz",
      enabled: false,
    });
    const oneEnabled = vertexMovementModeReducer(twoEnabled, {
      type: "set-constrained-plane-enabled",
      plane: "yz",
      enabled: false,
    });
    const cannotDisableLast = vertexMovementModeReducer(oneEnabled, {
      type: "set-constrained-plane-enabled",
      plane: "xy",
      enabled: false,
    });

    expect(twoEnabled.enabledConstrainedPlanes).toEqual(["xy", "yz"]);
    expect(getConstrainedPlaneSelectorPlanes(twoEnabled)).toEqual(["xy", "yz"]);
    expect(oneEnabled.enabledConstrainedPlanes).toEqual(["xy"]);
    expect(getConstrainedPlaneSelectorPlanes(oneEnabled)).toEqual([]);
    expect(cannotDisableLast).toBe(oneEnabled);
  });

  it("selects the first remaining plane when the active plane is disabled", () => {
    const next = vertexMovementModeReducer(createVertexMovementModeState(), {
      type: "set-constrained-plane-enabled",
      plane: "xy",
      enabled: false,
    });

    expect(next.enabledConstrainedPlanes).toEqual(["yz", "xz"]);
    expect(next.activeConstrainedPlane).toBe("yz");
    expect(next.enabledConstrainedPlanes).toContain(next.activeConstrainedPlane);
  });

  it("selects only enabled constrained planes and keeps the sole plane active", () => {
    const selectedXz = vertexMovementModeReducer(createVertexMovementModeState(), {
      type: "select-constrained-plane",
      plane: "xz",
    });
    const withoutXy = vertexMovementModeReducer(selectedXz, {
      type: "set-constrained-plane-enabled",
      plane: "xy",
      enabled: false,
    });
    const xzOnly = vertexMovementModeReducer(withoutXy, {
      type: "set-constrained-plane-enabled",
      plane: "yz",
      enabled: false,
    });
    const disabledSelection = vertexMovementModeReducer(xzOnly, {
      type: "select-constrained-plane",
      plane: "yz",
    });

    expect(selectedXz.activeConstrainedPlane).toBe("xz");
    expect(xzOnly.enabledConstrainedPlanes).toEqual(["xz"]);
    expect(xzOnly.activeConstrainedPlane).toBe("xz");
    expect(getConstrainedPlaneSelectorPlanes(xzOnly)).toEqual([]);
    expect(disabledSelection).toBe(xzOnly);
  });

  it("re-enables planes in world-plane order and expands selector buttons", () => {
    const initial = createVertexMovementModeState();
    const withoutYz = vertexMovementModeReducer(initial, {
      type: "set-constrained-plane-enabled",
      plane: "yz",
      enabled: false,
    });
    const xyOnly = vertexMovementModeReducer(withoutYz, {
      type: "set-constrained-plane-enabled",
      plane: "xz",
      enabled: false,
    });
    const twoEnabled = vertexMovementModeReducer(xyOnly, {
      type: "set-constrained-plane-enabled",
      plane: "xz",
      enabled: true,
    });
    const allEnabled = vertexMovementModeReducer(twoEnabled, {
      type: "set-constrained-plane-enabled",
      plane: "yz",
      enabled: true,
    });

    expect(getConstrainedPlaneSelectorPlanes(twoEnabled)).toEqual(["xy", "xz"]);
    expect(allEnabled.enabledConstrainedPlanes).toEqual(["xy", "yz", "xz"]);
    expect(getConstrainedPlaneSelectorPlanes(allEnabled)).toEqual(["xy", "yz", "xz"]);
  });
});
