import { describe, expect, it } from "vitest";

import { OrbitCamera } from "../src/viewport/camera";

describe("OrbitCamera", () => {
  it("orbits and zooms while keeping a finite view-projection matrix", () => {
    const camera = new OrbitCamera();
    const initial = camera.state();

    camera.orbit(24, -12);
    camera.zoomByWheel(-120);
    const next = camera.state();
    const matrix = camera.viewProjection(4 / 3);

    expect(next.yaw).not.toBe(initial.yaw);
    expect(next.pitch).not.toBe(initial.pitch);
    expect(next.distance).toBeLessThan(initial.distance);
    expect([...matrix].every(Number.isFinite)).toBe(true);
  });

  it("clamps zoom and ignores invalid pinch distances", () => {
    const camera = new OrbitCamera();

    camera.zoomByWheel(-100_000);
    expect(camera.state().distance).toBe(2.2);
    camera.zoomByPinch(0, 100);
    expect(camera.state().distance).toBe(2.2);
    camera.zoomByWheel(100_000);
    expect(camera.state().distance).toBe(14);
  });

  it("expands its distance to fit large geometry without shrinking the default framing", () => {
    const camera = new OrbitCamera();
    const initial = camera.state().distance;

    camera.fitRadius(1);
    expect(camera.state().distance).toBe(initial);

    camera.fitRadius(4);
    expect(camera.state().distance).toBeGreaterThan(9);
  });
});
