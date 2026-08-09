import type { MeshSnapshot, MeshTriangleHit, MeshTriangulationService, Ray } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { BarycentricUvProjector } from "../../../../src/extensions/texture-paint/projection";
import { PaintEligibilityService, PaintTargetAdapter } from "../../../../src/extensions/texture-paint/target";
import {
  TexturePaintBrushController,
  TexturePaintTool,
} from "../../../../src/extensions/texture-paint/extension";
import { TexturePaintImageController } from "../../../../src/extensions/texture-paint/image";
import { PaintHistoryFake } from "../session/history-fake";
import {
  FakePremultipliedPixelDecoder,
  ReplacementImageAssetService,
  pixelAt,
  solidPixels,
} from "../image/replacement-image-fake";
import {
  PAINT_IMAGE,
  PaintMeshQuery,
  PaintPicking,
  PaintTriangulation,
  pointer,
  toolContext,
} from "./fixture";

const SMALL_BRUSH = Object.freeze({
  radiusPx: 2,
  hardness: 1,
  opacity: 1,
  spacingPx: 2,
  pressureRadius: 0,
  pressureOpacity: 0,
});

async function harness(
  options: {
    readonly color?: readonly [number, number, number, number];
    readonly blendMode?: "paint" | "erase";
    readonly opacity?: number;
    readonly triangulation?: MeshTriangulationService;
  } = {},
) {
  const service = new ReplacementImageAssetService();
  service.seed(PAINT_IMAGE, solidPixels(PAINT_IMAGE.width, PAINT_IMAGE.height, [0, 0, 255, 255]));
  const images = new TexturePaintImageController(
    service,
    undefined,
    new FakePremultipliedPixelDecoder(),
  );
  await images.selectImage(PAINT_IMAGE);
  const mesh = new PaintMeshQuery();
  const triangulation = options.triangulation ?? new PaintTriangulation();
  const targets = new PaintTargetAdapter(triangulation);
  const brushes = new TexturePaintBrushController({
    ...SMALL_BRUSH,
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
  });
  const history = new PaintHistoryFake();
  const tool = new TexturePaintTool({
    images: service,
    imageController: images,
    picking: new PaintPicking(),
    triangulation,
    targets,
    eligibility: new PaintEligibilityService(targets),
    projector: new BarycentricUvProjector(),
    brushes,
    ...(options.color === undefined ? {} : { color: options.color }),
    ...(options.blendMode === undefined ? {} : { blendMode: options.blendMode }),
  });
  return { service, images, mesh, brushes, history, tool, context: toolContext(mesh, history) };
}

class MissBetweenCharts implements MeshTriangulationService {
  readonly #delegate = new PaintTriangulation();
  #calls = 0;
  triangles(_mesh: MeshSnapshot) { return this.#delegate.triangles(); }
  raycast(ray: Ray, mesh: MeshSnapshot): MeshTriangleHit | null {
    const call = this.#calls++;
    return call === 1 ? null : this.#delegate.raycast(ray, mesh);
  }
}

describe("replacement texture paint", () => {
  it("preserves coverage-outside pixels and source-over blends existing premultiplied pixels", async () => {
    const h = await harness({ color: [128, 0, 0, 128] });
    h.tool.pointer(pointer("down", 1), h.context);
    const current = h.service.current(PAINT_IMAGE.id)!;
    const pixels = h.service.pixels(current);

    expect(pixelAt(pixels, PAINT_IMAGE.width, 5, 21)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(pixels, PAINT_IMAGE.width, 7, 23)).toEqual([128, 0, 127, 255]);
    h.tool.pointer(pointer("cancel", 2), h.context);
    h.images.dispose();
    h.service.dispose();
  });

  it("uses existing destination alpha for erase attenuation", async () => {
    const h = await harness({ blendMode: "erase", opacity: 0.5 });
    h.tool.pointer(pointer("down", 1), h.context);
    const pixels = h.service.pixels(h.service.current(PAINT_IMAGE.id)!);

    expect(pixelAt(pixels, PAINT_IMAGE.width, 7, 23)).toEqual([0, 0, 128, 128]);
    h.tool.pointer(pointer("cancel", 2), h.context);
    h.images.dispose();
    h.service.dispose();
  });

  it("snapshots one BrushEngine for the full active stroke", async () => {
    const h = await harness();
    h.tool.pointer(pointer("down", 1), h.context);
    const firstCount = h.service.updates.length;
    h.brushes.setSettings({ ...SMALL_BRUSH, radiusPx: 20 });
    h.tool.pointer(pointer("move", 2), h.context);
    const moveUpdates = h.service.updates.slice(firstCount);

    expect(moveUpdates.length).toBeGreaterThan(0);
    expect(moveUpdates.every((update) => update.width <= 5 && update.height <= 5)).toBe(true);
    h.tool.pointer(pointer("cancel", 3), h.context);
    h.images.dispose();
    h.service.dispose();
  });

  it("breaks interpolation after a miss before entering another UV chart", async () => {
    const h = await harness({ triangulation: new MissBetweenCharts() });
    h.tool.pointer(pointer("down", 1), h.context);
    h.tool.pointer(pointer("move", 2), h.context);
    h.tool.pointer(pointer("move", 3), h.context);

    expect(h.service.updates).toHaveLength(2);
    h.tool.pointer(pointer("cancel", 4), h.context);
    h.images.dispose();
    h.service.dispose();
  });

  it("releases prepared edit locks before delayed undo/redo and disposes the underlying change once", async () => {
    const h = await harness();
    h.tool.pointer(pointer("down", 1), h.context);
    h.tool.pointer(pointer("up", 2), h.context);
    const committed = h.service.current(PAINT_IMAGE.id)!;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.service.openSessions()).toBe(1);

    h.history.undo();
    expect(h.service.current(PAINT_IMAGE.id)).toEqual(PAINT_IMAGE);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.service.openSessions()).toBe(1);
    h.history.redo();
    expect(h.service.current(PAINT_IMAGE.id)).toEqual(committed);

    h.history.clear();
    h.history.clear();
    expect(h.service.disposedChanges).toBe(1);
    h.images.dispose();
    h.service.dispose();
  });
});
