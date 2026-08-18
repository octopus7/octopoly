import { describe, expect, it } from "vitest";

import { CAMERA_FRAMING_MARGIN, OrbitCamera } from "../src/viewport/camera";

describe("OrbitCamera", () => {
  it("starts from a frontal orientation for Facial editing", () => {
    const camera = new OrbitCamera();

    expect(camera.state().yaw).toBe(0);
    expect(camera.state().pitch).toBe(0);
  });

  it("frames a wide shallow box by its projected bounds instead of the enclosing sphere", () => {
    const camera = new OrbitCamera();
    const aspect = 1280 / 577;
    const halfExtents = [1, 0.33, 0.16] as const;

    camera.frameBox([0, 0, 0], halfExtents, aspect);

    const tangent = Math.tan(Math.PI / 8);
    const expected = halfExtents[2]
      + Math.max(halfExtents[1] / tangent, halfExtents[0] / (tangent * aspect)) / CAMERA_FRAMING_MARGIN;
    expect(camera.state().distance).toBeCloseTo(expected, 10);
    expect(camera.state().distance).toBeLessThan(2.2);
  });

  it("expands close box framing after orbit so the projected bounds remain contained", () => {
    const camera = new OrbitCamera();
    const aspect = 1280 / 577;
    const halfExtents = [1, 0.33, 0.16] as const;
    camera.frameBox([0, 0, 0], halfExtents, aspect);

    camera.orbit(-Math.PI / 2 / 0.008, 0);

    const tangent = Math.tan(Math.PI / 8);
    const expected = halfExtents[0]
      + Math.max(halfExtents[1] / tangent, halfExtents[2] / (tangent * aspect)) / CAMERA_FRAMING_MARGIN;
    expect(camera.state().distance).toBeGreaterThanOrEqual(expected);
    expect([...camera.viewProjection(aspect)].every(Number.isFinite)).toBe(true);
  });

  it("rejects an invalid box aspect without poisoning later valid framing", () => {
    const camera = new OrbitCamera();
    camera.frameBox([0, 0, 0], [1, 0.33, 0.16], Number.NaN);
    expect(Number.isFinite(camera.state().distance)).toBe(true);
    expect([...camera.viewProjection(1)].every(Number.isFinite)).toBe(true);

    camera.frameBox([0, 0, 0], [1, 0.33, 0.16], 2);
    expect(Number.isFinite(camera.state().distance)).toBe(true);
    expect([...camera.viewProjection(2)].every(Number.isFinite)).toBe(true);
  });

  it("refreshes replacement box extents without resetting user camera state", () => {
    const camera = new OrbitCamera();
    camera.frameBox([0, 0, 0], [1, 0.1, 0], 2);
    camera.zoomByWheel(-1_000);
    camera.orbit(-25, 0);
    camera.pan(10, -5, 500);
    const before = camera.state();

    camera.updateBoxFraming([0.1, 1, 0], 2);

    expect(camera.state()).toEqual(before);
  });

  it("orbits at a user-selected close zoom without enforcing whole-model bounds", () => {
    const camera = new OrbitCamera();
    camera.frameBox([0, 0, 0], [1, 0.1, 0], 2);
    camera.zoomByWheel(-1_000);
    const before = camera.state();

    camera.orbit(80, -20);

    const after = camera.state();
    expect(after.distance).toBe(before.distance);
    expect(after.target).toEqual(before.target);
    expect(after.yaw).not.toBe(before.yaw);
    expect(after.pitch).not.toBe(before.pitch);
  });

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

  it("frames a unit radius closer with the named conservative margin", () => {
    const camera = new OrbitCamera();

    camera.frameBounds([0, 0, 0], 1, 1);

    const distance = camera.state().distance;
    const expected = 1 / CAMERA_FRAMING_MARGIN / Math.sin(Math.PI / 8);
    expect(CAMERA_FRAMING_MARGIN).toBe(0.96);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeLessThan(1.1 / Math.sin(Math.PI / 8));
    expect(distance).toBeCloseTo(expected, 10);
  });

  it("updates resized portrait bounds without overriding a user zoom", () => {
    const camera = new OrbitCamera();
    camera.frameBounds([0, 0, 0], 1, 1);
    camera.zoomByWheel(-100_000);
    const userDistance = camera.state().distance;
    expect(userDistance).toBe(2.2);

    const portraitAspect = 0.5;
    camera.fitAspect(portraitAspect);

    const horizontalHalfFov = Math.atan(Math.tan(Math.PI / 8) * portraitAspect);
    const requiredDistance = 1 / CAMERA_FRAMING_MARGIN / Math.sin(horizontalHalfFov);
    expect(camera.state().distance).toBe(userDistance);
    expect([...camera.viewProjection(portraitAspect)].every(Number.isFinite)).toBe(true);

    camera.zoomByWheel(100_000);
    expect(camera.state().distance).toBeGreaterThanOrEqual(requiredDistance);
    expect(camera.state().distance).toBeCloseTo(Math.max(14, requiredDistance * 4), 10);
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
