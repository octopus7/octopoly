import { describe, expect, it } from "vitest";

import {
  createDefaultFacialWorkspace,
  createPlaceholderMask,
  duplicateBaseMesh,
  isValidMeshGeometry,
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

  it.each(["", "   ", "base"])("rejects invalid duplicate mesh id %j", (copyId) => {
    const workspace = createDefaultFacialWorkspace();

    expect(duplicateBaseMesh(workspace, copyId)).toBe(workspace);
  });

  it("rejects a duplicate mesh id that already exists", () => {
    const workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");

    expect(duplicateBaseMesh(workspace, "copy-1")).toBe(workspace);
  });

  it("renames a copied mesh with a trimmed name", () => {
    const duplicated = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const renamed = renameMesh(duplicated, "copy-1", "  Smile Wide  ");

    expect(renamed.meshes.find((mesh) => mesh.id === "copy-1")?.name).toBe("Smile Wide");
  });

  it("keeps the copy name when a blank rename is requested", () => {
    const workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");

    const renamed = renameMesh(workspace, "copy-1", "   ");

    expect(renamed).toBe(workspace);
    expect(renamed.meshes[1]?.name).toBe("Base Mask Copy 1");
  });

  it("keeps the base mesh name immutable", () => {
    const workspace = createDefaultFacialWorkspace();
    const renamed = renameMesh(workspace, "base", "Changed Base");

    expect(renamed.meshes[0]?.name).toBe("Base Mask");
  });

  it("keeps the same workspace when a base rename is requested", () => {
    const workspace = createDefaultFacialWorkspace();

    const renamed = renameMesh(workspace, "base", "Changed Base");

    expect(renamed).toBe(workspace);
  });

  it("keeps the base mesh name immutable when replacing its geometry", () => {
    const workspace = createDefaultFacialWorkspace();
    const importedGeometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };

    const imported = replaceBaseMesh(workspace, importedGeometry);

    expect(imported.meshes[0]?.name).toBe("Base Mask");
  });

  it("selects an existing mesh as active", () => {
    const duplicated = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const selected = selectMesh(duplicated, "base");

    expect(selected.activeMeshId).toBe("base");
  });

  it("keeps the same workspace when the active mesh is selected again", () => {
    const workspace = createDefaultFacialWorkspace();

    const selected = selectMesh(workspace, "base");

    expect(selected).toBe(workspace);
  });

  it("moves one vertex on one axis without mutating the source workspace", () => {
    const workspace = createDefaultFacialWorkspace();
    const originalPositions = [...(workspace.meshes[0]?.geometry.positions ?? [])];
    const moved = moveVertex(workspace, "base", 0, "x", 0.5);

    expect(moved.meshes[0]?.geometry.positions[0]).toBe((originalPositions[0] ?? 0) + 0.5);
    expect(moved.meshes[0]?.geometry.positions.slice(1)).toEqual(originalPositions.slice(1));
    expect(workspace.meshes[0]?.geometry.positions).toEqual(originalPositions);
  });

  it("ignores a vertex move that overflows Float32", () => {
    const workspace = createDefaultFacialWorkspace();

    const moved = moveVertex(workspace, "base", 0, "x", Number.MAX_VALUE);

    expect(moved).toBe(workspace);
  });

  it("ignores a vertex move that would overflow generated Float32 normals", () => {
    const workspace = replaceBaseMesh(createDefaultFacialWorkspace(), {
      positions: [0, 0, 0, 1.8e19, 0, 0, 0, 1.8e19, 0],
      indices: [0, 1, 2],
    });

    const moved = moveVertex(workspace, "base", 1, "x", 2e18);

    expect(moved).toBe(workspace);
  });

  it("replaces the placeholder and copies with one imported base mesh", () => {
    const workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    const importedGeometry = {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const imported = replaceBaseMesh(workspace, importedGeometry);

    expect(imported.activeMeshId).toBe("base");
    expect(imported.meshes).toHaveLength(1);
    expect(imported.meshes[0]).toMatchObject({ id: "base", name: "Base Mask", kind: "base" });
    expect(imported.meshes[0]?.geometry).toEqual(importedGeometry);
    expect(imported.meshes[0]?.geometry.positions).not.toBe(importedGeometry.positions);
  });

  it("rejects invalid replacement geometry", () => {
    const workspace = createDefaultFacialWorkspace();

    const replaced = replaceBaseMesh(workspace, {
      positions: [0, 0, Number.MAX_VALUE],
      indices: [0, 1, 9],
    });

    expect(replaced).toBe(workspace);
  });

  it("rejects geometry whose generated Float32 normals overflow", () => {
    const workspace = createDefaultFacialWorkspace();

    const replaced = replaceBaseMesh(workspace, {
      positions: [3e38, 3e38, 0, -3e38, 3e38, 0, 3e38, -3e38, 0],
      indices: [0, 1, 2],
    });

    expect(replaced).toBe(workspace);
  });

  it("rejects geometry whose complete bounds cannot be framed in Float32 camera space", () => {
    expect(isValidMeshGeometry({
      positions: [
        -1e38, -1e38, -1e38,
        1e38, 1e38, 1e38,
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ],
      indices: [2, 3, 4],
    })).toBe(false);
  });
});
