import { describe, expect, it } from "vitest";

import { createExtensionStateRegistry } from "../../../../src/optional-sdk/state";
import { LOOKDEV_REALTIME_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/realtime";
import { LOOKDEV_QUALITY_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/quality";
import {
  LOOKDEV_STATE_ID,
  LookdevExtension,
} from "../../../../src/extensions/lookdev/extension";
import {
  QUALITY_CAPABILITIES,
  RejectingStateRegistry,
  TrackingProvider,
  TrackingRenderRegistry,
  createHost,
} from "./fakes";

describe("LookdevExtension lifecycle", () => {
  it("registers each provider once and unregisters before idempotent provider disposal", () => {
    const events: string[] = [];
    const shading = new TrackingRenderRegistry(events);
    const realtime = new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID, events);
    const quality = new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID, events);
    const host = createHost({ shading });
    const extension = new LookdevExtension({ realtimeProvider: realtime, qualityProvider: quality });

    expect(extension.activate(host)).toEqual({ status: "activated" });
    expect(extension.activate(host)).toMatchObject({ status: "failed" });
    expect(shading.list().map((provider) => provider.id)).toEqual([
      LOOKDEV_REALTIME_PROVIDER_ID,
      LOOKDEV_QUALITY_PROVIDER_ID,
    ]);

    extension.dispose();
    extension.dispose();

    expect(shading.list()).toEqual([]);
    expect(realtime.disposeCount).toBe(1);
    expect(quality.disposeCount).toBe(1);
    expect(events.indexOf(`unregister:${LOOKDEV_QUALITY_PROVIDER_ID}`)).toBeLessThan(
      events.indexOf(`dispose:${LOOKDEV_QUALITY_PROVIDER_ID}`),
    );
    expect(events.indexOf(`unregister:${LOOKDEV_REALTIME_PROVIDER_ID}`)).toBeLessThan(
      events.indexOf(`dispose:${LOOKDEV_REALTIME_PROVIDER_ID}`),
    );
    host.dispose();
  });

  it("rolls back provider registration in reverse after a partial activation failure", () => {
    const events: string[] = [];
    const shading = new TrackingRenderRegistry(events, {
      failRegistrationId: LOOKDEV_QUALITY_PROVIDER_ID,
    });
    const realtime = new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID, events);
    const quality = new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID, events);
    const host = createHost({ shading });
    const extension = new LookdevExtension({ realtimeProvider: realtime, qualityProvider: quality });

    expect(extension.activate(host)).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("registration rejected"),
    });
    expect(shading.list()).toEqual([]);
    expect(shading.active()).toBeNull();
    expect(events).toEqual([
      `register:${LOOKDEV_REALTIME_PROVIDER_ID}`,
      `register:${LOOKDEV_QUALITY_PROVIDER_ID}`,
      `dispose:${LOOKDEV_QUALITY_PROVIDER_ID}`,
      `unregister:${LOOKDEV_REALTIME_PROVIDER_ID}`,
      `dispose:${LOOKDEV_REALTIME_PROVIDER_ID}`,
    ]);
    extension.dispose();
    expect(realtime.disposeCount).toBe(1);
    expect(quality.disposeCount).toBe(1);
    host.dispose();
  });

  it("rolls back panel, lease, and providers when state registration fails", () => {
    const events: string[] = [];
    const shading = new TrackingRenderRegistry(events);
    const base = new TrackingProvider("paint.preview", events);
    shading.register(base);
    const baseLease = shading.activateScoped([base.id]);
    const state = new RejectingStateRegistry(createExtensionStateRegistry(), LOOKDEV_STATE_ID);
    const host = createHost({ shading, state });
    const extension = new LookdevExtension({
      realtimeProvider: new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID, events),
      qualityProvider: new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID, events),
      initialPreset: "quality",
    });

    expect(extension.activate(host)).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("state rejected"),
    });
    expect(host.panels.get("octopoly.lookdev.panel")).toBeNull();
    expect(shading.list().map((provider) => provider.id)).toEqual([base.id]);
    expect(shading.active()).toBe(base.id);
    expect(extension.controller()).toBeNull();
    expect(extension.stateProvider()).toBeNull();
    extension.dispose();
    baseLease.dispose();
    host.dispose();
  });

  it("leaves Core selection provider-free when the backend is unsupported", () => {
    const events: string[] = [];
    const shading = new TrackingRenderRegistry(events);
    const realtime = new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID, events);
    const quality = new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID, events);
    const host = createHost({
      shading,
      capabilities: Object.freeze({ ...QUALITY_CAPABILITIES, backend: "webgpu" }),
    });
    const extension = new LookdevExtension({ realtimeProvider: realtime, qualityProvider: quality });

    expect(extension.activate(host)).toMatchObject({ status: "unsupported" });
    expect(shading.list()).toEqual([]);
    expect(shading.active()).toBeNull();
    expect(realtime.disposeCount).toBe(1);
    expect(quality.disposeCount).toBe(1);
    extension.dispose();
    host.dispose();
  });
});
