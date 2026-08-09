import {
  NUMERIC_TOLERANCE_POLICY,
  type Mat4,
  type Vec2,
  type Vec3,
  type ViewportSnapshot,
} from "@octopoly/contracts";

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function matrixElements(matrix: Mat4): ReadonlyArray<number> {
  if (matrix.elements.length !== 16 || matrix.elements.some((value) => !Number.isFinite(value))) {
    throw new RangeError("matrix must contain 16 finite values");
  }
  return matrix.elements;
}

export function immutableVec3(x: number, y: number, z: number): Vec3 {
  assertFinite(x, "x");
  assertFinite(y, "y");
  assertFinite(z, "z");
  return Object.freeze({ x, y, z });
}

export function immutableMat4(elements: ReadonlyArray<number>): Mat4 {
  if (elements.length !== 16 || elements.some((value) => !Number.isFinite(value))) {
    throw new RangeError("matrix must contain 16 finite values");
  }
  return Object.freeze({ elements: Object.freeze([...elements]) });
}

export function identityMat4(): Mat4 {
  return immutableMat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function addVec3(first: Vec3, second: Vec3): Vec3 {
  return immutableVec3(first.x + second.x, first.y + second.y, first.z + second.z);
}

export function subtractVec3(first: Vec3, second: Vec3): Vec3 {
  return immutableVec3(first.x - second.x, first.y - second.y, first.z - second.z);
}

export function scaleVec3(value: Vec3, scale: number): Vec3 {
  assertFinite(scale, "scale");
  return immutableVec3(value.x * scale, value.y * scale, value.z * scale);
}

export function dotVec3(first: Vec3, second: Vec3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

export function crossVec3(first: Vec3, second: Vec3): Vec3 {
  return immutableVec3(
    first.y * second.z - first.z * second.y,
    first.z * second.x - first.x * second.z,
    first.x * second.y - first.y * second.x,
  );
}

export function lengthVec3(value: Vec3): number {
  const length = Math.hypot(value.x, value.y, value.z);
  assertFinite(length, "vector length");
  return length;
}

export function normalizeVec3(value: Vec3): Vec3 {
  const length = lengthVec3(value);
  if (length <= NUMERIC_TOLERANCE_POLICY.normalizedVector) {
    throw new RangeError("cannot normalize a zero or near-zero vector");
  }
  return scaleVec3(value, 1 / length);
}

export function multiplyMat4(first: Mat4, second: Mat4): Mat4 {
  const firstElements = matrixElements(first);
  const secondElements = matrixElements(second);
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let inner = 0; inner < 4; inner += 1) {
        value += (firstElements[inner * 4 + row] ?? 0) * (secondElements[column * 4 + inner] ?? 0);
      }
      result[column * 4 + row] = value;
    }
  }
  return immutableMat4(result);
}

export function invertMat4(matrix: Mat4): Mat4 {
  const m = matrixElements(matrix);

  const a00 = m[0] ?? 0;
  const a01 = m[1] ?? 0;
  const a02 = m[2] ?? 0;
  const a03 = m[3] ?? 0;
  const a10 = m[4] ?? 0;
  const a11 = m[5] ?? 0;
  const a12 = m[6] ?? 0;
  const a13 = m[7] ?? 0;
  const a20 = m[8] ?? 0;
  const a21 = m[9] ?? 0;
  const a22 = m[10] ?? 0;
  const a23 = m[11] ?? 0;
  const a30 = m[12] ?? 0;
  const a31 = m[13] ?? 0;
  const a32 = m[14] ?? 0;
  const a33 = m[15] ?? 0;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError("matrix must be invertible");
  }

  const inverseDeterminant = 1 / determinant;
  return immutableMat4([
    (a11 * b11 - a12 * b10 + a13 * b09) * inverseDeterminant,
    (a02 * b10 - a01 * b11 - a03 * b09) * inverseDeterminant,
    (a31 * b05 - a32 * b04 + a33 * b03) * inverseDeterminant,
    (a22 * b04 - a21 * b05 - a23 * b03) * inverseDeterminant,
    (a12 * b08 - a10 * b11 - a13 * b07) * inverseDeterminant,
    (a00 * b11 - a02 * b08 + a03 * b07) * inverseDeterminant,
    (a32 * b02 - a30 * b05 - a33 * b01) * inverseDeterminant,
    (a20 * b05 - a22 * b02 + a23 * b01) * inverseDeterminant,
    (a10 * b10 - a11 * b08 + a13 * b06) * inverseDeterminant,
    (a01 * b08 - a00 * b10 - a03 * b06) * inverseDeterminant,
    (a30 * b04 - a31 * b02 + a33 * b00) * inverseDeterminant,
    (a21 * b02 - a20 * b04 - a23 * b00) * inverseDeterminant,
    (a11 * b07 - a10 * b09 - a12 * b06) * inverseDeterminant,
    (a00 * b09 - a01 * b07 + a02 * b06) * inverseDeterminant,
    (a31 * b01 - a30 * b03 - a32 * b00) * inverseDeterminant,
    (a20 * b03 - a21 * b01 + a22 * b00) * inverseDeterminant,
  ]);
}

export function transformPoint(matrix: Mat4, point: Vec3): Vec3 {
  const m = matrixElements(matrix);
  const x = (m[0] ?? 0) * point.x + (m[4] ?? 0) * point.y + (m[8] ?? 0) * point.z + (m[12] ?? 0);
  const y = (m[1] ?? 0) * point.x + (m[5] ?? 0) * point.y + (m[9] ?? 0) * point.z + (m[13] ?? 0);
  const z = (m[2] ?? 0) * point.x + (m[6] ?? 0) * point.y + (m[10] ?? 0) * point.z + (m[14] ?? 0);
  const w = (m[3] ?? 0) * point.x + (m[7] ?? 0) * point.y + (m[11] ?? 0) * point.z + (m[15] ?? 0);
  if (!Number.isFinite(w) || Math.abs(w) <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
    throw new RangeError("point transforms to an invalid homogeneous coordinate");
  }
  return immutableVec3(x / w, y / w, z / w);
}

export function transformDirection(matrix: Mat4, direction: Vec3): Vec3 {
  const m = matrixElements(matrix);
  return immutableVec3(
    (m[0] ?? 0) * direction.x + (m[4] ?? 0) * direction.y + (m[8] ?? 0) * direction.z,
    (m[1] ?? 0) * direction.x + (m[5] ?? 0) * direction.y + (m[9] ?? 0) * direction.z,
    (m[2] ?? 0) * direction.x + (m[6] ?? 0) * direction.y + (m[10] ?? 0) * direction.z,
  );
}

export function perspectiveMat4(
  fieldOfViewYRadians: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  if (
    !Number.isFinite(fieldOfViewYRadians) ||
    fieldOfViewYRadians <= 0 ||
    fieldOfViewYRadians >= Math.PI ||
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    !Number.isFinite(near) ||
    near <= 0 ||
    !Number.isFinite(far) ||
    far <= near
  ) {
    throw new RangeError("perspective parameters are invalid");
  }
  const focalLength = 1 / Math.tan(fieldOfViewYRadians / 2);
  const depth = 1 / (near - far);
  return immutableMat4([
    focalLength / aspect,
    0,
    0,
    0,
    0,
    focalLength,
    0,
    0,
    0,
    0,
    (far + near) * depth,
    -1,
    0,
    0,
    2 * far * near * depth,
    0,
  ]);
}

export function lookAtViewMat4(position: Vec3, target: Vec3, up: Vec3): Mat4 {
  const backward = normalizeVec3(subtractVec3(position, target));
  const right = normalizeVec3(crossVec3(up, backward));
  const cameraUp = crossVec3(backward, right);
  return immutableMat4([
    right.x,
    cameraUp.x,
    backward.x,
    0,
    right.y,
    cameraUp.y,
    backward.y,
    0,
    right.z,
    cameraUp.z,
    backward.z,
    0,
    -dotVec3(right, position),
    -dotVec3(cameraUp, position),
    -dotVec3(backward, position),
    1,
  ]);
}

export function screenToNdc(point: Vec2, viewport: ViewportSnapshot): Vec2 {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(viewport.cssWidth) ||
    viewport.cssWidth <= 0 ||
    !Number.isFinite(viewport.cssHeight) ||
    viewport.cssHeight <= 0
  ) {
    throw new RangeError("screen point and viewport must be finite with positive dimensions");
  }
  return Object.freeze({
    x: (2 * point.x) / viewport.cssWidth - 1,
    y: 1 - (2 * point.y) / viewport.cssHeight,
  });
}

export function unprojectScreenPoint(
  point: Vec2,
  ndcDepth: number,
  inverseViewProjection: Mat4,
  viewport: ViewportSnapshot,
): Vec3 {
  assertFinite(ndcDepth, "NDC depth");
  const ndc = screenToNdc(point, viewport);
  return transformPoint(inverseViewProjection, immutableVec3(ndc.x, ndc.y, ndcDepth));
}

export function projectWorldToScreen(
  point: Vec3,
  viewProjection: Mat4,
  viewport: ViewportSnapshot,
): Vec3 {
  if (viewport.cssWidth <= 0 || viewport.cssHeight <= 0) {
    throw new RangeError("viewport dimensions must be positive");
  }
  if (!Number.isFinite(viewport.cssWidth) || !Number.isFinite(viewport.cssHeight)) {
    throw new RangeError("viewport dimensions must be finite");
  }
  const m = matrixElements(viewProjection);
  const clipX = (m[0] ?? 0) * point.x + (m[4] ?? 0) * point.y + (m[8] ?? 0) * point.z + (m[12] ?? 0);
  const clipY = (m[1] ?? 0) * point.x + (m[5] ?? 0) * point.y + (m[9] ?? 0) * point.z + (m[13] ?? 0);
  const clipZ = (m[2] ?? 0) * point.x + (m[6] ?? 0) * point.y + (m[10] ?? 0) * point.z + (m[14] ?? 0);
  const clipW = (m[3] ?? 0) * point.x + (m[7] ?? 0) * point.y + (m[11] ?? 0) * point.z + (m[15] ?? 0);
  if (!Number.isFinite(clipW) || clipW <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
    throw new RangeError("point is not in front of the camera");
  }
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return immutableVec3(
    ((ndcX + 1) * viewport.cssWidth) / 2,
    ((1 - ndcY) * viewport.cssHeight) / 2,
    clipZ / clipW,
  );
}
