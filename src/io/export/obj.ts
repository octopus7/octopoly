import type { SerializedMesh, TriangleMeshSnapshot } from "@octopoly/contracts";
import { toTriangleMesh } from "./mesh";

function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError("OBJ geometry must be finite");
  return Object.is(value, -0) ? "0" : String(value);
}

/** Serialize a canonical mesh to OBJ, converting project units at the boundary. */
export function exportObj(
  source: TriangleMeshSnapshot | SerializedMesh,
  sourceUnitsPerProjectUnit = 1,
): string {
  if (!Number.isFinite(sourceUnitsPerProjectUnit) || sourceUnitsPerProjectUnit <= 0) {
    throw new RangeError("sourceUnitsPerProjectUnit must be finite and greater than zero");
  }
  const mesh = toTriangleMesh(source);
  const lines = ["# OctoPoly OBJ"];
  for (const position of mesh.positions) {
    lines.push(`v ${decimal(position.x * sourceUnitsPerProjectUnit)} ${decimal(position.y * sourceUnitsPerProjectUnit)} ${decimal(position.z * sourceUnitsPerProjectUnit)}`);
  }
  if (mesh.normals) {
    for (const normal of mesh.normals) lines.push(`vn ${decimal(normal.x)} ${decimal(normal.y)} ${decimal(normal.z)}`);
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index]! + 1;
    const b = mesh.indices[index + 1]! + 1;
    const c = mesh.indices[index + 2]! + 1;
    lines.push(mesh.normals ? `f ${a}//${a} ${b}//${b} ${c}//${c}` : `f ${a} ${b} ${c}`);
  }
  return `${lines.join("\n")}\n`;
}
