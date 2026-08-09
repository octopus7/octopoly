import {
  assertNonNegativeSafeInteger,
  incrementNonNegativeSafeInteger,
  type OverlayPrimitive,
  type ToolPreview,
  type Vec3,
  type Vec4,
} from "@octopoly/contracts";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than zero`);
  }
  return value;
}

function freezeVec3(value: Vec3): Vec3 {
  return Object.freeze({
    x: finite(value.x, "position.x"),
    y: finite(value.y, "position.y"),
    z: finite(value.z, "position.z"),
  });
}

function freezeColor(value: Vec4): Vec4 {
  return Object.freeze({
    x: finite(value.x, "color.x"),
    y: finite(value.y, "color.y"),
    z: finite(value.z, "color.z"),
    w: finite(value.w, "color.w"),
  });
}

function freezePositions(values: ReadonlyArray<Vec3>): ReadonlyArray<Vec3> {
  return Object.freeze(values.map(freezeVec3));
}

export function pointsOverlay(
  positions: ReadonlyArray<Vec3>,
  color: Vec4,
  sizeCssPx: number,
): OverlayPrimitive {
  return Object.freeze({
    kind: "points",
    positions: freezePositions(positions),
    color: freezeColor(color),
    sizeCssPx: positive(sizeCssPx, "sizeCssPx"),
  });
}

export function polylineOverlay(
  positions: ReadonlyArray<Vec3>,
  color: Vec4,
  widthCssPx: number,
): OverlayPrimitive {
  return Object.freeze({
    kind: "polyline",
    positions: freezePositions(positions),
    color: freezeColor(color),
    widthCssPx: positive(widthCssPx, "widthCssPx"),
  });
}

export function trianglesOverlay(
  positions: ReadonlyArray<Vec3>,
  color: Vec4,
): OverlayPrimitive {
  if (positions.length % 3 !== 0) {
    throw new RangeError("triangle positions length must be divisible by three");
  }
  return Object.freeze({
    kind: "triangles",
    positions: freezePositions(positions),
    color: freezeColor(color),
  });
}

function freezePrimitive(primitive: OverlayPrimitive): OverlayPrimitive {
  switch (primitive.kind) {
    case "points":
      return pointsOverlay(primitive.positions, primitive.color, primitive.sizeCssPx);
    case "polyline":
      return polylineOverlay(primitive.positions, primitive.color, primitive.widthCssPx);
    case "triangles":
      return trianglesOverlay(primitive.positions, primitive.color);
  }
}

export function toolPreview(
  id: string,
  revision: number,
  primitives: ReadonlyArray<OverlayPrimitive>,
): ToolPreview {
  if (id.trim().length === 0) {
    throw new TypeError("preview id must not be empty");
  }
  assertNonNegativeSafeInteger(revision, "preview revision");
  return Object.freeze({
    id,
    revision,
    primitives: Object.freeze(primitives.map(freezePrimitive)),
  });
}

export function reviseToolPreview(
  preview: ToolPreview,
  primitives: ReadonlyArray<OverlayPrimitive>,
): ToolPreview {
  return toolPreview(
    preview.id,
    incrementNonNegativeSafeInteger(preview.revision, "preview revision"),
    primitives,
  );
}
