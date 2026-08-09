import {
  NUMERIC_TOLERANCE_POLICY,
  type CameraSnapshot,
  type Vec2,
  type Vec3,
  type ViewportSnapshot,
} from "@octopoly/contracts";

import {
  addVec3,
  crossVec3,
  lengthVec3,
  lookAtViewMat4,
  multiplyMat4,
  normalizeVec3,
  perspectiveMat4,
  scaleVec3,
  subtractVec3,
  immutableVec3,
} from "../transforms";

const DEFAULT_UP = Object.freeze({ x: 0, y: 1, z: 0 });

function cloneVec3(value: Vec3): Vec3 {
  return immutableVec3(value.x, value.y, value.z);
}

export function createPerspectiveCameraSnapshot(
  position: Vec3,
  target: Vec3,
  up: Vec3,
  fieldOfViewYRadians: number,
  near: number,
  far: number,
  viewport: ViewportSnapshot,
): CameraSnapshot {
  if (viewport.cssWidth <= 0 || viewport.cssHeight <= 0) {
    throw new RangeError("viewport dimensions must be positive");
  }
  const immutablePosition = cloneVec3(position);
  const view = lookAtViewMat4(immutablePosition, target, up);
  const projection = perspectiveMat4(
    fieldOfViewYRadians,
    viewport.cssWidth / viewport.cssHeight,
    near,
    far,
  );
  return Object.freeze({
    view,
    projection,
    viewProjection: multiplyMat4(projection, view),
    position: immutablePosition,
  });
}

export class OrbitCameraController {
  private positionValue: Vec3;
  private targetValue: Vec3;
  private readonly upValue: Vec3;

  constructor(
    position: Vec3,
    target: Vec3,
    up: Vec3 = DEFAULT_UP,
    private readonly fieldOfViewYRadians = Math.PI / 3,
    private readonly near = 0.01,
    private readonly far = 10_000,
  ) {
    this.positionValue = cloneVec3(position);
    this.targetValue = cloneVec3(target);
    this.upValue = normalizeVec3(up);
    if (lengthVec3(subtractVec3(position, target)) <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
      throw new RangeError("camera position and target must differ");
    }
    perspectiveMat4(fieldOfViewYRadians, 1, near, far);
  }

  position(): Vec3 {
    return cloneVec3(this.positionValue);
  }

  target(): Vec3 {
    return cloneVec3(this.targetValue);
  }

  snapshot(viewport: ViewportSnapshot): CameraSnapshot {
    return createPerspectiveCameraSnapshot(
      this.positionValue,
      this.targetValue,
      this.upValue,
      this.fieldOfViewYRadians,
      this.near,
      this.far,
      viewport,
    );
  }

  orbit(yawRadians: number, pitchRadians: number): void {
    if (!Number.isFinite(yawRadians) || !Number.isFinite(pitchRadians)) {
      throw new RangeError("orbit angles must be finite");
    }
    const offset = subtractVec3(this.positionValue, this.targetValue);
    const radius = lengthVec3(offset);
    const yaw = Math.atan2(offset.x, offset.z) + yawRadians;
    const limit = Math.PI / 2 - NUMERIC_TOLERANCE_POLICY.angleRadians;
    const currentSine = Math.max(-1, Math.min(1, offset.y / radius));
    const pitch = Math.max(-limit, Math.min(limit, Math.asin(currentSine) + pitchRadians));
    const horizontalRadius = radius * Math.cos(pitch);
    this.positionValue = addVec3(
      this.targetValue,
      immutableVec3(
        horizontalRadius * Math.sin(yaw),
        radius * Math.sin(pitch),
        horizontalRadius * Math.cos(yaw),
      ),
    );
  }

  pan(deltaCssPx: Vec2, viewport: ViewportSnapshot): void {
    if (!Number.isFinite(deltaCssPx.x) || !Number.isFinite(deltaCssPx.y) || viewport.cssHeight <= 0) {
      throw new RangeError("pan delta and viewport must be finite with a positive height");
    }
    const forward = normalizeVec3(subtractVec3(this.targetValue, this.positionValue));
    const right = normalizeVec3(crossVec3(forward, this.upValue));
    const cameraUp = normalizeVec3(crossVec3(right, forward));
    const distance = lengthVec3(subtractVec3(this.positionValue, this.targetValue));
    const worldPerCssPixel = (2 * distance * Math.tan(this.fieldOfViewYRadians / 2)) / viewport.cssHeight;
    const translation = addVec3(
      scaleVec3(right, -deltaCssPx.x * worldPerCssPixel),
      scaleVec3(cameraUp, deltaCssPx.y * worldPerCssPixel),
    );
    this.positionValue = addVec3(this.positionValue, translation);
    this.targetValue = addVec3(this.targetValue, translation);
  }

  zoom(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError("zoom scale must be positive and finite");
    }
    const offset = subtractVec3(this.positionValue, this.targetValue);
    const nextOffset = scaleVec3(offset, scale);
    if (lengthVec3(nextOffset) <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
      throw new RangeError("zoom would place the camera on its target");
    }
    this.positionValue = addVec3(this.targetValue, nextOffset);
  }
}
