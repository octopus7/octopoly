import type {
  ExtensionStateContribution,
  ImageAssetRef,
  RendererCapabilities,
  ShadingProvider,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import {
  LOOKDEV_QUALITY_PROVIDER_ID,
  LOOKDEV_REALTIME_PROVIDER_ID,
  LOOKDEV_STATE_ID,
  LOOKDEV_STATE_SCHEMA_VERSION,
  LookdevController,
  LookdevExtension,
  LookdevMaterialStore,
  WebGL2PbrShadingProvider,
  WebGL2QualityShadingProvider,
} from "../../../../src/extensions/lookdev";
import { createExtensionRuntime } from "../../../../src/optional-sdk/runtime";
import {
  ContractTestRenderControl,
  ContractTestRenderExtensionRegistry,
  createContractTestExtensionHost,
} from "../../../../src/optional-sdk/testkit";
import { createScene } from "../../../renderer/core/fakes";
import { createWebGl2ProviderHarness } from "../../../optional-sdk/webgl2/harness";

const QUALITY_CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 8_192,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 512 * 1024 * 1024,
  applicationGpuBudgetBytes: 256 * 1024 * 1024,
});

describe("lookdev optional entrypoint", () => {
  it("activates additively and round-trips migrated lookdev plus unknown image state", async () => {
    const image = imageRef("shared-lookdev", 7);
    const host = createContractTestExtensionHost({ capabilities: QUALITY_CAPABILITIES });
    host.images.seed(image);
    const runtime = createExtensionRuntime(host);
    const extension = new LookdevExtension({ initialPreset: "quality" });

    await expect(runtime.activate(extension)).resolves.toEqual({ status: "activated" });
    expect(runtime.active()).toEqual([extension.id]);
    expect(host.shading.list().map((provider) => provider.id)).toEqual([
      LOOKDEV_REALTIME_PROVIDER_ID,
      LOOKDEV_QUALITY_PROVIDER_ID,
    ]);
    expect(host.shading.active()).toBe(LOOKDEV_QUALITY_PROVIDER_ID);

    const lookdevV1: ExtensionStateContribution = Object.freeze({
      schemaVersion: 1,
      data: Object.freeze({
        activePreset: "quality",
        material: Object.freeze({
          id: "painted",
          baseColor: Object.freeze({ x: 0.25, y: 0.5, z: 0.75 }),
          textures: Object.freeze({ baseColor: jsonImageRef(image) }),
        }),
      }),
      imageAssets: Object.freeze([image]),
    });
    const unknown: ExtensionStateContribution = Object.freeze({
      schemaVersion: 5,
      data: Object.freeze({ owner: "another-extension" }),
      imageAssets: Object.freeze([image]),
    });
    await host.state.load(Object.freeze({
      [LOOKDEV_STATE_ID]: lookdevV1,
      "unknown.extension": unknown,
    }));

    const saved = host.state.save();
    expect(saved.values[LOOKDEV_STATE_ID]).toMatchObject({
      schemaVersion: LOOKDEV_STATE_SCHEMA_VERSION,
      data: { preset: "quality", materials: [{ id: "painted" }] },
      imageAssets: [{ id: image.id, revision: image.revision }],
    });
    expect(saved.values["unknown.extension"]).toEqual(unknown);
    expect(saved.imageAssets).toEqual([image]);

    await host.images.flush(saved.imageAssets);
    expect(host.images.lastFlush()).toEqual([image]);

    runtime.deactivate(extension.id);
    expect(host.shading.list()).toEqual([]);
    expect(host.shading.active()).toBeNull();
    expect(host.panels.get("octopoly.lookdev.panel")).toBeNull();
    expect(host.state.save().values[LOOKDEV_STATE_ID]).toBeDefined();
    runtime.dispose();
  });

  it("degrades compile failure to realtime, then missing realtime to Core fallback", async () => {
    const materials = new LookdevMaterialStore();
    const quality = new WebGL2QualityShadingProvider(materials);
    const realtime = new WebGL2PbrShadingProvider(materials);
    const compileFailingQuality: ShadingProvider = {
      id: quality.id,
      label: quality.label,
      supports: (capabilities) => quality.supports(capabilities),
      program: () => Object.freeze({
        ...quality.program(),
        vertexShader: "#version 300 es\nFAIL_COMPILE",
      }),
      uniforms: (input) => quality.uniforms(input),
      dispose: () => quality.dispose(),
    };
    const harness = await createWebGl2ProviderHarness({
      providers: [compileFailingQuality, realtime],
      candidates: [LOOKDEV_QUALITY_PROVIDER_ID, LOOKDEV_REALTIME_PROVIDER_ID],
    });

    harness.renderer.render(createScene());
    harness.scheduler.flush();
    expect(harness.lease.snapshot()).toMatchObject({
      effectiveProviderId: LOOKDEV_REALTIME_PROVIDER_ID,
      failures: [{ providerId: LOOKDEV_QUALITY_PROVIDER_ID, code: "compile-failed" }],
    });
    expect(harness.fallbackPass.renderCount).toBe(0);

    harness.registry.unregister(LOOKDEV_REALTIME_PROVIDER_ID);
    harness.renderer.render(createScene());
    harness.scheduler.flush();
    expect(harness.lease.snapshot()).toMatchObject({
      effectiveProviderId: null,
      failures: [
        { providerId: LOOKDEV_QUALITY_PROVIDER_ID, code: "compile-failed" },
        { providerId: LOOKDEV_REALTIME_PROVIDER_ID, code: "missing" },
      ],
    });
    expect(harness.fallbackPass.renderCount).toBe(1);
    harness.renderer.dispose();
  });

  it("preserves a later MatCap lease and restores Paint then Core across out-of-order disposal", () => {
    const materials = new LookdevMaterialStore();
    const registry = new ContractTestRenderExtensionRegistry(QUALITY_CAPABILITIES);
    const renderer = new ContractTestRenderControl(QUALITY_CAPABILITIES);
    const paint = simpleProvider("paint.preview");
    const matcap = simpleProvider("matcap.preview");
    registry.register(paint);
    const paintLease = registry.activateScoped([paint.id]);
    registry.register(new WebGL2PbrShadingProvider(materials));
    registry.register(new WebGL2QualityShadingProvider(materials));
    const lookdev = new LookdevController(registry, renderer, "quality");
    registry.register(matcap);
    const matcapLease = registry.activateScoped([matcap.id]);

    expect(registry.active()).toBe(matcap.id);
    lookdev.dispose();
    expect(registry.active()).toBe(matcap.id);
    matcapLease.dispose();
    expect(registry.active()).toBe(paint.id);
    paintLease.dispose();
    expect(registry.active()).toBeNull();
    registry.dispose();
  });
});

function imageRef(id: string, revision: number): ImageAssetRef {
  return Object.freeze({
    id,
    revision,
    width: 64,
    height: 64,
    colorSpace: "srgb",
  });
}

function jsonImageRef(ref: ImageAssetRef) {
  return Object.freeze({
    id: ref.id,
    revision: ref.revision,
    width: ref.width,
    height: ref.height,
    colorSpace: ref.colorSpace,
  });
}

function simpleProvider(id: string): ShadingProvider {
  return {
    id,
    label: id,
    supports: () => true,
    program: () => Object.freeze({
      language: "glsl-es-300",
      vertexShader: "#version 300 es\nvoid main(){gl_Position=vec4(0.0);}",
      fragmentShader: "#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1.0);}",
    }),
    uniforms: () => Object.freeze({}),
    dispose: () => {},
  };
}
