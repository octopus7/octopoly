import type {
  PointerSample,
  ShadingProvider,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  ContractTestRenderExtensionRegistry,
  createContractTestExtensionHost,
} from "../../../src/optional-sdk/testkit";

const CAPABILITIES = Object.freeze({
  backend: "webgl2" as const,
  maxTextureSize: 4096,
  supportsFloatColorBuffer: false,
  applicationTextureBudgetBytes: 1024,
  applicationGpuBudgetBytes: 2048,
});

function pointer(phase: PointerSample["phase"]): PointerSample {
  return {
    pointerId: 7,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: 12,
    y: 34,
    pressure: phase === "down" ? 0.5 : 0,
    tiltX: 10,
    tiltY: -4,
    buttons: phase === "down" ? 1 : 0,
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    timestamp: 1,
    coalesced: false,
  };
}

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

describe("optional SDK contract testkit", () => {
  it("creates and repeatedly disposes a provider-zero host", () => {
    const host = createContractTestExtensionHost();

    expect(host.tools.active()).toBeNull();
    expect(host.shading.list()).toEqual([]);
    expect(host.panels.get("missing")).toBeNull();
    expect(host.renderer.capabilities()).toBeNull();
    expect(host.modeling.mesh.snapshot().version).toBe(0);
    expect(host.state.save()).toEqual({ values: {}, imageAssets: [] });

    host.dispose();
    expect(() => host.dispose()).not.toThrow();
  });

  it("keeps panel input local, tracks viewport, and emits cancel when a captured connection is disposed", () => {
    const host = createContractTestExtensionHost();
    const element = document.createElement("section");
    const surface = host.inputSurfaces.create(element, { touchAction: "none" });
    const samples: PointerSample[] = [];
    const viewports: number[] = [];
    surface.subscribeViewport((viewport) => { viewports.push(viewport.cssWidth); });
    const connection = surface.connect({
      dispatch: (sample) => {
        samples.push(sample);
        return sample.phase === "down"
          ? { handled: true, capturePointer: true }
          : { handled: true };
      },
    });

    surface.dispatch(pointer("down"));
    surface.setViewport({ cssWidth: 320, cssHeight: 240, devicePixelRatio: 2 });
    connection.dispose();

    expect(surface.element).toBe(element);
    expect(surface.options).toEqual({ touchAction: "none" });
    expect(samples.map((sample) => sample.phase)).toEqual(["down", "cancel"]);
    expect(samples[1]).toMatchObject({ x: 12, y: 34, pressure: 0, buttons: 0 });
    expect(viewports).toEqual([320]);
    host.dispose();
  });

  it("keeps the modeling facade stable and publishes document replacement for session cancellation", () => {
    const host = createContractTestExtensionHost();
    const facade = host.modeling;
    const changes: string[] = [];
    facade.subscribe((change) => { changes.push(change.kind); });
    const replacement = {
      mesh: facade.mesh,
      mutations: facade.mutations,
    };

    facade.replaceDocument(replacement);

    expect(host.modeling).toBe(facade);
    expect(changes).toEqual(["document"]);
    host.dispose();
  });

  it("models candidate fallback and scoped restoration without renderer concrete imports", () => {
    const registry = new ContractTestRenderExtensionRegistry(CAPABILITIES);
    const quality = provider("quality");
    const realtime = provider("realtime");
    registry.register(quality);
    registry.register(realtime);
    registry.fail("quality", "compile-failed", "shader error");

    const first = registry.activateScoped(["quality", "realtime"]);
    expect(first.snapshot()).toMatchObject({
      effectiveProviderId: "realtime",
      failures: [{ providerId: "quality", code: "compile-failed" }],
    });
    const override = registry.activateScoped(["quality"]);
    expect(registry.active()).toBeNull();
    override.dispose();
    expect(registry.active()).toBe("realtime");

    registry.dispose();
    expect(quality.dispose).toHaveBeenCalledTimes(1);
    expect(realtime.dispose).toHaveBeenCalledTimes(1);
  });
});
