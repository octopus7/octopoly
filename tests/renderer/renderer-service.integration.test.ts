import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangulationService,
  RenderSceneSnapshot,
  ShadingProvider,
} from "@octopoly/contracts";
import {
  createWebGL2Renderer,
  PreviewRenderPass,
  ReferenceRenderPass,
  WebGL2RendererService,
  WebGL2RenderExtensionRegistry,
} from "../../src/renderer";
import { createRetopoRenderPasses } from "../../src/renderer/retopo";
import { FakeWebGL2 as ReferenceFakeWebGL2 } from "./reference/fake-webgl2";

class IntegrationWebGL2 extends ReferenceFakeWebGL2 {
  readonly MAX_TEXTURE_SIZE = 0x0d33;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly DEPTH_BUFFER_BIT = 0x0100;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly LINES = 0x0001;
  readonly LINE_STRIP = 0x0003;
  readonly POINTS = 0x0000;
  readonly LESS = 0x0201;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;

  readonly arrayDraws: Array<readonly [number, number]> = [];
  drawingBufferWidth = 1;
  drawingBufferHeight = 1;

  getParameter(parameter: number): unknown {
    return parameter === this.MAX_TEXTURE_SIZE ? 8192 : null;
  }

  getExtension(name: string): object | null {
    return name === "EXT_color_buffer_float" ? {} : null;
  }

  viewport(_x: number, _y: number, width: number, height: number): void {
    this.drawingBufferWidth = width;
    this.drawingBufferHeight = height;
  }

  clearColor(): void {}
  clearDepth(): void {}
  clear(): void {}
  uniform1f(): void {}
  lineWidth(): void {}
  blendFunc(): void {}
  detachShader(): void {}

  getAttribLocation(_program: WebGLProgram, name: string): number {
    return name === "aPosition" ? 0 : -1;
  }

  drawArrays(mode: number, _first: number, count: number): void {
    this.arrayDraws.push([mode, count]);
  }
}

const attributes: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean {
    return false;
  },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _elementId: number): T | undefined {
    return undefined;
  },
};

function retopoMesh(): MeshSnapshot {
  return {
    version: 1,
    vertices: [
      { id: 1, position: { x: 0, y: 0, z: 0 } },
      { id: 2, position: { x: 1, y: 0, z: 0 } },
      { id: 3, position: { x: 0, y: 1, z: 0 } },
    ],
    edges: [
      { id: 4, vertices: [1, 2] },
      { id: 5, vertices: [2, 3] },
      { id: 6, vertices: [3, 1] },
    ],
    corners: [
      { id: 7, face: 10, vertex: 1, edge: 4 },
      { id: 8, face: 10, vertex: 2, edge: 5 },
      { id: 9, face: 10, vertex: 3, edge: 6 },
    ],
    faces: [{ id: 10, corners: [7, 8, 9] }],
    attributes,
  };
}

function triangle(): MeshTriangle {
  return {
    face: 10,
    corners: [7, 8, 9],
    vertices: [1, 2, 3],
    positions: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
  };
}

function scene(): RenderSceneSnapshot {
  const identity = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  return {
    camera: {
      view: { elements: identity },
      projection: { elements: identity },
      viewProjection: { elements: identity },
      position: { x: 0, y: 0, z: 4 },
    },
    viewport: { cssWidth: 160, cssHeight: 90, devicePixelRatio: 2 },
    reference: {
      version: 1,
      positions: [
        { x: -1, y: -1, z: -0.5 },
        { x: 2, y: -1, z: -0.5 },
        { x: -1, y: 2, z: -0.5 },
      ],
      indices: [0, 1, 2],
    },
    retopo: retopoMesh(),
    selection: {
      version: 1,
      vertices: new Set([1]),
      edges: new Set([4]),
      faces: new Set([10]),
    },
    preview: {
      id: "stroke",
      revision: 1,
      primitives: [
        {
          kind: "points",
          positions: [{ x: 0.25, y: 0.25, z: 0 }],
          color: { x: 1, y: 1, z: 0, w: 1 },
          sizeCssPx: 3,
        },
        {
          kind: "polyline",
          positions: [
            { x: 0, y: 0, z: 0 },
            { x: 0.5, y: 0.5, z: 0 },
          ],
          color: { x: 0, y: 1, z: 1, w: 1 },
          widthCssPx: 2,
        },
        {
          kind: "triangles",
          positions: [
            { x: 0, y: 0, z: 0 },
            { x: 0.25, y: 0, z: 0 },
            { x: 0, y: 0.25, z: 0 },
          ],
          color: { x: 1, y: 0, z: 1, w: 0.5 },
        },
      ],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderer service integration", () => {
  it("renders reference, retopo, selection, and every preview primitive from one scene", async () => {
    const gl = new IntegrationWebGL2();
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "getContext", {
      configurable: true,
      value: () => gl.context,
    });

    let scheduled: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 17;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const triangulation: MeshTriangulationService = {
      triangles: vi.fn(() => [triangle()]),
      raycast: vi.fn(() => null),
    };
    const renderer = createWebGL2Renderer(triangulation);

    await expect(renderer.initialize(canvas)).resolves.toMatchObject({
      status: "ready",
      capabilities: { backend: "webgl2" },
    });
    renderer.render(scene());
    expect([canvas.width, canvas.height]).toEqual([320, 180]);
    expect(scheduled).not.toBeNull();
    (scheduled as FrameRequestCallback | null)?.(0);

    expect(triangulation.triangles).toHaveBeenCalledTimes(1);
    expect(gl.draws).toEqual([[gl.TRIANGLES, 3, gl.UNSIGNED_INT, 0]]);
    expect(gl.arrayDraws).toEqual([
      [gl.TRIANGLES, 3],
      [gl.LINES, 6],
      [gl.POINTS, 3],
      [gl.TRIANGLES, 3],
      [gl.LINES, 2],
      [gl.POINTS, 1],
      [gl.POINTS, 1],
      [gl.LINE_STRIP, 2],
      [gl.TRIANGLES, 3],
    ]);

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(renderer.state()).toBe("context-lost");

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(renderer.state()).toBe("ready");
    renderer.dispose();
    renderer.dispose();
    expect(renderer.state()).toBe("disposed");
  });

  it("draws a usable generic provider instead of Core solid while preserving overlays", async () => {
    const gl = new IntegrationWebGL2();
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "getContext", {
      configurable: true,
      value: () => gl.context,
    });

    let scheduled: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 23;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const triangulation: MeshTriangulationService = {
      triangles: vi.fn(() => [triangle()]),
      raycast: vi.fn(() => null),
    };
    const provider: ShadingProvider & { disposeCount: number } = {
      id: "generic-solid",
      label: "Generic solid",
      disposeCount: 0,
      supports: () => true,
      program: () => ({
        language: "glsl-es-300",
        vertexShader: "#version 300 es\nlayout(location=0) in vec3 aPosition; void main(){gl_Position=vec4(aPosition,1.0);}",
        fragmentShader: "#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(0.5);}",
        attributes: [{ shaderName: "aPosition", source: "position" }],
      }),
      uniforms: () => ({}),
      dispose(): void {
        this.disposeCount += 1;
      },
    };
    const registry = new WebGL2RenderExtensionRegistry();
    registry.register(provider);
    const lease = registry.activateScoped([provider.id]);
    const retopo = createRetopoRenderPasses(triangulation);
    const renderer = new WebGL2RendererService(
      [
        new ReferenceRenderPass(),
        retopo.solid,
        retopo.overlay,
        new PreviewRenderPass(),
      ],
      registry,
      undefined,
      undefined,
      triangulation,
    );
    const fullScene = scene();
    const { preview: _preview, ...withoutPreview } = fullScene;
    const providerScene: RenderSceneSnapshot = {
      ...withoutPreview,
      selection: {
        version: 2,
        vertices: new Set(),
        edges: new Set(),
        faces: new Set(),
      },
    };

    await expect(renderer.initialize(canvas)).resolves.toMatchObject({ status: "ready" });
    renderer.render(providerScene);
    (scheduled as FrameRequestCallback | null)?.(0);

    expect(lease.snapshot().effectiveProviderId).toBe(provider.id);
    expect(gl.arrayDraws).toEqual([
      [gl.TRIANGLES, 3],
      [gl.LINES, 6],
      [gl.POINTS, 3],
    ]);

    renderer.dispose();
    expect(provider.disposeCount).toBe(1);
  });
});
