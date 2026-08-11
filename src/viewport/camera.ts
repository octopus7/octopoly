export interface CameraState {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
}

const MIN_PITCH = -Math.PI / 2 + 0.05;
const MAX_PITCH = Math.PI / 2 - 0.05;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 14;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export class OrbitCamera {
  #yaw = Math.PI / 4;
  #pitch = Math.PI / 6;
  #distance = 6.5;

  state(): CameraState {
    return { yaw: this.#yaw, pitch: this.#pitch, distance: this.#distance };
  }

  orbit(deltaX: number, deltaY: number): void {
    this.#yaw -= deltaX * 0.008;
    this.#pitch = clamp(this.#pitch - deltaY * 0.008, MIN_PITCH, MAX_PITCH);
  }

  zoomByWheel(deltaY: number): void {
    this.#distance = clamp(this.#distance * Math.exp(deltaY * 0.001), MIN_DISTANCE, MAX_DISTANCE);
  }

  zoomByPinch(previousDistance: number, nextDistance: number): void {
    if (previousDistance <= 0 || nextDistance <= 0) return;
    this.#distance = clamp(this.#distance * (previousDistance / nextDistance), MIN_DISTANCE, MAX_DISTANCE);
  }

  viewProjection(aspect: number): Float32Array {
    const horizontal = this.#distance * Math.cos(this.#pitch);
    const eye: Vec3 = [
      horizontal * Math.sin(this.#yaw),
      this.#distance * Math.sin(this.#pitch),
      horizontal * Math.cos(this.#yaw),
    ];
    return multiply(perspective(Math.PI / 4, Math.max(aspect, 0.01), 0.1, 100), lookAt(eye, [0, 0, 0]));
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
