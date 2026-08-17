export interface ObjMesh {
  positions: number[];
  indices: number[];
}

const OBJ_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const OBJ_NON_ZERO_INTEGER_SOURCE = "[+-]?0*[1-9]\\d*";
const OBJ_FACE_REFERENCE_PATTERN = new RegExp(
  `^(${OBJ_NON_ZERO_INTEGER_SOURCE})(?:/(?:${OBJ_NON_ZERO_INTEGER_SOURCE})(?:/(?:${OBJ_NON_ZERO_INTEGER_SOURCE}))?|//(?:${OBJ_NON_ZERO_INTEGER_SOURCE}))?$`,
);

function parseObjMeshInternal(source: string, selectedObjectName?: string): ObjMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  let currentObjectName: string | null = null;
  let selectedObjectSeen = false;

  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const content = lines[lineIndex]?.split("#", 1)[0]?.trim() ?? "";
    if (content === "") {
      continue;
    }
    const fields = content.split(/\s+/);

    if (fields[0] === "o") {
      currentObjectName = fields.slice(1).join(" ");
      if (currentObjectName === selectedObjectName) selectedObjectSeen = true;
    } else if (fields[0] === "v") {
      const coordinateTokens = fields.slice(1);
      const coordinates = coordinateTokens.map(Number);
      if (
        coordinates.length !== 3 ||
        !coordinateTokens.every((token) => OBJ_NUMBER_PATTERN.test(token)) ||
        !coordinates.every(Number.isFinite) ||
        !coordinates.every((coordinate) => Number.isFinite(Math.fround(coordinate)))
      ) {
        throw new Error(
          `OBJ vertex on line ${lineIndex + 1} must contain three finite coordinates`,
        );
      }
      positions.push(...coordinates);
    } else if (fields[0] === "f") {
      if (fields.length < 4) {
        throw new Error(
          `OBJ face on line ${lineIndex + 1} must contain at least three vertices`,
        );
      }
      const vertexIndex = (token: string | undefined): number => {
        const referenceMatch = token?.match(OBJ_FACE_REFERENCE_PATTERN);
        const indexToken = referenceMatch?.[1] ?? token?.split("/", 1)[0];
        if (!referenceMatch && token?.includes("/")) {
          throw new Error(
            `OBJ face vertex reference "${token}" on line ${lineIndex + 1} must match v, v/vt, v//vn, or v/vt/vn with non-zero integer components`,
          );
        }
        const index = Number(indexToken);
        if (!referenceMatch || !Number.isInteger(index) || index === 0) {
          throw new Error(
            `OBJ face vertex index "${indexToken}" on line ${lineIndex + 1} must be a non-zero integer`,
          );
        }
        const vertexCount = positions.length / 3;
        const resolvedIndex = index > 0 ? index - 1 : vertexCount + index;
        if (resolvedIndex < 0 || resolvedIndex >= vertexCount) {
          throw new Error(
            `OBJ face vertex index "${indexToken}" on line ${lineIndex + 1} is out of range for ${vertexCount} vertices`,
          );
        }
        return resolvedIndex;
      };
      const faceIndices = fields.slice(1).map(vertexIndex);
      if (selectedObjectName === undefined || currentObjectName === selectedObjectName) {
        const first = faceIndices[0]!;
        for (let vertex = 1; vertex < faceIndices.length - 1; vertex += 1) {
          indices.push(first, faceIndices[vertex]!, faceIndices[vertex + 1]!);
        }
      }
    }
  }

  if (positions.length === 0) {
    throw new Error("OBJ mesh must contain at least one vertex");
  }
  if (selectedObjectName !== undefined && !selectedObjectSeen) {
    throw new Error(`OBJ object "${selectedObjectName}" was not found`);
  }
  if (indices.length === 0) {
    throw new Error(selectedObjectName === undefined
      ? "OBJ mesh must contain at least one face"
      : `OBJ object "${selectedObjectName}" must contain at least one face`);
  }
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
