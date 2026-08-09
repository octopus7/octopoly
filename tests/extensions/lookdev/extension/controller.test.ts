import { describe, expect, it } from "vitest";

import {
  ContractTestRenderControl,
  ContractTestRenderExtensionRegistry,
} from "../../../../src/optional-sdk/testkit";
import { LOOKDEV_REALTIME_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/realtime";
import { LOOKDEV_QUALITY_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/quality";
import {
  LookdevController,
  candidatesFor,
} from "../../../../src/extensions/lookdev/extension";
import { QUALITY_CAPABILITIES, TrackingProvider } from "./fakes";

describe("LookdevController", () => {
  it("uses only scoped quality/realtime candidates and restores the previous selection", () => {
    const registry = new ContractTestRenderExtensionRegistry(QUALITY_CAPABILITIES);
    const renderer = new ContractTestRenderControl(QUALITY_CAPABILITIES);
    const base = new TrackingProvider("paint.preview");
    registry.register(base);
    const baseLease = registry.activateScoped([base.id]);
    registry.register(new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID));
    registry.register(new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID));
    registry.fail(LOOKDEV_QUALITY_PROVIDER_ID, "compile-failed", "quality shader failed");

    const controller = new LookdevController(registry, renderer, "quality");
    expect(controller.snapshot()).toMatchObject({
      preset: "quality",
      candidates: [LOOKDEV_QUALITY_PROVIDER_ID, LOOKDEV_REALTIME_PROVIDER_ID],
      effectiveProviderId: LOOKDEV_REALTIME_PROVIDER_ID,
      fallback: {
        kind: "provider-failure",
        providerId: LOOKDEV_QUALITY_PROVIDER_ID,
        failureCode: "compile-failed",
      },
    });
    expect(registry.active()).toBe(LOOKDEV_REALTIME_PROVIDER_ID);

    controller.dispose();
    expect(registry.active()).toBe(base.id);
    baseLease.dispose();
    registry.dispose();
  });

  it("switches realtime to the exact single candidate and publishes Core fallback failures", () => {
    const registry = new ContractTestRenderExtensionRegistry(QUALITY_CAPABILITIES);
    const renderer = new ContractTestRenderControl(QUALITY_CAPABILITIES);
    registry.register(new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID));
    registry.register(new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID));
    registry.fail(LOOKDEV_QUALITY_PROVIDER_ID, "unsupported", "unsupported quality");
    registry.fail(LOOKDEV_REALTIME_PROVIDER_ID, "uniforms-failed", "invalid material snapshot");
    const controller = new LookdevController(registry, renderer, "quality");

    expect(controller.snapshot()).toMatchObject({
      effectiveProviderId: null,
      failures: [
        { providerId: LOOKDEV_QUALITY_PROVIDER_ID, code: "unsupported" },
        { providerId: LOOKDEV_REALTIME_PROVIDER_ID, code: "uniforms-failed" },
      ],
      fallback: { kind: "invalid-material", providerId: LOOKDEV_REALTIME_PROVIDER_ID },
    });
    registry.clearFailure(LOOKDEV_REALTIME_PROVIDER_ID);
    controller.setPreset("realtime");
    expect(controller.snapshot()).toMatchObject({
      preset: "realtime",
      candidates: [LOOKDEV_REALTIME_PROVIDER_ID],
      effectiveProviderId: LOOKDEV_REALTIME_PROVIDER_ID,
      failures: [],
      fallback: null,
    });
    expect(renderer.requestCount()).toBe(1);
    expect(candidatesFor("quality")).toEqual([
      LOOKDEV_QUALITY_PROVIDER_ID,
      LOOKDEV_REALTIME_PROVIDER_ID,
    ]);
    controller.dispose();
    registry.dispose();
  });

  it("classifies deterministic capability and budget degradation", () => {
    const budgetCapabilities = Object.freeze({
      ...QUALITY_CAPABILITIES,
      applicationGpuBudgetBytes: 1,
    });
    const registry = new ContractTestRenderExtensionRegistry(budgetCapabilities);
    const renderer = new ContractTestRenderControl(budgetCapabilities);
    registry.register(new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID));
    const quality = new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID);
    quality.supported = false;
    registry.register(quality);
    const controller = new LookdevController(registry, renderer, "quality");

    expect(controller.snapshot()).toMatchObject({
      effectiveProviderId: LOOKDEV_REALTIME_PROVIDER_ID,
      fallback: { kind: "resource-budget", providerId: LOOKDEV_QUALITY_PROVIDER_ID },
    });
    controller.dispose();
    registry.dispose();
  });
});
