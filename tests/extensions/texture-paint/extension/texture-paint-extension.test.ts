import type { ShadingProvider } from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  TEXTURE_PAINT_PANEL_ID,
  TEXTURE_PAINT_TOOL_ID,
  TEXTURE_PREVIEW_PROVIDER_ID,
  TexturePaintExtension,
  TexturePreviewShadingProvider,
} from "../../../../src/extensions/texture-paint/extension";
import {
  CONTRACT_TEST_CAMERA,
  CONTRACT_TEST_VIEWPORT,
  createContractTestExtensionHost,
} from "../../../../src/optional-sdk/testkit";
import { PaintHistoryFake } from "../session/history-fake";
import {
  PAINT_IMAGE,
  PaintMeshQuery,
  PaintPicking,
  PaintTriangulation,
  TRANSPARENT_PIXEL_DECODER,
  pointer,
  toolContext,
} from "./fixture";

const CAPABILITIES = Object.freeze({
  backend: "webgl2" as const,
  maxTextureSize: 4096,
  supportsFloatColorBuffer: false,
  applicationTextureBudgetBytes: 16 * 1024 * 1024,
  applicationGpuBudgetBytes: 32 * 1024 * 1024,
});

function provider(id: string): ShadingProvider {
  return {
    id,
    label: id,
    supports: () => true,
    program: () => ({ language: "glsl-es-300", vertexShader: "", fragmentShader: "" }),
    uniforms: () => ({}),
    dispose: vi.fn(),
  };
}

describe("TexturePaintExtension", () => {
  it("requests canonical uv0 and supplies camera/image uniforms with safe unsupported fallback", () => {
    let active = PAINT_IMAGE as typeof PAINT_IMAGE | null;
    const preview = new TexturePreviewShadingProvider(() => active);
    const mesh = new PaintMeshQuery().snapshot();
    const input = Object.freeze({
      scene: Object.freeze({
        camera: CONTRACT_TEST_CAMERA,
        viewport: CONTRACT_TEST_VIEWPORT,
        retopo: mesh,
        selection: Object.freeze({
          version: 0,
          vertices: new Set<number>(),
          edges: new Set<number>(),
          faces: new Set<number>(),
        }),
      }),
    });

    expect(preview.program()).toMatchObject({
      language: "glsl-es-300",
      attributes: [{ shaderName: "aPosition", source: "position" }, {
        shaderName: "aTextureUv",
        source: "meshAttribute",
        key: { domain: "corner", name: "uv0" },
      }],
    });
    expect(preview.program().vertexShader).toContain(
      "gl_Position = uViewProjection * vec4(aPosition, 1.0)",
    );
    expect(preview.program().fragmentShader).toContain("1.0 - vTextureUv.y");
    expect(preview.uniforms(input)).toEqual({
      uViewProjection: CONTRACT_TEST_CAMERA.viewProjection,
      uPaintTexture: PAINT_IMAGE,
    });
    expect(preview.supports(CAPABILITIES)).toBe(true);
    expect(preview.supports({ ...CAPABILITIES, backend: "webgpu" })).toBe(false);

    active = null;
    expect(preview.supports(CAPABILITIES)).toBe(false);
    expect(() => preview.uniforms(input)).toThrow("preview image is unavailable");
    preview.dispose();
  });

  it("activates without UV Editor, reports missing UV, and restores the previous scoped shading provider", async () => {
    const mesh = new PaintMeshQuery(false);
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      modeling: {
        mesh,
        history: new PaintHistoryFake(),
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    const previous = provider("previous-preview");
    host.shading.register(previous);
    const previousLease = host.shading.activateScoped([previous.id]);
    const extension = new TexturePaintExtension({ pixelDecoder: TRANSPARENT_PIXEL_DECODER });

    expect(extension.activate(host)).toEqual({ status: "activated" });
    await expect(extension.selectImage(PAINT_IMAGE)).resolves.toMatchObject({ status: "ready" });
    expect(extension.tool().evaluateDisabled(mesh.snapshot())).toBe("missing-uv");
    expect(host.shading.active()).toBe(TEXTURE_PREVIEW_PROVIDER_ID);
    expect(host.panels.get(TEXTURE_PAINT_PANEL_ID)).toBe(extension.panel());
    expect(extension.activateToolScoped()).toBeDefined();
    expect(host.tools.active()?.id).toBe(TEXTURE_PAINT_TOOL_ID);
    extension.setPreviewEnabled(false);
    expect(host.shading.active()).toBe(previous.id);
    extension.setPreviewEnabled(true);
    expect(host.shading.active()).toBe(TEXTURE_PREVIEW_PROVIDER_ID);

    extension.dispose();
    expect(() => extension.dispose()).not.toThrow();
    expect(host.shading.active()).toBe(previous.id);
    expect(host.shading.get(TEXTURE_PREVIEW_PROVIDER_ID)).toBeNull();
    expect(host.panels.get(TEXTURE_PAINT_PANEL_ID)).toBeNull();
    previousLease.dispose();
    host.dispose();
  });

  it("round-trips active image and brush state while preserving unknown extension data", async () => {
    const mesh = new PaintMeshQuery();
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      modeling: {
        mesh,
        history: new PaintHistoryFake(),
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    await host.state.load({
      unknown: Object.freeze({ schemaVersion: 7, data: Object.freeze({ preserved: true }) }),
    });
    const first = new TexturePaintExtension({ pixelDecoder: TRANSPARENT_PIXEL_DECODER });
    first.activate(host);
    await first.selectImage(PAINT_IMAGE);
    first.setBrushSettings({ radiusPx: 5, opacity: 0.4 });
    const saved = host.state.save();
    first.dispose();

    const restored = new TexturePaintExtension({ pixelDecoder: TRANSPARENT_PIXEL_DECODER });
    restored.activate(host);
    await host.state.load(saved.values);

    expect(restored.activeImage()).toEqual(PAINT_IMAGE);
    expect(restored.brushSettings()).toMatchObject({ radiusPx: 5, opacity: 0.4 });
    expect(host.state.save().values.unknown).toEqual(saved.values.unknown);
    restored.dispose();
    host.dispose();
  });

  it("cancels the image edit and history transaction when the project document changes", async () => {
    const mesh = new PaintMeshQuery();
    const history = new PaintHistoryFake();
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      modeling: {
        mesh,
        history,
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    const extension = new TexturePaintExtension({ pixelDecoder: TRANSPARENT_PIXEL_DECODER });
    extension.activate(host);
    await extension.selectImage(PAINT_IMAGE);
    const context = toolContext(mesh, history);

    expect(extension.tool().pointer(pointer("down", 1), context)).toMatchObject({
      handled: true,
      capturePointer: true,
    });
    expect(host.images.current(PAINT_IMAGE.id)?.revision).toBeGreaterThan(0);

    host.modeling.replaceDocument({ mesh, mutations: host.modeling.mutations });

    expect(host.images.current(PAINT_IMAGE.id)).toEqual(PAINT_IMAGE);
    expect(history.snapshot().canUndo).toBe(false);
    expect(extension.activeImage()).toBeNull();
    expect(extension.tool().pointer(pointer("up", 2), context)).toEqual({ handled: false });
    extension.dispose();
    host.dispose();
  });

  it("writes multiple spaced move stamps and keeps controller revisions synchronized through undo/redo", async () => {
    const mesh = new PaintMeshQuery();
    const history = new PaintHistoryFake();
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      modeling: {
        mesh,
        history,
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    const extension = new TexturePaintExtension({
      brush: { radiusPx: 2, spacingPx: 2 },
      pixelDecoder: TRANSPARENT_PIXEL_DECODER,
    });
    extension.activate(host);
    await extension.selectImage(PAINT_IMAGE);
    const context = toolContext(mesh, history);

    extension.tool().pointer(pointer("down", 1), context);
    extension.tool().pointer(pointer("move", 2), context);
    extension.tool().pointer(pointer("up", 3), context);

    const committed = host.images.current(PAINT_IMAGE.id);
    expect(committed?.revision).toBeGreaterThan(1);
    expect(history.snapshot()).toMatchObject({ canUndo: true, undoLabel: "Texture Paint Stroke" });
    expect(extension.activeImage()).toEqual(committed);

    history.undo();
    expect(extension.activeImage()).toEqual(PAINT_IMAGE);
    history.redo();
    expect(extension.activeImage()).toEqual(committed);
    extension.dispose();
    host.dispose();
  });
});
