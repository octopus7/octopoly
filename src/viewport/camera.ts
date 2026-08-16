export interface CameraState {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly target: readonly [number, number, number];
}

export interface CameraRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

const MIN_PITCH = -Math.PI / 2 + 0.05;
const MAX_PITCH = Math.PI / 2 - 0.05;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 14;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function framingDistance(radius: number, aspect: number): number {
  const verticalHalfFov = Math.PI / 8;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(aspect, 0.01));
  return radius * 1.1 / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
}

export class OrbitCamera {
  #yaw = Math.PI / 4;
  #pitch = Math.PI / 6;
  #distance = 6.5;
  #maximumDistance = MAX_DISTANCE;
  #target: Vec3 = [0, 0, 0];
  #framingRadius: number | null = null;

  state(): CameraState {
    return {
      yaw: this.#yaw,
      pitch: this.#pitch,
      distance: this.#distance,
      target: [...this.#target],
    };
  }

  orbit(deltaX: number, deltaY: number): void {
    this.#yaw -= deltaX * 0.008;
    this.#pitch = clamp(this.#pitch - deltaY * 0.008, MIN_PITCH, MAX_PITCH);
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
    this.#distance = clamp(this.#distance * Math.exp(deltaY * 0.001), MIN_DISTANCE, this.#maximumDistance);
  }

  zoomByPinch(previousDistance: number, nextDistance: number): void {
    if (previousDistance <= 0 || nextDistance <= 0) return;
    this.#distance = clamp(this.#distance * (previousDistance / nextDistance), MIN_DISTANCE, this.#maximumDistance);
  }

  fitRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const requiredDistance = radius * 1.05 / Math.sin(Math.PI / 8);
    this.#distance = clamp(Math.max(this.#distance, requiredDistance), MIN_DISTANCE, MAX_DISTANCE);
  }

  frameBounds(center: Vec3, radius: number, aspect = 1): void {
    if (!center.every(Number.isFinite) || !Number.isFinite(radius) || radius <= 0) return;
    const requiredDistance = framingDistance(radius, aspect);
    this.#target = [...center] as unknown as Vec3;
    this.#framingRadius = radius;
    this.#maximumDistance = Math.max(MAX_DISTANCE, requiredDistance * 4);
    this.#distance = clamp(requiredDistance, MIN_DISTANCE, this.#maximumDistance);
  }

  fitAspect(aspect: number): void {
    if (this.#framingRadius === null || !Number.isFinite(aspect) || aspect <= 0) return;
    const requiredDistance = framingDistance(this.#framingRadius, aspect);
    this.#maximumDistance = Math.max(this.#maximumDistance, requiredDistance * 4);
    this.#distance = clamp(Math.max(this.#distance, requiredDistance), MIN_DISTANCE, this.#maximumDistance);
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
