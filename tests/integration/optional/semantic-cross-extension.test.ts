import type {
  AttributeKey,
  AttributeValue,
  ImageAssetRef,
  MeshDocument,
  RendererCapabilities,
  ToolContext,
  Vec2,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { LookdevExtension, LOOKDEV_QUALITY_PROVIDER_ID } from "../../../src/extensions/lookdev";
import {
  MATCAP_EXTENSION_ID,
  MATCAP_PANEL_ID,
  MATCAP_SHADING_PROVIDER_ID,
  MatcapExtension,
} from "../../../src/extensions/matcap";
import {
  TexturePaintExtension,
  type TextureImagePixelDecoder,
} from "../../../src/extensions/texture-paint";
import { UV0_ATTRIBUTE, UvEditorExtension } from "../../../src/extensions/uv";
import { createHistoryService } from "../../../src/history";
import { MeshKernelFactory } from "../../../src/mesh";
import { createMeshTriangulationService, createPickingService } from "../../../src/picking";
import {
  createContractTestExtensionHost,
  createExtensionRuntime,
  type ContractTestExtensionHost,
} from "../../../src/optional-sdk";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 8192,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 512 * 1024 * 1024,
  applicationGpuBudgetBytes: 256 * 1024 * 1024,
});

const PAINT_REF: ImageAssetRef = Object.freeze({
  id: "semantic-paint-target",
  revision: 0,
  width: 32,
  height: 32,
  colorSpace: "srgb",
});

const PIXEL_DECODER: TextureImagePixelDecoder = Object.freeze({
  async decode(_bitmap: ImageBitmap, ref: ImageAssetRef): Promise<Uint8ClampedArray> {
    return new Uint8ClampedArray(ref.width * ref.height * 4);
  },
});

describe("Full Optional semantic extension combinations", () => {
  it.each([
    ["imported/project uv0", true, null],
    ["no UV", false, "missing-uv"],
  ] as const)("keeps Paint-only behavior isolated for %s", async (_label, withUv, expectedReason) => {
    const fixture = createModelingFixture(withUv);
    const paint = new TexturePaintExtension({ pixelDecoder: PIXEL_DECODER });
    fixture.host.images.seed(PAINT_REF);

    expect(paint.activate(fixture.host)).toEqual({ status: "activated" });
    await expect(paint.selectImage(PAINT_REF)).resolves.toMatchObject({ status: "ready" });
    expect(paint.tool().disabledReason(toolContext(fixture.host))).toBe(expectedReason);
    expect(fixture.host.modeling.mesh.snapshot().faces).toHaveLength(1);
    expect(fixture.host.renderer.capabilities()).toEqual(CAPABILITIES);

    paint.dispose();
    fixture.history.clear();
    fixture.host.dispose();
    fixture.mesh.dispose();
  });

  it("updates Paint eligibility after UV projection, undo, and redo without replacing the document", async () => {
    const fixture = createModelingFixture(false);
    const runtime = createExtensionRuntime(fixture.host);
    const uv = new UvEditorExtension();
    const paint = new TexturePaintExtension({ pixelDecoder: PIXEL_DECODER });
    fixture.host.images.seed(PAINT_REF);

    await expect(runtime.activate(uv)).resolves.toEqual({ status: "activated" });
    await expect(runtime.activate(paint)).resolves.toEqual({ status: "activated" });
    await expect(paint.selectImage(PAINT_REF)).resolves.toMatchObject({ status: "ready" });
    expect(paint.tool().disabledReason(toolContext(fixture.host))).toBe("missing-uv");

    expect(uv.panel()?.runCommand("planar")).toMatchObject({ status: "applied" });
    fixture.host.modeling.emit({
      kind: "mesh",
      meshVersion: fixture.mesh.snapshot().version,
    });
    expect(fixture.mesh.snapshot().attributes.has(UV0_ATTRIBUTE)).toBe(true);
    expect(paint.tool().disabledReason(toolContext(fixture.host))).toBeNull();
    expect(fixture.history.snapshot()).toMatchObject({ canUndo: true, undoLabel: "Planar UV" });

    fixture.history.undo();
    fixture.host.modeling.emit({ kind: "mesh", meshVersion: fixture.mesh.snapshot().version });
    expect(paint.tool().disabledReason(toolContext(fixture.host))).toBe("missing-uv");

    fixture.history.redo();
    fixture.host.modeling.emit({ kind: "mesh", meshVersion: fixture.mesh.snapshot().version });
    expect(paint.tool().disabledReason(toolContext(fixture.host))).toBeNull();

    runtime.dispose();
    fixture.history.clear();
    fixture.mesh.dispose();
  });

  it("switches Lookdev and MatCap both directions and restores the previous valid mode", async () => {
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      images: { importWidth: 256, importHeight: 256 },
    });
    const runtime = createExtensionRuntime(host);
    const lookdev = new LookdevExtension({ initialPreset: "quality" });
    const matcap = new MatcapExtension();

    await expect(runtime.activate(lookdev)).resolves.toEqual({ status: "activated" });
    await expect(runtime.activate(matcap)).resolves.toEqual({ status: "activated" });
    expect(host.shading.active()).toBe(LOOKDEV_QUALITY_PROVIDER_ID);

    const container = document.createElement("div");
    host.panels.get(MATCAP_PANEL_ID)?.mount(container, host.panelContext());
    const enabled = container.querySelector<HTMLInputElement>("[data-matcap-enabled]");
    expect(enabled).not.toBeNull();
    enabled!.checked = true;
    enabled!.dispatchEvent(new Event("change"));
    expect(host.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);

    enabled!.checked = false;
    enabled!.dispatchEvent(new Event("change"));
    expect(host.shading.active()).toBe(LOOKDEV_QUALITY_PROVIDER_ID);

    enabled!.checked = true;
    enabled!.dispatchEvent(new Event("change"));
    runtime.deactivate(lookdev.id);
    expect(host.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);
    runtime.deactivate(MATCAP_EXTENSION_ID);
    expect(host.shading.active()).toBeNull();
    runtime.dispose();
  });
});

interface ModelingFixture {
  readonly mesh: MeshDocument;
  readonly history: ReturnType<typeof createHistoryService>;
  readonly host: ContractTestExtensionHost;
}

function createModelingFixture(withUv: boolean): ModelingFixture {
  const mesh = new MeshKernelFactory().createEmpty();
  const vertexIds = [
    mesh.execute("v0", { kind: "createVertex", position: { x: 0, y: 0, z: 0 } }).created.vertices?.[0],
    mesh.execute("v1", { kind: "createVertex", position: { x: 1, y: 0, z: 0 } }).created.vertices?.[0],
    mesh.execute("v2", { kind: "createVertex", position: { x: 0, y: 1, z: 0 } }).created.vertices?.[0],
  ];
  if (vertexIds.some((id) => id === undefined)) throw new Error("Triangle vertex creation failed");
  mesh.execute("triangle", {
    kind: "createFace",
    vertices: vertexIds as [number, number, number],
  });

  if (withUv) {
    const corners = mesh.snapshot().faces[0]?.corners;
    if (corners === undefined || corners.length !== 3) throw new Error("Triangle corners are unavailable");
    const values = new Map<number, AttributeValue | undefined>([
      [corners[0]!, Object.freeze({ x: 0, y: 0 } satisfies Vec2)],
      [corners[1]!, Object.freeze({ x: 1, y: 0 } satisfies Vec2)],
      [corners[2]!, Object.freeze({ x: 0, y: 1 } satisfies Vec2)],
    ]);
    mesh.execute("seed uv0", {
      kind: "setAttribute",
      key: UV0_ATTRIBUTE as AttributeKey<AttributeValue>,
      values,
    });
  }

  const history = createHistoryService();
  const host = createContractTestExtensionHost({
    capabilities: CAPABILITIES,
    modeling: {
      mesh,
      mutations: mesh,
      history,
      picking: createPickingService(),
      triangulation: createMeshTriangulationService(),
    },
  });
  return { mesh, history, host };
}

function toolContext(host: ContractTestExtensionHost): ToolContext {
  return {
    mesh: host.modeling.mesh,
    mutations: host.modeling.mutations,
    selection: host.modeling.selection,
    history: host.modeling.history,
    surface: { raycast: () => null, nearest: () => null },
    getCamera: () => host.modeling.getCamera(),
    getViewport: () => host.modeling.getViewport(),
    setPreview: () => {},
    requestRender: () => {},
  };
}
