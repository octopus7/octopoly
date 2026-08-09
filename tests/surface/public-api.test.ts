import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ReferenceSurfaceFactory } from "@octopoly/contracts";

import * as surfaceApi from "../../src/surface";
import {
  ReferenceSurfaceFactoryImpl,
  createReferenceSurfaceFactory,
} from "../../src/surface";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../src/surface");

describe("surface local public API", () => {
  it("is assignable to the canonical factory contract", () => {
    const implementation: ReferenceSurfaceFactory = new ReferenceSurfaceFactoryImpl();
    const factory: ReferenceSurfaceFactory = createReferenceSurfaceFactory();

    expect(implementation).toBeInstanceOf(ReferenceSurfaceFactoryImpl);
    expect(factory).toBeInstanceOf(ReferenceSurfaceFactoryImpl);
  });

  it("exports only the factory provider and hides BVH/query/storage internals", () => {
    expect(Object.keys(surfaceApi).sort()).toEqual([
      "ReferenceSurfaceFactoryImpl",
      "createReferenceSurfaceFactory",
    ]);
    const entry = readFileSync(join(sourceRoot, "index.ts"), "utf8");
    expect(entry).not.toMatch(/spatial|bvh|SurfaceQueryImpl|PreparedReferenceGeometry/);
  });

  it("does not import concrete Mesh, Renderer, Retopo, DOM, or GPU packages", () => {
    const files = [
      "index.ts",
      "reference/factory.ts",
      "reference/surface.ts",
      "reference/geometry/prepared-reference-geometry.ts",
      "query/surface-query.ts",
      "query/candidate-source.ts",
      "query/triangle-math.ts",
      "spatial/aabb.ts",
      "spatial/bvh.ts",
    ];
    const source = files.map((file) => readFileSync(join(sourceRoot, file), "utf8")).join("\n");

    expect(source).not.toMatch(/from ["'][^"']*\/(mesh|renderer|retopo)(\/|["'])/i);
    expect(source).not.toMatch(/PointerEvent|HTMLCanvasElement|WebGL|GPUDevice/);
  });
});
