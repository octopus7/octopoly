import type {
  RendererCapabilities,
  ShadingProgramDescriptor,
  ShadingProvider,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  MATCAP_EXTENSION_ID,
  MATCAP_PANEL_ID,
  MatcapExtension,
} from "../../../../src/extensions/matcap/extension";
import {
  MATCAP_SHADING_PROVIDER_ID,
  WebGL2MatcapShadingProvider,
} from "../../../../src/extensions/matcap/webgl2";
import { createContractTestExtensionHost } from "../../../../src/optional-sdk/testkit";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 32 * 1024 * 1024,
  applicationGpuBudgetBytes: 64 * 1024 * 1024,
});

function host(capabilities: RendererCapabilities = CAPABILITIES) {
  return createContractTestExtensionHost({
    capabilities,
    images: { importWidth: 256, importHeight: 256, colorSpace: "srgb" },
  });
}

function pbrProvider(): ShadingProvider {
  const descriptor: ShadingProgramDescriptor = Object.freeze({
    language: "glsl-es-300",
    vertexShader: "#version 300 es\nvoid main(){gl_Position=vec4(0.0);}",
    fragmentShader: "#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1.0);}",
  });
  return {
    id: "optional.pbr",
    label: "PBR",
    supports: () => true,
    program: () => descriptor,
    uniforms: () => Object.freeze({}),
    dispose: vi.fn(),
  };
}

describe("MatcapExtension", () => {
  it("registers provider, panel, and state once without selecting MatCap", async () => {
    const testHost = host();
    const register = vi.spyOn(testHost.shading, "register");
    const extension = new MatcapExtension();

    await expect(extension.activate(testHost)).resolves.toEqual({ status: "activated" });
    expect(register).toHaveBeenCalledTimes(1);
    expect(testHost.shading.get(MATCAP_SHADING_PROVIDER_ID)).not.toBeNull();
    expect(testHost.panels.get(MATCAP_PANEL_ID)?.title).toBe("MatCap");
    expect(testHost.state.save().values[MATCAP_EXTENSION_ID]).toBeDefined();
    expect(testHost.shading.active()).toBeNull();

    await expect(extension.activate(testHost)).resolves.toEqual({
      status: "failed",
      reason: "MatCap extension activation has already been attempted",
    });
    expect(register).toHaveBeenCalledTimes(1);

    extension.dispose();
    extension.dispose();
    expect(testHost.shading.get(MATCAP_SHADING_PROVIDER_ID)).toBeNull();
    expect(testHost.panels.get(MATCAP_PANEL_ID)).toBeNull();
    testHost.dispose();
  });

  it("rolls back provider registration when a later panel registration fails", async () => {
    const testHost = host();
    vi.spyOn(testHost.panels, "register").mockImplementation(() => {
      throw new Error("panel registration failed");
    });
    const extension = new MatcapExtension();

    await expect(extension.activate(testHost)).resolves.toEqual({
      status: "failed",
      reason: "panel registration failed",
    });
    expect(testHost.shading.get(MATCAP_SHADING_PROVIDER_ID)).toBeNull();
    expect(testHost.panels.get(MATCAP_PANEL_ID)).toBeNull();
    expect(testHost.state.save().values[MATCAP_EXTENSION_ID]).toBeUndefined();

    extension.dispose();
    testHost.dispose();
  });

  it("unregisters the provider before its idempotent disposal", async () => {
    const testHost = host();
    const calls: string[] = [];
    const unregister = testHost.shading.unregister.bind(testHost.shading);
    vi.spyOn(testHost.shading, "unregister").mockImplementation((id) => {
      calls.push(`unregister:${id}`);
      unregister(id);
    });
    const providerDispose = WebGL2MatcapShadingProvider.prototype.dispose;
    vi.spyOn(WebGL2MatcapShadingProvider.prototype, "dispose").mockImplementation(function (this: WebGL2MatcapShadingProvider) {
      calls.push("dispose:provider");
      providerDispose.call(this);
    });
    const extension = new MatcapExtension();
    await extension.activate(testHost);

    extension.dispose();
    extension.dispose();

    expect(calls).toEqual([
      `unregister:${MATCAP_SHADING_PROVIDER_ID}`,
      "dispose:provider",
    ]);
    testHost.dispose();
  });

  it("keeps a pre-existing PBR selection independent across activation and disposal", async () => {
    const testHost = host();
    const pbr = pbrProvider();
    testHost.shading.register(pbr);
    const lease = testHost.shading.activateScoped([pbr.id]);
    const extension = new MatcapExtension();

    await extension.activate(testHost);
    expect(testHost.shading.active()).toBe(pbr.id);
    extension.dispose();
    expect(testHost.shading.active()).toBe(pbr.id);
    expect(pbr.dispose).not.toHaveBeenCalled();

    lease.dispose();
    testHost.dispose();
  });

  it("returns unsupported without registering on a non-WebGL2 backend", async () => {
    const testHost = host({ ...CAPABILITIES, backend: "webgpu" });
    const extension = new MatcapExtension();

    await expect(extension.activate(testHost)).resolves.toEqual({
      status: "unsupported",
      reason: "MatCap requires the WebGL2 backend",
    });
    expect(testHost.shading.list()).toEqual([]);
    expect(testHost.panels.get(MATCAP_PANEL_ID)).toBeNull();

    extension.dispose();
    testHost.dispose();
  });

  it("mounts a panel that activates scoped MatCap and reflects candidate fallback", async () => {
    const testHost = host();
    const pbr = pbrProvider();
    testHost.shading.register(pbr);
    const pbrLease = testHost.shading.activateScoped([pbr.id]);
    const extension = new MatcapExtension();
    await extension.activate(testHost);
    const panel = testHost.panels.get(MATCAP_PANEL_ID);
    const container = document.createElement("div");
    panel?.mount(container, testHost.panelContext());

    const enabled = container.querySelector<HTMLInputElement>("[data-matcap-enabled]");
    expect(enabled).not.toBeNull();
    enabled!.checked = true;
    enabled!.dispatchEvent(new Event("change"));
    expect(testHost.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);

    testHost.shading.fail(MATCAP_SHADING_PROVIDER_ID, "compile-failed", "compile fallback");
    const status = container.querySelector<HTMLOutputElement>("[data-matcap-status]");
    expect(status?.dataset.state).toBe("disabled");
    expect(status?.value).toBe("compile fallback");

    extension.dispose();
    expect(testHost.shading.active()).toBe(pbr.id);
    expect(container.querySelector("[data-matcap-panel]")).toBeNull();
    pbrLease.dispose();
    testHost.dispose();
  });
});
