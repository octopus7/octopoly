import { describe, expect, it } from "vitest";
import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  MeshTriangle,
  RenderSceneSnapshot,
} from "@octopoly/contracts";

import { WebGL2RenderExtensionRegistry } from "../../../src/renderer/core/extension-registry";
import { WebGL2RendererService } from "../../../src/renderer/core/renderer-service";
import {
  createFakeCanvas,
  createScene,
  FakeRenderPass,
  FakeShadingProvider,
  FakeTriangulationService,
  ManualFrameScheduler,
} from "./fakes";

describe("WebGL2 shading isolation", () => {
  it("falls through failed GLSL candidates and keeps the Core pass rendering", async () => {
    const { canvas } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const registry = new WebGL2RenderExtensionRegistry();
    const pass = new FakeRenderPass();
    const quality = new FakeShadingProvider("quality");
    quality.descriptor = {
      ...quality.descriptor,
      vertexShader: "#version 300 es\nFAIL_COMPILE",
    };
    const realtime = new FakeShadingProvider("realtime");
    registry.register(quality);
    registry.register(realtime);
    const lease = registry.activateScoped(["quality", "realtime"]);
    const renderer = new WebGL2RendererService(
      [pass],
      registry,
      scheduler.schedule,
      scheduler.cancel,
      new FakeTriangulationService(),
    );
    await renderer.initialize(canvas);

    renderer.render(createScene());
    scheduler.flush();

    expect(lease.snapshot().effectiveProviderId).toBe("realtime");
    expect(lease.snapshot().failures).toEqual([
      {
        providerId: "quality",
        code: "compile-failed",
        reason: "fake shader compile failure",
      },
    ]);
    expect(pass.renderCount).toBe(1);
  });

  it("isolates WGSL, supports, program, uniforms, and missing-attribute failures", async () => {
    const { canvas } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const registry = new WebGL2RenderExtensionRegistry();
    const pass = new FakeRenderPass();

    const wgsl = new FakeShadingProvider("wgsl");
    wgsl.descriptor = { ...wgsl.descriptor, language: "wgsl" };
    const unsupported = new FakeShadingProvider("unsupported");
    unsupported.supported = false;
    const program = new FakeShadingProvider("program");
    program.programError = new Error("descriptor exploded");
    const uniforms = new FakeShadingProvider("uniforms");
    uniforms.uniformsError = new Error("uniforms exploded");
    const attribute = new FakeShadingProvider("attribute");
    attribute.descriptor = {
      ...attribute.descriptor,
      attributes: [{
        shaderName: "customValue",
        source: "meshAttribute",
        key: { domain: "corner", name: "custom" },
      }],
    };
    const good = new FakeShadingProvider("good");
    good.uniformValues = {
      scalar: 1,
      point: { x: 1, y: 2, z: 3 },
      matrix: createScene().camera.view,
      array: [1, 2, 3, 4],
    };

    for (const provider of [wgsl, unsupported, program, uniforms, attribute, good]) {
      registry.register(provider);
    }
    const lease = registry.activateScoped([
      "wgsl",
      "unsupported",
      "program",
      "uniforms",
      "attribute",
      "good",
    ]);
    const renderer = new WebGL2RendererService(
      [pass],
      registry,
      scheduler.schedule,
      scheduler.cancel,
      new FakeTriangulationService(),
    );
    await renderer.initialize(canvas);
    renderer.render(createScene());
    scheduler.flush();

    expect(lease.snapshot().effectiveProviderId).toBe("good");
    expect(lease.snapshot().failures.map((entry) => entry.code)).toEqual([
      "unsupported",
      "unsupported",
      "compile-failed",
      "uniforms-failed",
      "unsupported",
    ]);
    expect(pass.renderCount).toBe(1);
  });

  it("isolates link failure and disposes compiled programs/providers exactly once", async () => {
    const failingContext = createFakeCanvas();
    failingContext.gl.linkSucceeds = false;
    const failingScheduler = new ManualFrameScheduler();
    const failingRegistry = new WebGL2RenderExtensionRegistry();
    const failingProvider = new FakeShadingProvider("linked");
    failingRegistry.register(failingProvider);
    const failingLease = failingRegistry.activateScoped(["linked"]);
    const fallbackPass = new FakeRenderPass();
    const failingRenderer = new WebGL2RendererService(
      [fallbackPass],
      failingRegistry,
      failingScheduler.schedule,
      failingScheduler.cancel,
      new FakeTriangulationService(),
    );
    await failingRenderer.initialize(failingContext.canvas);
    failingRenderer.render(createScene());
    failingScheduler.flush();
    expect(failingLease.snapshot().failures[0]?.code).toBe("compile-failed");
    expect(fallbackPass.renderCount).toBe(1);
    expect(failingContext.gl.deletedPrograms).toHaveLength(1);

    const readyContext = createFakeCanvas();
    const readyScheduler = new ManualFrameScheduler();
    const readyRegistry = new WebGL2RenderExtensionRegistry();
    const readyProvider = new FakeShadingProvider("ready");
    readyRegistry.register(readyProvider);
    readyRegistry.activateScoped(["ready"]);
    const readyPass = new FakeRenderPass();
    const readyRenderer = new WebGL2RendererService(
      [readyPass],
      readyRegistry,
      readyScheduler.schedule,
      readyScheduler.cancel,
      new FakeTriangulationService(),
    );
    await readyRenderer.initialize(readyContext.canvas);
    readyRenderer.render(createScene());
    readyScheduler.flush();
    expect(readyContext.gl.createdPrograms).toHaveLength(1);

    readyRenderer.dispose();
    readyRenderer.dispose();
    expect(readyContext.gl.deletedPrograms).toHaveLength(1);
    expect(readyProvider.disposeCount).toBe(1);
    expect(readyPass.disposeCount).toBe(1);
  });

  it("expands canonical triangle position, normal, and generic domain attributes deterministically", async () => {
    const { canvas, gl } = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const registry = new WebGL2RenderExtensionRegistry();
    const basePass = new FakeRenderPass("base", "base", gl.events);
    const fallbackPass = new FakeRenderPass("fallback", "fallback", gl.events);
    const overlayPass = new FakeRenderPass("overlay", "overlay", gl.events);
    const triangle: MeshTriangle = {
      face: 10,
      corners: [11, 12, 13],
      vertices: [1, 2, 3],
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
    };
    const provider = new FakeShadingProvider("generic");
    provider.descriptor = {
      ...provider.descriptor,
      attributes: [
        { shaderName: "position", source: "position" },
        { shaderName: "normal", source: "normal" },
        {
          shaderName: "vertexValue",
          source: "meshAttribute",
          key: { domain: "vertex", name: "vertex-value" },
        },
        {
          shaderName: "cornerValue",
          source: "meshAttribute",
          key: { domain: "corner", name: "corner-value" },
        },
        {
          shaderName: "faceValue",
          source: "meshAttribute",
          key: { domain: "face", name: "face-value" },
        },
      ],
    };
    registry.register(provider);
    const lease = registry.activateScoped(["generic"]);
    const renderer = new WebGL2RendererService(
      [overlayPass, fallbackPass, basePass],
      registry,
      scheduler.schedule,
      scheduler.cancel,
      new FakeTriangulationService([triangle]),
    );
    await renderer.initialize(canvas);
    const scene = sceneWithAttributes(1, new FixtureAttributes({
      "vertex:vertex-value:1": 0.1,
      "vertex:vertex-value:2": 0.2,
      "vertex:vertex-value:3": 0.3,
      "corner:corner-value:11": { x: 0, y: 0 },
      "corner:corner-value:12": { x: 1, y: 0 },
      "corner:corner-value:13": { x: 0, y: 1 },
      "face:face-value:10": { x: 1, y: 0.5, z: 0.25, w: 1 },
    }));

    renderer.render(scene);
    scheduler.flush();

    expect(lease.snapshot().effectiveProviderId).toBe("generic");
    expect(gl.bufferUploads).toEqual([
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      expectApprox([0.1, 0.2, 0.3]),
      [0, 0, 1, 0, 0, 1],
      [1, 0.5, 0.25, 1, 1, 0.5, 0.25, 1, 1, 0.5, 0.25, 1],
    ]);
    expect(gl.vertexAttribPointers).toEqual([[0, 3], [1, 3], [2, 1], [3, 2], [4, 4]]);
    expect(gl.drawCalls).toEqual([[gl.TRIANGLES, 0, 3]]);
    expect(gl.events).toEqual(["base", "provider", "overlay"]);
    expect(fallbackPass.renderCount).toBe(0);

    renderer.render(scene);
    scheduler.flush();
    expect(gl.bufferUploads).toHaveLength(5);
    expect(gl.drawCalls).toHaveLength(2);

    renderer.render(sceneWithAttributes(2, scene.retopo.attributes));
    scheduler.flush();
    expect(gl.bufferUploads).toHaveLength(10);
    expect(gl.deletedBuffers).toHaveLength(5);
    expect(gl.deletedVertexArrays).toHaveLength(1);

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(gl.deletedBuffers).toHaveLength(5);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    scheduler.flush();
    expect(gl.bufferUploads).toHaveLength(15);
    expect(gl.createdPrograms).toHaveLength(2);

    renderer.dispose();
    expect(gl.deletedBuffers).toHaveLength(10);
    expect(gl.deletedVertexArrays).toHaveLength(2);
    expect(gl.deletedPrograms).toHaveLength(1);
  });

  it("falls back for incompatible generic attributes or missing triangulation", async () => {
    const incompatibleContext = createFakeCanvas();
    const scheduler = new ManualFrameScheduler();
    const registry = new WebGL2RenderExtensionRegistry();
    const provider = new FakeShadingProvider("incompatible");
    provider.descriptor = {
      ...provider.descriptor,
      attributes: [{
        shaderName: "vertexValue",
        source: "meshAttribute",
        key: { domain: "vertex", name: "label" },
      }],
    };
    registry.register(provider);
    const lease = registry.activateScoped(["incompatible"]);
    const triangle: MeshTriangle = {
      face: 1,
      corners: [1, 2, 3],
      vertices: [1, 2, 3],
      positions: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
    };
    const phaseEvents = incompatibleContext.gl.events;
    const basePass = new FakeRenderPass("base", "base", phaseEvents);
    const fallbackPass = new FakeRenderPass("fallback", "fallback", phaseEvents);
    const overlayPass = new FakeRenderPass("overlay", "overlay", phaseEvents);
    const renderer = new WebGL2RendererService(
      [overlayPass, fallbackPass, basePass],
      registry,
      scheduler.schedule,
      scheduler.cancel,
      new FakeTriangulationService([triangle]),
    );
    await renderer.initialize(incompatibleContext.canvas);
    renderer.render(sceneWithAttributes(1, new FixtureAttributes({
      "vertex:label:1": "first",
      "vertex:label:2": "second",
      "vertex:label:3": "third",
    })));
    scheduler.flush();
    expect(lease.snapshot().effectiveProviderId).toBeNull();
    expect(lease.snapshot().failures[0]).toMatchObject({ code: "unsupported" });
    expect(incompatibleContext.gl.drawCalls).toEqual([]);
    expect(fallbackPass.renderCount).toBe(1);
    expect(phaseEvents).toEqual(["base", "fallback", "overlay"]);

    const missingContext = createFakeCanvas();
    const missingScheduler = new ManualFrameScheduler();
    const missingRegistry = new WebGL2RenderExtensionRegistry();
    const missingProvider = new FakeShadingProvider("missing-triangulation");
    missingRegistry.register(missingProvider);
    const missingLease = missingRegistry.activateScoped(["missing-triangulation"]);
    const missingRenderer = new WebGL2RendererService(
      [],
      missingRegistry,
      missingScheduler.schedule,
      missingScheduler.cancel,
    );
    await missingRenderer.initialize(missingContext.canvas);
    missingRenderer.render(createScene());
    missingScheduler.flush();
    expect(missingLease.snapshot().effectiveProviderId).toBeNull();
    expect(missingLease.snapshot().failures[0]?.reason).toMatch(/MeshTriangulationService/);
    expect(missingContext.gl.drawCalls).toEqual([]);
  });
});

class FixtureAttributes implements AttributeSnapshot {
  constructor(readonly values: Readonly<Record<string, AttributeValue>>) {}

  has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return Object.keys(this.values).some((entry) => entry.startsWith(`${key.domain}:${key.name}:`));
  }

  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    return this.values[`${key.domain}:${key.name}:${elementId}`] as T | undefined;
  }
}

function sceneWithAttributes(version: number, attributes: AttributeSnapshot): RenderSceneSnapshot {
  const base = createScene();
  return Object.freeze({
    ...base,
    retopo: Object.freeze({ ...base.retopo, version, attributes }),
  });
}

function expectApprox(values: ReadonlyArray<number>): ReadonlyArray<unknown> {
  return values.map((value) => expect.closeTo(value, 5));
}
