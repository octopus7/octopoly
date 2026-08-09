import { describe, expect, it } from "vitest";

import type { ViewportSnapshot } from "@octopoly/contracts";
import { createPerspectiveCameraSnapshot, OrbitCameraController } from "../../src/camera";
import { createPickingService } from "../../src/picking";

const viewport: ViewportSnapshot = Object.freeze({ cssWidth: 200, cssHeight: 200, devicePixelRatio: 2 });

describe("perspective camera", () => {
  it("creates a deeply immutable snapshot with -Z view-space forward", () => {
    const snapshot = createPerspectiveCameraSnapshot(
      { x: 0, y: 0, z: 5 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      Math.PI / 2,
      0.1,
      100,
      viewport,
    );
    const ray = createPickingService().rayFromScreen({ x: 100, y: 100 }, snapshot, viewport);

    expect(ray.origin).toEqual({ x: 0, y: 0, z: 5 });
    expect(ray.direction.x).toBeCloseTo(0, 12);
    expect(ray.direction.y).toBeCloseTo(0, 12);
    expect(ray.direction.z).toBeCloseTo(-1, 12);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.view.elements)).toBe(true);
    expect(Object.isFrozen(snapshot.position)).toBe(true);
  });

  it("orbits, pans, and zooms without mutating earlier snapshots", () => {
    const controller = new OrbitCameraController({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 });
    const before = controller.snapshot(viewport);
    controller.orbit(Math.PI / 2, 0);
    expect(controller.position().x).toBeCloseTo(5, 12);
    expect(controller.position().z).toBeCloseTo(0, 12);
    controller.pan({ x: 10, y: -5 }, viewport);
    const distanceBeforeZoom = Math.hypot(
      controller.position().x - controller.target().x,
      controller.position().y - controller.target().y,
      controller.position().z - controller.target().z,
    );
    controller.zoom(0.5);
    const distanceAfterZoom = Math.hypot(
      controller.position().x - controller.target().x,
      controller.position().y - controller.target().y,
      controller.position().z - controller.target().z,
    );

    expect(distanceAfterZoom).toBeCloseTo(distanceBeforeZoom / 2, 12);
    expect(before.position).toEqual({ x: 0, y: 0, z: 5 });
  });
});
