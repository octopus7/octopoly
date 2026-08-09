import type { TriangleMeshSnapshot, Vec3 } from "@octopoly/contracts";

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The import was aborted", "AbortError");
  }
}

function finiteNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${label} must be finite`);
  }
  return parsed;
}

function resolveIndex(raw: string, length: number, label: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed === 0) {
    throw new TypeError(`${label} must be a non-zero integer`);
  }
  const resolved = parsed > 0 ? parsed - 1 : length + parsed;
  if (resolved < 0 || resolved >= length) {
    throw new RangeError(`${label} is out of range`);
  }
  return resolved;
}

/** Parse an OBJ reference mesh and normalize its positions into project units. */
export function importObj(
  source: string,
  projectUnitsPerSourceUnit = 1,
  signal?: AbortSignal,
): TriangleMeshSnapshot {
  if (!Number.isFinite(projectUnitsPerSourceUnit) || projectUnitsPerSourceUnit <= 0) {
    throw new RangeError("projectUnitsPerSourceUnit must be finite and greater than zero");
  }

  const sourcePositions: Vec3[] = [];
  const sourceNormals: Vec3[] = [];
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const indices: number[] = [];
  const remapped = new Map<string, number>();
  let anyNormal = false;
  let everyCornerHasNormal = true;

  const lines = source.replace(/\r/g, "").split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    throwIfAborted(signal);
    const line = lines[lineIndex]!.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const fields = line.split(/\s+/u);
    const keyword = fields[0];
    if (keyword === "v") {
      if (fields.length < 4) throw new TypeError(`OBJ line ${lineIndex + 1}: vertex needs three coordinates`);
      sourcePositions.push(Object.freeze({
        x: finiteNumber(fields[1]!, "OBJ vertex x") * projectUnitsPerSourceUnit,
        y: finiteNumber(fields[2]!, "OBJ vertex y") * projectUnitsPerSourceUnit,
        z: finiteNumber(fields[3]!, "OBJ vertex z") * projectUnitsPerSourceUnit,
      }));
      continue;
    }
    if (keyword === "vn") {
      if (fields.length < 4) throw new TypeError(`OBJ line ${lineIndex + 1}: normal needs three coordinates`);
      const normal = {
        x: finiteNumber(fields[1]!, "OBJ normal x"),
        y: finiteNumber(fields[2]!, "OBJ normal y"),
        z: finiteNumber(fields[3]!, "OBJ normal z"),
      };
      const length = Math.hypot(normal.x, normal.y, normal.z);
      if (length === 0) throw new TypeError(`OBJ line ${lineIndex + 1}: normal must not be zero length`);
      sourceNormals.push(Object.freeze({ x: normal.x / length, y: normal.y / length, z: normal.z / length }));
      continue;
    }
    if (keyword !== "f") continue;
    if (fields.length < 4) throw new TypeError(`OBJ line ${lineIndex + 1}: face needs at least three vertices`);

    const polygon = fields.slice(1).map((token, cornerIndex) => {
      const parts = token.split("/");
      if (parts.length > 3 || parts[0] === "") {
        throw new TypeError(`OBJ line ${lineIndex + 1}: malformed face corner ${cornerIndex + 1}`);
      }
      const positionIndex = resolveIndex(parts[0]!, sourcePositions.length, "OBJ vertex index");
      const normalPart = parts[2];
      const normalIndex = normalPart === undefined || normalPart === ""
        ? undefined
        : resolveIndex(normalPart, sourceNormals.length, "OBJ normal index");
      anyNormal ||= normalIndex !== undefined;
      everyCornerHasNormal &&= normalIndex !== undefined;
      const key = `${positionIndex}/${normalIndex ?? ""}`;
      let result = remapped.get(key);
      if (result === undefined) {
        result = positions.length;
        remapped.set(key, result);
        positions.push(sourcePositions[positionIndex]!);
        if (normalIndex !== undefined) normals.push(sourceNormals[normalIndex]!);
      }
      return result;
    });

    for (let corner = 1; corner + 1 < polygon.length; corner += 1) {
      indices.push(polygon[0]!, polygon[corner]!, polygon[corner + 1]!);
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    throw new TypeError("OBJ must contain at least one triangular face");
  }
  if (anyNormal && !everyCornerHasNormal) {
    throw new TypeError("OBJ faces must either provide normals for every corner or none");
  }

  const base = { version: 0, positions: Object.freeze(positions), indices: Object.freeze(indices) };
  return anyNormal
    ? Object.freeze({ ...base, normals: Object.freeze(normals) })
    : Object.freeze(base);
}
