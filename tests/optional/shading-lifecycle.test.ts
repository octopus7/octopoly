import type {
  ExtensionHost,
  OptionalExtension,
  RendererCapabilities,
  ShadingProvider,
  ShadingSelectionLease,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import { createOptionalComposition, defineOptionalManifest } from "../../src/optional";
import { createContractTestExtensionHost } from "../../src/optional-sdk/testkit";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 64 * 1024 * 1024,
  applicationGpuBudgetBytes: 128 * 1024 * 1024,
});

function provider(id: string): ShadingProvider {
  return {
    id,
    label: id,
    supports: () => true,
    program: () => ({ language: "glsl-es-300", vertexShader: "", fragmentShader: "" }),
    uniforms: () => Object.freeze({}),
    dispose: vi.fn(),
  };
}

function shadingExtension(
  id: string,
  providerId: string,
  capture: (lease: ShadingSelectionLease) => void,
): OptionalExtension {
  return {
    id,
    activate(host: ExtensionHost) {
      host.shading.register(provider(providerId));
      const lease = host.shading.activateScoped([providerId]);
      capture(lease);
      return { status: "activated" };
    },
    dispose: vi.fn(),
  };
}

describe("owner-scoped shading coordination", () => {
  it("keeps activation leases dormant, promotes the latest user choice, and restores previous mode", async () => {
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    host.shading.register(provider("core-base"));
    const baseLease = host.shading.activateScoped(["core-base"]);
    let firstLease!: ShadingSelectionLease;
    let secondLease!: ShadingSelectionLease;
    const composition = createOptionalComposition(host, defineOptionalManifest([
      {
        feature: "lookdev",
        create: () => shadingExtension("first", "first-provider", (lease) => { firstLease = lease; }),
      },
      {
        feature: "matcap",
        create: () => shadingExtension("second", "second-provider", (lease) => { secondLease = lease; }),
      },
    ]));

    await composition.start();

    expect(host.shading.active()).toBe("core-base");
    expect(firstLease.snapshot()).toMatchObject({
      candidates: ["first-provider"],
      effectiveProviderId: null,
    });
    expect(secondLease.snapshot()).toMatchObject({
      candidates: ["second-provider"],
      effectiveProviderId: null,
    });

    expect(composition.selectShading("first").effectiveProviderId).toBe("first-provider");
    expect(host.shading.active()).toBe("first-provider");
    expect(composition.selectShading("second").effectiveProviderId).toBe("second-provider");
    expect(host.shading.active()).toBe("second-provider");

    firstLease.setCandidates(["first-provider"]);
    expect(host.shading.active()).toBe("first-provider");
    secondLease.setCandidates(["second-provider"]);
    expect(host.shading.active()).toBe("second-provider");

    composition.deactivate("first");
    expect(host.shading.active()).toBe("second-provider");
    firstLease.dispose();
    expect(host.shading.active()).toBe("second-provider");

    composition.deactivate("second");
    expect(host.shading.active()).toBe("core-base");
    secondLease.dispose();
    expect(host.shading.active()).toBe("core-base");

    baseLease.dispose();
    composition.dispose();
  });

  it("keeps a failing top lease as Core fallback and restores the previous valid lease on release", async () => {
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    let firstLease!: ShadingSelectionLease;
    let failingLease!: ShadingSelectionLease;
    const composition = createOptionalComposition(host, defineOptionalManifest([
      {
        feature: "lookdev",
        create: () => shadingExtension("first", "realtime", (lease) => { firstLease = lease; }),
      },
      {
        feature: "matcap",
        create: () => shadingExtension("failing", "matcap", (lease) => { failingLease = lease; }),
      },
    ]));

    await composition.start();
    firstLease.setCandidates(["realtime"]);
    expect(host.shading.active()).toBe("realtime");

    host.shading.fail("matcap", "compile-failed", "fixture compile failure");
    failingLease.setCandidates(["matcap"]);
    expect(host.shading.active()).toBeNull();
    expect(failingLease.snapshot()).toEqual({
      candidates: ["matcap"],
      effectiveProviderId: null,
      failures: [{
        providerId: "matcap",
        code: "compile-failed",
        reason: "fixture compile failure",
      }],
    });

    composition.deactivate("failing");
    expect(host.shading.active()).toBe("realtime");
    composition.deactivate("first");
    expect(host.shading.active()).toBeNull();

    composition.dispose();
  });
});
