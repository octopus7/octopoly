import { describe, expect, it } from "vitest";
import type { ShadingCandidateFailure, ShadingProvider } from "@octopoly/contracts";

import { WebGL2RenderExtensionRegistry } from "../../../src/renderer/core/extension-registry";
import { FakeShadingProvider } from "./fakes";

describe("WebGL2RenderExtensionRegistry", () => {
  it("owns registration, duplicate rejection, unregister, and idempotent disposal", () => {
    const registry = new WebGL2RenderExtensionRegistry();
    const first = new FakeShadingProvider("first");
    const duplicate = new FakeShadingProvider("first");
    const second = new FakeShadingProvider("second");

    registry.register(first);
    registry.register(second);
    expect(registry.get("first")).toBe(first);
    expect(registry.get("missing")).toBeNull();
    expect(registry.list()).toEqual([first, second]);
    expect(() => registry.register(duplicate)).toThrow(/already registered/);
    expect(duplicate.disposeCount).toBe(0);
    expect(registry.active()).toBeNull();

    registry.unregister("first");
    registry.unregister("first");
    expect(first.disposeCount).toBe(1);
    expect(registry.list()).toEqual([second]);

    registry.dispose();
    registry.dispose();
    expect(second.disposeCount).toBe(1);
    expect(registry.active()).toBeNull();
    expect(() => registry.list()).toThrow(/disposed/);
  });

  it("evaluates candidates in order and publishes failure snapshots", () => {
    const registry = new WebGL2RenderExtensionRegistry();
    const quality = new FakeShadingProvider("quality");
    const realtime = new FakeShadingProvider("realtime");
    registry.register(quality);
    registry.register(realtime);
    const lease = registry.activateScoped(["missing", "quality", "realtime"]);
    const observed: string[] = [];
    lease.subscribe((snapshot) => {
      observed.push(`${snapshot.effectiveProviderId}:${snapshot.failures.map((entry) => entry.code).join(",")}`);
    });

    const snapshot = registry.evaluateActive((provider) => {
      if (provider.id === "quality") {
        return failure(provider, "compile-failed", "quality shader failed");
      }
      return null;
    });

    expect(snapshot.candidates).toEqual(["missing", "quality", "realtime"]);
    expect(snapshot.effectiveProviderId).toBe("realtime");
    expect(snapshot.failures).toEqual([
      {
        providerId: "missing",
        code: "missing",
        reason: "Provider 'missing' is not registered",
      },
      {
        providerId: "quality",
        code: "compile-failed",
        reason: "quality shader failed",
      },
    ]);
    expect(registry.active()).toBe("realtime");
    expect(observed).toEqual(["realtime:missing,compile-failed"]);
  });

  it("restores LIFO selection and leaves the top intact on non-sequential disposal", () => {
    const registry = new WebGL2RenderExtensionRegistry();
    for (const id of ["base", "middle", "top"]) {
      registry.register(new FakeShadingProvider(id));
    }

    const base = registry.activateScoped(["base"]);
    registry.evaluateActive(() => null);
    expect(registry.active()).toBe("base");

    const middle = registry.activateScoped(["middle"]);
    expect(registry.active()).toBe("middle");
    const top = registry.activateScoped(["top"]);
    expect(registry.active()).toBe("top");

    middle.dispose();
    expect(registry.active()).toBe("top");
    top.dispose();
    expect(registry.active()).toBe("base");
    base.dispose();
    expect(registry.active()).toBeNull();
    expect(() => middle.snapshot()).toThrow(/disposed/);
  });

  it("updates candidates and converts unregister to missing without implicit selection", () => {
    const registry = new WebGL2RenderExtensionRegistry();
    const provider = new FakeShadingProvider("provider");
    const fallback = new FakeShadingProvider("fallback");
    registry.register(provider);
    registry.register(fallback);
    const lease = registry.activateScoped(["provider", "fallback"]);
    registry.evaluateActive(() => null);
    expect(registry.active()).toBe("provider");

    registry.unregister("provider");
    expect(lease.snapshot().effectiveProviderId).toBe("fallback");
    expect(lease.snapshot().failures[0]?.code).toBe("missing");
    expect(provider.disposeCount).toBe(1);

    lease.setCandidates(["late"]);
    expect(lease.snapshot().effectiveProviderId).toBeNull();
    expect(lease.snapshot().failures[0]?.code).toBe("missing");
    const late = new FakeShadingProvider("late");
    registry.register(late);
    expect(registry.active()).toBeNull();
    registry.evaluateActive(() => null);
    expect(registry.active()).toBe("late");
  });

  it("updates inactive lease snapshots on unregister without changing the top", () => {
    const registry = new WebGL2RenderExtensionRegistry();
    const baseProvider = new FakeShadingProvider("base");
    const topProvider = new FakeShadingProvider("top");
    registry.register(baseProvider);
    registry.register(topProvider);
    const base = registry.activateScoped(["base"]);
    registry.evaluateActive(() => null);
    const top = registry.activateScoped(["top"]);
    expect(registry.active()).toBe("top");

    registry.unregister("base");
    expect(base.snapshot().effectiveProviderId).toBeNull();
    expect(base.snapshot().failures[0]?.code).toBe("missing");
    expect(top.snapshot().effectiveProviderId).toBe("top");
    expect(registry.active()).toBe("top");
  });
});

function failure(
  provider: ShadingProvider,
  code: ShadingCandidateFailure["code"],
  reason: string,
): ShadingCandidateFailure {
  return { providerId: provider.id, code, reason };
}
