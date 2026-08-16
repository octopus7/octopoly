import { describe, expect, it } from "vitest";

import {
  createDefaultFacialWorkspace,
  createPlaceholderMask,
  duplicateBaseMesh,
  moveVertex,
  renameMesh,
  replaceBaseMesh,
  selectMesh,
} from "../src/facial/workspace";

function triangleCenters(geometry: ReturnType<typeof createPlaceholderMask>): [number, number][] {
  return Array.from({ length: geometry.indices.length / 3 }, (_, triangleIndex): [number, number] => {
    const vertexIndices = geometry.indices.slice(triangleIndex * 3, triangleIndex * 3 + 3);
    const coordinates = vertexIndices.map((vertexIndex) =>
      geometry.positions.slice(vertexIndex * 3, vertexIndex * 3 + 3));
    return [
      coordinates.reduce((sum, coordinate) => sum + (coordinate[0] ?? 0), 0) / 3,
      coordinates.reduce((sum, coordinate) => sum + (coordinate[1] ?? 0), 0) / 3,
    ];
  });
}

describe("facial workspace", () => {
  it("starts with one active base mask", () => {
    const workspace = createDefaultFacialWorkspace();

    expect(workspace.version).toBe(1);
    expect(workspace.activeMeshId).toBe("base");
    expect(workspace.meshes).toHaveLength(1);
    expect(workspace.meshes[0]).toMatchObject({
      id: "base",
      name: "Base Mask",
      kind: "base",
    });
    expect(workspace.meshes[0]?.geometry.positions.length).toBeGreaterThan(0);
    expect(workspace.meshes[0]?.geometry.indices.length).toBeGreaterThan(0);
  });

  it("builds a bilaterally symmetric low-poly placeholder", () => {
    const geometry = createPlaceholderMask();
    const vertices = Array.from({ length: geometry.positions.length / 3 }, (_, index): [number, number, number] => [
      geometry.positions[index * 3] ?? 0,
      geometry.positions[index * 3 + 1] ?? 0,
      geometry.positions[index * 3 + 2] ?? 0,
    ]);

    expect(vertices.length).toBeGreaterThan(40);
    for (const [x, y, z] of vertices) {
      expect(vertices.some(([otherX, otherY, otherZ]) =>
        Math.abs(otherX + x) < 1e-6
        && Math.abs(otherY - y) < 1e-6
        && Math.abs(otherZ - z) < 1e-6)).toBe(true);
    }
  });

  it("leaves symmetric eye openings without triangles", () => {
    const geometry = createPlaceholderMask();
    const centers = triangleCenters(geometry);
    const insideEye = ([x, y]: readonly [number, number], centerX: number): boolean =>
      ((x - centerX) / 0.55) ** 2 + ((y - 0.8) / 0.38) ** 2 < 1;

    expect(centers.some((center) => insideEye(center, -0.85))).toBe(false);
    expect(centers.some((center) => insideEye(center, 0.85))).toBe(false);
  });

  it("leaves a centered mouth opening without triangles", () => {
    const centers = triangleCenters(createPlaceholderMask());
    const insideMouth = ([x, y]: readonly [number, number]): boolean =>
      (x / 0.9) ** 2 + ((y + 0.8) / 0.3) ** 2 < 1;

    expect(centers.some(insideMouth)).toBe(false);
  });

  it("duplicates the base mesh as an independent active copy", () => {
    const original = createDefaultFacialWorkspace();
    const duplicated = duplicateBaseMesh(original, "copy-1");

    expect(duplicated.meshes).toHaveLength(2);
    expect(duplicated.activeMeshId).toBe("copy-1");
    expect(duplicated.meshes[1]).toMatchObject({
      id: "copy-1",
      name: "Base Mask Copy 1",
      kind: "copy",
    });
    expect(duplicated.meshes[1]?.geometry).toEqual(original.meshes[0]?.geometry);
    expect(duplicated.meshes[1]?.geometry.positions).not.toBe(original.meshes[0]?.geometry.positions);
    expect(original.meshes).toHaveLength(1);
  });

  it("renames a copied mesh with a trimmed name", () => {
    const duplicated = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const renamed = renameMesh(duplicated, "copy-1", "  Smile Wide  ");

    expect(renamed.meshes.find((mesh) => mesh.id === "copy-1")?.name).toBe("Smile Wide");
  });

  it("keeps the base mesh name immutable", () => {
    const workspace = createDefaultFacialWorkspace();
    const renamed = renameMesh(workspace, "base", "Changed Base");

    expect(renamed.meshes[0]?.name).toBe("Base Mask");
  });

  it("selects an existing mesh as active", () => {
    const duplicated = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const selected = selectMesh(duplicated, "base");

    expect(selected.activeMeshId).toBe("base");
  });

  it("moves one vertex on one axis without mutating the source workspace", () => {
    const workspace = createDefaultFacialWorkspace();
    const originalPositions = [...(workspace.meshes[0]?.geometry.positions ?? [])];
    const moved = moveVertex(workspace, "base", 0, "x", 0.5);

    expect(moved.meshes[0]?.geometry.positions[0]).toBe((originalPositions[0] ?? 0) + 0.5);
    expect(moved.meshes[0]?.geometry.positions.slice(1)).toEqual(originalPositions.slice(1));
    expect(workspace.meshes[0]?.geometry.positions).toEqual(originalPositions);
  });

  it("replaces the placeholder and copies with one imported base mesh", () => {
    const workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const importedGeometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const imported = replaceBaseMesh(workspace, importedGeometry, "Imported Face");

    expect(imported.activeMeshId).toBe("base");
    expect(imported.meshes).toHaveLength(1);
    expect(imported.meshes[0]).toMatchObject({ id: "base", name: "Imported Face", kind: "base" });
    expect(imported.meshes[0]?.geometry).toEqual(importedGeometry);
    expect(imported.meshes[0]?.geometry.positions).not.toBe(importedGeometry.positions);
  });
});
