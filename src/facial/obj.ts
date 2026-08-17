export interface ObjMesh {
  positions: number[];
  indices: number[];
  uvs?: number[];
}

const OBJ_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const OBJ_NON_ZERO_INTEGER_SOURCE = "[+-]?0*[1-9]\\d*";
const OBJ_FACE_REFERENCE_PATTERN = new RegExp(
  `^(${OBJ_NON_ZERO_INTEGER_SOURCE})(?:/(?:${OBJ_NON_ZERO_INTEGER_SOURCE})(?:/(?:${OBJ_NON_ZERO_INTEGER_SOURCE}))?|//(?:${OBJ_NON_ZERO_INTEGER_SOURCE}))?$`,
);

interface FaceReference {
  readonly position: number;
  readonly uv: number | null;
}

function resolveObjIndex(
  indexToken: string,
  count: number,
  lineNumber: number,
  label: "vertex" | "texture coordinate",
): number {
  const index = Number(indexToken);
  if (!Number.isInteger(index) || index === 0) {
    throw new Error(`OBJ face ${label} index "${indexToken}" on line ${lineNumber} must be a non-zero integer`);
  }
  const resolvedIndex = index > 0 ? index - 1 : count + index;
  if (resolvedIndex < 0 || resolvedIndex >= count) {
    throw new Error(`OBJ face ${label} index "${indexToken}" on line ${lineNumber} is out of range for ${count} ${label === "vertex" ? "vertices" : "texture coordinates"}`);
  }
  return resolvedIndex;
}

function resolveOptionalUvIndex(indexToken: string, count: number): number | null {
  const index = Number(indexToken);
  const resolvedIndex = index > 0 ? index - 1 : count + index;
  return resolvedIndex >= 0 && resolvedIndex < count ? resolvedIndex : null;
}

function parseObjMeshInternal(
  source: string,
  selectedObjectName?: string,
  includeUvs = true,
): ObjMesh {
  const positions: number[] = [];
  const textureCoordinates: number[] = [];
  const triangleReferences: FaceReference[] = [];
  let currentObjectName: string | null = null;
  let selectedObjectSeen = false;

  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const content = lines[lineIndex]?.split("#", 1)[0]?.trim() ?? "";
    if (content === "") continue;
    const fields = content.split(/\s+/);

    if (fields[0] === "o") {
      currentObjectName = fields.slice(1).join(" ");
      if (currentObjectName === selectedObjectName) selectedObjectSeen = true;
    } else if (fields[0] === "v") {
      const coordinateTokens = fields.slice(1);
      const coordinates = coordinateTokens.map(Number);
      if (
        coordinates.length !== 3
        || !coordinateTokens.every((token) => OBJ_NUMBER_PATTERN.test(token))
        || !coordinates.every(Number.isFinite)
        || !coordinates.every((coordinate) => Number.isFinite(Math.fround(coordinate)))
      ) {
        throw new Error(`OBJ vertex on line ${lineIndex + 1} must contain three finite coordinates`);
      }
      positions.push(...coordinates);
    } else if (fields[0] === "vt") {
      const coordinateTokens = fields.slice(1);
      const coordinates = coordinateTokens.map(Number);
      const usable = (
        (coordinates.length === 2 || coordinates.length === 3)
        && coordinateTokens.every((token) => OBJ_NUMBER_PATTERN.test(token))
        && coordinates.every(Number.isFinite)
        && coordinates.slice(0, 2).every((coordinate) => Number.isFinite(Math.fround(coordinate)))
      );
      textureCoordinates.push(
        usable ? coordinates[0]! : Number.NaN,
        usable ? coordinates[1]! : Number.NaN,
      );
    } else if (fields[0] === "f") {
      if (fields.length < 4) {
        throw new Error(`OBJ face on line ${lineIndex + 1} must contain at least three vertices`);
      }
      const faceReferences = fields.slice(1).map((token): FaceReference => {
        const referenceMatch = token.match(OBJ_FACE_REFERENCE_PATTERN);
        const positionToken = referenceMatch?.[1] ?? token.split("/", 1)[0];
        if (!referenceMatch && token.includes("/")) {
          throw new Error(`OBJ face vertex reference "${token}" on line ${lineIndex + 1} must match v, v/vt, v//vn, or v/vt/vn with non-zero integer components`);
        }
        if (!referenceMatch) {
          throw new Error(`OBJ face vertex index "${positionToken}" on line ${lineIndex + 1} must be a non-zero integer`);
        }
        const components = token.split("/");
        const position = resolveObjIndex(referenceMatch[1]!, positions.length / 3, lineIndex + 1, "vertex");
        const uvToken = components.length > 1 && components[1] !== "" ? components[1] : undefined;
        const resolvedUv = uvToken === undefined
          ? null
          : resolveOptionalUvIndex(uvToken, textureCoordinates.length / 2);
        const uvOffset = resolvedUv === null ? -1 : resolvedUv * 2;
        const uv = resolvedUv !== null
          && Number.isFinite(textureCoordinates[uvOffset])
          && Number.isFinite(textureCoordinates[uvOffset + 1])
          ? resolvedUv
          : null;
        return { position, uv };
      });
      if (selectedObjectName === undefined || currentObjectName === selectedObjectName) {
        const first = faceReferences[0]!;
        for (let vertex = 1; vertex < faceReferences.length - 1; vertex += 1) {
          triangleReferences.push(first, faceReferences[vertex]!, faceReferences[vertex + 1]!);
        }
      }
    }
  }

  if (positions.length === 0) throw new Error("OBJ mesh must contain at least one vertex");
  if (selectedObjectName !== undefined && !selectedObjectSeen) {
    throw new Error(`OBJ object "${selectedObjectName}" was not found`);
  }
  if (triangleReferences.length === 0) {
    throw new Error(selectedObjectName === undefined
      ? "OBJ mesh must contain at least one face"
      : `OBJ object "${selectedObjectName}" must contain at least one face`);
  }

  const hasCompleteUvs = includeUvs && triangleReferences.every((reference) => reference.uv !== null);
  if (hasCompleteUvs) {
    const compactPositions: number[] = [];
    const compactUvs: number[] = [];
    const compactIndices: number[] = [];
    const remappedPairs = new Map<string, number>();
    for (const reference of triangleReferences) {
      const uvIndex = reference.uv!;
      const key = `${reference.position}:${uvIndex}`;
      let compactIndex = remappedPairs.get(key);
      if (compactIndex === undefined) {
        compactIndex = remappedPairs.size;
        remappedPairs.set(key, compactIndex);
        const positionOffset = reference.position * 3;
        const uvOffset = uvIndex * 2;
        compactPositions.push(positions[positionOffset]!, positions[positionOffset + 1]!, positions[positionOffset + 2]!);
        compactUvs.push(textureCoordinates[uvOffset]!, textureCoordinates[uvOffset + 1]!);
      }
      compactIndices.push(compactIndex);
    }
    return { positions: compactPositions, indices: compactIndices, uvs: compactUvs };
  }

  const indices = triangleReferences.map((reference) => reference.position);
  if (selectedObjectName === undefined) return { positions, indices };

  const compactPositions: number[] = [];
  const compactIndices: number[] = [];
  const remappedIndices = new Map<number, number>();
  for (const originalIndex of indices) {
    let compactIndex = remappedIndices.get(originalIndex);
    if (compactIndex === undefined) {
      compactIndex = remappedIndices.size;
      remappedIndices.set(originalIndex, compactIndex);
      const offset = originalIndex * 3;
      compactPositions.push(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!);
    }
    compactIndices.push(compactIndex);
  }
  return { positions: compactPositions, indices: compactIndices };
}

export function parseObjMesh(source: string): ObjMesh {
  return parseObjMeshInternal(source);
}

export function parseObjObjectMesh(source: string, objectName: string): ObjMesh {
  if (objectName.trim() === "") throw new Error("OBJ object name must not be empty");
  return parseObjMeshInternal(source, objectName);
}

export function parseObjObjectGeometryMesh(source: string, objectName: string): ObjMesh {
  if (objectName.trim() === "") throw new Error("OBJ object name must not be empty");
  return parseObjMeshInternal(source, objectName, false);
}
