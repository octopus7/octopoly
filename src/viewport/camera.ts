export interface CameraState {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly target: readonly [number, number, number];
}

export interface CameraSnapshot extends CameraState {
  readonly minimumDistance: number;
  readonly maximumDistance: number;
  readonly framingRadius: number | null;
  readonly framingHalfExtents: readonly [number, number, number] | null;
  readonly framingAspect: number | null;
  readonly distanceUserControlled: boolean;
}

export interface CameraRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

const MIN_PITCH = -Math.PI / 2 + 0.05;
const MAX_PITCH = Math.PI / 2 - 0.05;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 14;

export const CAMERA_FRAMING_MARGIN = 0.96;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function framingDistance(radius: number, aspect: number): number {
  const verticalHalfFov = Math.PI / 8;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(aspect, 0.01));
  return radius / CAMERA_FRAMING_MARGIN / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
}

function boxFramingDistance(halfExtents: Vec3, aspect: number, yaw: number, pitch: number): number {
  const verticalTangent = Math.tan(Math.PI / 8);
  const horizontalTangent = verticalTangent * Math.max(aspect, 0.01);
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vec3 = [
    -Math.sin(pitch) * Math.sin(yaw),
    Math.cos(pitch),
    -Math.sin(pitch) * Math.cos(yaw),
  ];
  const forward: Vec3 = [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
  const projectedExtent = (axis: Vec3): number =>
    Math.abs(axis[0]) * halfExtents[0]
    + Math.abs(axis[1]) * halfExtents[1]
    + Math.abs(axis[2]) * halfExtents[2];
  return projectedExtent(forward) + Math.max(
    projectedExtent(up) / verticalTangent,
    projectedExtent(right) / horizontalTangent,
  ) / CAMERA_FRAMING_MARGIN;
}

export class OrbitCamera {
  #yaw = 0;
  #pitch = 0;
  #distance = 6.5;
  #minimumDistance = MIN_DISTANCE;
  #maximumDistance = MAX_DISTANCE;
  #target: Vec3 = [0, 0, 0];
  #framingRadius: number | null = null;
  #framingHalfExtents: Vec3 | null = null;
  #framingAspect: number | null = null;
  #distanceUserControlled = false;

  state(): CameraState {
    return {
      yaw: this.#yaw,
      pitch: this.#pitch,
      distance: this.#distance,
      target: [...this.#target],
    };
  }

  snapshot(): CameraSnapshot {
    return {
      ...this.state(),
      minimumDistance: this.#minimumDistance,
      maximumDistance: this.#maximumDistance,
      framingRadius: this.#framingRadius,
      framingHalfExtents: this.#framingHalfExtents ? [...this.#framingHalfExtents] : null,
      framingAspect: this.#framingAspect,
      distanceUserControlled: this.#distanceUserControlled,
    };
  }

  restore(snapshot: CameraSnapshot): void {
    this.#yaw = snapshot.yaw;
    this.#pitch = snapshot.pitch;
    this.#distance = snapshot.distance;
    this.#minimumDistance = snapshot.minimumDistance;
    this.#maximumDistance = snapshot.maximumDistance;
    this.#target = [...snapshot.target] as Vec3;
    this.#framingRadius = snapshot.framingRadius;
    this.#framingHalfExtents = snapshot.framingHalfExtents
      ? [...snapshot.framingHalfExtents] as Vec3
      : null;
    this.#framingAspect = snapshot.framingAspect;
    this.#distanceUserControlled = snapshot.distanceUserControlled;
  }

  orbit(deltaX: number, deltaY: number): void {
    if (![deltaX, deltaY].every(Number.isFinite)) return;
    this.#yaw -= deltaX * 0.008;
    this.#pitch = clamp(this.#pitch - deltaY * 0.008, MIN_PITCH, MAX_PITCH);
    if (this.#framingHalfExtents && this.#framingAspect !== null) {
      const requiredDistance = boxFramingDistance(
        this.#framingHalfExtents,
        this.#framingAspect,
        this.#yaw,
        this.#pitch,
      );
      this.#maximumDistance = Math.max(this.#maximumDistance, requiredDistance * 4);
      if (!this.#distanceUserControlled) {
        this.#distance = clamp(
          Math.max(this.#distance, requiredDistance),
          this.#minimumDistance,
          this.#maximumDistance,
        );
      }
    }
  }

  pan(deltaX: number, deltaY: number, viewportHeight: number): void {
    if (![deltaX, deltaY, viewportHeight].every(Number.isFinite) || viewportHeight <= 0) return;
    const unitsPerPixel = 2 * this.#distance * Math.tan(Math.PI / 8) / viewportHeight;
    const right: Vec3 = [Math.cos(this.#yaw), 0, -Math.sin(this.#yaw)];
    const up: Vec3 = [
      -Math.sin(this.#pitch) * Math.sin(this.#yaw),
      Math.cos(this.#pitch),
      -Math.sin(this.#pitch) * Math.cos(this.#yaw),
    ];
    this.#target = [
      this.#target[0] - right[0] * deltaX * unitsPerPixel + up[0] * deltaY * unitsPerPixel,
      this.#target[1] - right[1] * deltaX * unitsPerPixel + up[1] * deltaY * unitsPerPixel,
      this.#target[2] - right[2] * deltaX * unitsPerPixel + up[2] * deltaY * unitsPerPixel,
    ];
  }

  focus(target: Vec3): void {
    if (!target.every(Number.isFinite)) return;
    this.#target = [...target] as unknown as Vec3;
  }

  viewDirection(): Vec3 {
    return normalize([
      -Math.cos(this.#pitch) * Math.sin(this.#yaw),
      -Math.sin(this.#pitch),
      -Math.cos(this.#pitch) * Math.cos(this.#yaw),
    ]);
  }

  ray(viewportX: number, viewportY: number, width: number, height: number): CameraRay | null {
    if (![viewportX, viewportY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const horizontal = this.#distance * Math.cos(this.#pitch);
    const origin: Vec3 = [
      this.#target[0] + horizontal * Math.sin(this.#yaw),
      this.#target[1] + this.#distance * Math.sin(this.#pitch),
      this.#target[2] + horizontal * Math.cos(this.#yaw),
    ];
    const right: Vec3 = [Math.cos(this.#yaw), 0, -Math.sin(this.#yaw)];
    const up: Vec3 = [
      -Math.sin(this.#pitch) * Math.sin(this.#yaw),
      Math.cos(this.#pitch),
      -Math.sin(this.#pitch) * Math.cos(this.#yaw),
    ];
    const forward = this.viewDirection();
    const tangent = Math.tan(Math.PI / 8);
    const horizontalScale = (viewportX / width * 2 - 1) * tangent * width / height;
    const verticalScale = (1 - viewportY / height * 2) * tangent;
    return {
      origin,
      direction: normalize([
        forward[0] + right[0] * horizontalScale + up[0] * verticalScale,
        forward[1] + right[1] * horizontalScale + up[1] * verticalScale,
        forward[2] + right[2] * horizontalScale + up[2] * verticalScale,
      ]),
    };
  }

  zoomByWheel(deltaY: number): void {
    if (!Number.isFinite(deltaY)) return;
    this.#distance = clamp(this.#distance * Math.exp(deltaY * 0.001), this.#minimumDistance, this.#maximumDistance);
    this.#distanceUserControlled = true;
  }

  zoomByPinch(previousDistance: number, nextDistance: number): void {
    if (previousDistance <= 0 || nextDistance <= 0) return;
    this.#distance = clamp(this.#distance * (previousDistance / nextDistance), this.#minimumDistance, this.#maximumDistance);
    this.#distanceUserControlled = true;
  }

  fitRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const requiredDistance = radius * 1.05 / Math.sin(Math.PI / 8);
    this.#distance = clamp(Math.max(this.#distance, requiredDistance), MIN_DISTANCE, MAX_DISTANCE);
  }

  frameBounds(center: Vec3, radius: number, aspect = 1): void {
    if (
      !center.every(Number.isFinite)
      || !Number.isFinite(radius)
      || radius <= 0
      || !Number.isFinite(aspect)
      || aspect <= 0
    ) return;
    const requiredDistance = framingDistance(radius, aspect);
    this.#target = [...center] as unknown as Vec3;
    this.#framingRadius = radius;
    this.#framingHalfExtents = null;
    this.#framingAspect = aspect;
    this.#minimumDistance = MIN_DISTANCE;
    this.#maximumDistance = Math.max(MAX_DISTANCE, requiredDistance * 4);
    this.#distance = clamp(requiredDistance, this.#minimumDistance, this.#maximumDistance);
    this.#distanceUserControlled = false;
  }

  frameBox(center: Vec3, halfExtents: Vec3, aspect = 1): void {
    if (
      !center.every(Number.isFinite)
      || !halfExtents.every((extent) => Number.isFinite(extent) && extent >= 0)
      || !halfExtents.some((extent) => extent > 0)
      || !Number.isFinite(aspect)
      || aspect <= 0
    ) return;
    const requiredDistance = boxFramingDistance(halfExtents, aspect, this.#yaw, this.#pitch);
    this.#target = [...center] as unknown as Vec3;
    this.#framingRadius = null;
    this.#framingHalfExtents = [...halfExtents] as unknown as Vec3;
    this.#framingAspect = aspect;
    this.#minimumDistance = Math.max(0.05, Math.hypot(...halfExtents) + 0.01);
    this.#maximumDistance = Math.max(MAX_DISTANCE, requiredDistance * 4);
    this.#distance = clamp(requiredDistance, this.#minimumDistance, this.#maximumDistance);
    this.#distanceUserControlled = false;
  }

  updateBoxFraming(halfExtents: Vec3, aspect: number): void {
    if (
      !halfExtents.every((extent) => Number.isFinite(extent) && extent >= 0)
      || !halfExtents.some((extent) => extent > 0)
      || !Number.isFinite(aspect)
      || aspect <= 0
    ) return;
    const requiredDistance = boxFramingDistance(halfExtents, aspect, this.#yaw, this.#pitch);
    this.#framingRadius = null;
    this.#framingHalfExtents = [...halfExtents] as unknown as Vec3;
    this.#framingAspect = aspect;
    const minimumDistance = Math.max(0.05, Math.hypot(...halfExtents) + 0.01);
    this.#minimumDistance = this.#distanceUserControlled
      ? Math.min(this.#distance, minimumDistance)
      : minimumDistance;
    this.#maximumDistance = Math.max(this.#maximumDistance, MAX_DISTANCE, requiredDistance * 4, this.#distance);
    if (!this.#distanceUserControlled) {
      this.#distance = clamp(
        Math.max(this.#distance, requiredDistance),
        this.#minimumDistance,
        this.#maximumDistance,
      );
    }
  }

  fitAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    const requiredDistance = this.#framingHalfExtents
      ? boxFramingDistance(this.#framingHalfExtents, aspect, this.#yaw, this.#pitch)
      : this.#framingRadius === null ? null : framingDistance(this.#framingRadius, aspect);
    if (requiredDistance === null) return;
    this.#framingAspect = aspect;
    this.#maximumDistance = Math.max(this.#maximumDistance, requiredDistance * 4);
    if (!this.#distanceUserControlled) {
      this.#distance = clamp(Math.max(this.#distance, requiredDistance), this.#minimumDistance, this.#maximumDistance);
    }
  }

  viewProjection(aspect: number): Float32Array {
    const horizontal = this.#distance * Math.cos(this.#pitch);
    const eye: Vec3 = [
      this.#target[0] + horizontal * Math.sin(this.#yaw),
      this.#target[1] + this.#distance * Math.sin(this.#pitch),
      this.#target[2] + horizontal * Math.cos(this.#yaw),
    ];
    const near = Math.max(0.01, this.#distance / 1_000);
    const far = Math.max(100, this.#distance * 8);
    return multiply(perspective(Math.PI / 4, Math.max(aspect, 0.01), near, far), lookAt(eye, this.#target));
  }
}

type Vec3 = readonly [number, number, number];

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lookAt(eye: Vec3, target: Vec3): Float32Array {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

function perspective(fieldOfView: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, 2 * near * far * range, 0,
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += (a[index * 4 + row] ?? 0) * (b[column * 4 + index] ?? 0);
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}
