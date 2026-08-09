import type {
  AttributeKey,
  CornerId,
  MeshSnapshot,
  Vec2,
} from "@octopoly/contracts";
import { NUMERIC_TOLERANCE_POLICY } from "@octopoly/contracts";

import { UV0_ATTRIBUTE } from "../data/attributes";
import { immutableReadonlyMap } from "./immutable-readonly-map";

interface SelectedUv {
  readonly corner: CornerId;
  readonly value: Vec2 | undefined;
}

function assertFiniteVec2(value: Vec2, label: string): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function readSelected(
  snapshot: MeshSnapshot,
  selectedCorners: ReadonlySet<CornerId> | ReadonlyArray<CornerId>,
  key: AttributeKey<Vec2>,
): ReadonlyArray<SelectedUv> {
  const liveCorners = new Set(snapshot.corners.map((corner) => corner.id));
  const selected = [...new Set(selectedCorners)]
    .filter((corner) => liveCorners.has(corner))
    .sort((first, second) => first - second);

  return selected.map((corner) => {
    const value = snapshot.attributes.get(key, corner);
    if (value !== undefined) {
      assertFiniteVec2(value, `UV value for corner ${corner}`);
    }
    return { corner, value };
  });
}

function definedValues(selected: ReadonlyArray<SelectedUv>): ReadonlyArray<Vec2> {
  return selected.flatMap((entry) => entry.value === undefined ? [] : [entry.value]);
}

function centroid(values: ReadonlyArray<Vec2>): Vec2 {
  if (values.length === 0) {
    return { x: 0, y: 0 };
  }
  const total = values.reduce(
    (result, value) => ({ x: result.x + value.x, y: result.y + value.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / values.length, y: total.y / values.length };
}

function transformSelected(
  selected: ReadonlyArray<SelectedUv>,
  transform: (value: Vec2) => Vec2,
): ReadonlyMap<CornerId, Vec2 | undefined> {
  const result = new Map<CornerId, Vec2 | undefined>();
  for (const entry of selected) {
    if (entry.value === undefined) {
      result.set(entry.corner, undefined);
      continue;
    }
    const transformed = transform(entry.value);
    assertFiniteVec2(transformed, `transformed UV value for corner ${entry.corner}`);
    result.set(entry.corner, Object.freeze(transformed));
  }
  return immutableReadonlyMap(result);
}

/** Pure UV transforms over live selected corners. Missing values remain explicitly undefined. */
export class UvTransformService {
  constructor(private readonly key: AttributeKey<Vec2> = UV0_ATTRIBUTE) {}

  move(
    snapshot: MeshSnapshot,
    selectedCorners: ReadonlySet<CornerId> | ReadonlyArray<CornerId>,
    delta: Vec2,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    assertFiniteVec2(delta, "UV move delta");
    const selected = readSelected(snapshot, selectedCorners, this.key);
    return transformSelected(selected, (value) => ({
      x: value.x + delta.x,
      y: value.y + delta.y,
    }));
  }

  rotate(
    snapshot: MeshSnapshot,
    selectedCorners: ReadonlySet<CornerId> | ReadonlyArray<CornerId>,
    angleRadians: number,
    pivot?: Vec2,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    if (!Number.isFinite(angleRadians)) {
      throw new RangeError("UV rotation angle must be finite");
    }
    const selected = readSelected(snapshot, selectedCorners, this.key);
    const origin = pivot ?? centroid(definedValues(selected));
    assertFiniteVec2(origin, "UV rotation pivot");
    const cosine = Math.cos(angleRadians);
    const sine = Math.sin(angleRadians);

    return transformSelected(selected, (value) => {
      const x = value.x - origin.x;
      const y = value.y - origin.y;
      return {
        x: origin.x + x * cosine - y * sine,
        y: origin.y + x * sine + y * cosine,
      };
    });
  }

  scale(
    snapshot: MeshSnapshot,
    selectedCorners: ReadonlySet<CornerId> | ReadonlyArray<CornerId>,
    factor: number | Vec2,
    pivot?: Vec2,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    const scale = typeof factor === "number" ? { x: factor, y: factor } : factor;
    assertFiniteVec2(scale, "UV scale factor");
    const selected = readSelected(snapshot, selectedCorners, this.key);
    const origin = pivot ?? centroid(definedValues(selected));
    assertFiniteVec2(origin, "UV scale pivot");

    return transformSelected(selected, (value) => ({
      x: origin.x + (value.x - origin.x) * scale.x,
      y: origin.y + (value.y - origin.y) * scale.y,
    }));
  }

  /** Fits the selected UV bounds into the unit square while preserving aspect ratio. */
  normalize(
    snapshot: MeshSnapshot,
    selectedCorners: ReadonlySet<CornerId> | ReadonlyArray<CornerId>,
    padding = 0,
  ): ReadonlyMap<CornerId, Vec2 | undefined> {
    if (!Number.isFinite(padding) || padding < 0 || padding >= 0.5) {
      throw new RangeError("UV normalize padding must be finite and in [0, 0.5)");
    }
    const selected = readSelected(snapshot, selectedCorners, this.key);
    const values = definedValues(selected);
    if (values.length === 0) {
      return transformSelected(selected, (value) => value);
    }

    let minimumX = Number.POSITIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      minimumX = Math.min(minimumX, value.x);
      minimumY = Math.min(minimumY, value.y);
      maximumX = Math.max(maximumX, value.x);
      maximumY = Math.max(maximumY, value.y);
    }
    const width = maximumX - minimumX;
    const height = maximumY - minimumY;
    const extent = Math.max(width, height);
    if (extent <= NUMERIC_TOLERANCE_POLICY.absoluteDistance) {
      return transformSelected(selected, () => ({ x: 0.5, y: 0.5 }));
    }

    const centerX = (minimumX + maximumX) / 2;
    const centerY = (minimumY + maximumY) / 2;
    const scale = (1 - 2 * padding) / extent;
    return transformSelected(selected, (value) => ({
      x: 0.5 + (value.x - centerX) * scale,
      y: 0.5 + (value.y - centerY) * scale,
    }));
  }
}
