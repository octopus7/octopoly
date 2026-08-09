import type {
  ExtensionActivationResult,
  ExtensionHost,
  ExtensionPanel,
  ExtensionStateProvider,
  OptionalExtension,
  RendererCapabilities,
  ShadingProvider,
  Tool,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createOptionalComposition,
  defineOptionalManifest,
  OPTIONAL_FEATURE_ORDER,
  type OptionalFeature,
  type OptionalManifestEntry,
} from "../../src/optional";
import { createContractTestExtensionHost } from "../../src/optional-sdk/testkit";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 4096,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 64 * 1024 * 1024,
  applicationGpuBudgetBytes: 128 * 1024 * 1024,
});

function provider(id: string, calls: string[]): ShadingProvider {
  return {
    id,
    label: id,
    supports: () => true,
    program: () => ({ language: "glsl-es-300", vertexShader: "", fragmentShader: "" }),
    uniforms: () => Object.freeze({}),
    dispose: vi.fn(() => calls.push(`dispose:provider:${id}`)),
  };
}

function panel(id: string, calls: string[]): ExtensionPanel {
  return {
    id,
    title: id,
    mount: () => {},
    dispose: vi.fn(() => calls.push(`dispose:panel:${id}`)),
  };
}

function stateProvider(id: string, calls: string[]): ExtensionStateProvider {
  return {
    id,
    load: () => {},
    save: () => Object.freeze({ schemaVersion: 1, data: Object.freeze({ id }) }),
    dispose: vi.fn(() => calls.push(`dispose:state:${id}`)),
  };
}

interface TrackingExtensionOptions {
  readonly result?: ExtensionActivationResult;
  readonly duplicatePanelId?: string;
  readonly gate?: Promise<void>;
}

function trackingExtension(
  id: string,
  calls: string[],
  options: TrackingExtensionOptions = {},
): OptionalExtension {
  return {
    id,
    async activate(host: ExtensionHost): Promise<ExtensionActivationResult> {
      calls.push(`activate:${id}`);
      const tool: Tool = { id: `${id}.tool` };
      host.tools.register(tool);
      host.tools.activateScoped(tool.id);
      host.shading.register(provider(`${id}.provider`, calls));
      host.shading.activateScoped([`${id}.provider`]);
      host.panels.register(panel(options.duplicatePanelId ?? `${id}.panel`, calls));
      host.state.register(stateProvider(`${id}.state`, calls));
      host.images.subscribe(() => {});
      host.modeling.subscribe(() => {});
      await options.gate;
      return options.result ?? { status: "activated" };
    },
    dispose: vi.fn(() => calls.push(`dispose:extension:${id}`)),
  };
}

function manifestEntry(
  feature: OptionalFeature,
  create: () => OptionalExtension,
): OptionalManifestEntry {
  return { feature, create };
}

describe("OptionalComposition lifecycle", () => {
  it("prevents one owner from getting or enumerating another owner's panels and providers", async () => {
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    let firstHost: ExtensionHost | null = null;
    let secondHost: ExtensionHost | null = null;
    const ownedExtension = (
      id: string,
      capture: (owner: ExtensionHost) => void,
    ): OptionalExtension => ({
      id,
      activate(owner) {
        capture(owner);
        owner.panels.register(panel(`${id}.panel`, []));
        owner.shading.register(provider(`${id}.provider`, []));
        return { status: "activated" };
      },
      dispose: () => {},
    });
    const composition = createOptionalComposition(host, defineOptionalManifest([
      manifestEntry("uv", () => ownedExtension("first-owner", (owner) => { firstHost = owner; })),
      manifestEntry("lookdev", () => ownedExtension("second-owner", (owner) => { secondHost = owner; })),
    ]));

    await composition.start();
    const first = firstHost as ExtensionHost | null;
    const second = secondHost as ExtensionHost | null;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.panels.get("first-owner.panel")?.id).toBe("first-owner.panel");
    expect(first?.panels.get("second-owner.panel")).toBeNull();
    expect(first?.shading.get("first-owner.provider")?.id).toBe("first-owner.provider");
    expect(first?.shading.get("second-owner.provider")).toBeNull();
    expect(first?.shading.list().map(({ id }) => id)).toEqual(["first-owner.provider"]);
    expect(second?.panels.get("first-owner.panel")).toBeNull();
    expect(second?.shading.get("first-owner.provider")).toBeNull();
    expect(second?.shading.list().map(({ id }) => id)).toEqual(["second-owner.provider"]);

    composition.dispose();
  });

  it("activates and leak-checks all 16 extension subsets in deterministic order", async () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const calls: string[] = [];
      const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
      const selected = OPTIONAL_FEATURE_ORDER.filter((_, index) => (mask & (1 << index)) !== 0);
      const composition = createOptionalComposition(host, defineOptionalManifest(
        [...selected].reverse().map((feature) => manifestEntry(
          feature,
          () => trackingExtension(feature, calls),
        )),
      ));

      const report = await composition.start();
      expect(report.activations.map(({ feature }) => feature)).toEqual(selected);
      expect(report.activations.every(({ status }) => status === "activated")).toBe(true);
      composition.dispose();
      expect(composition.resources().every(({ total }) => total === 0)).toBe(true);
    }
  });

  it("loads serially in canonical order and reverse-disposes owners before the shared host", async () => {
    const calls: string[] = [];
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const originalHostDispose = host.dispose.bind(host);
    vi.spyOn(host, "dispose").mockImplementation(() => {
      calls.push("dispose:host");
      originalHostDispose();
    });
    const composition = createOptionalComposition(host, defineOptionalManifest([
      manifestEntry("matcap", () => trackingExtension("matcap", calls)),
      manifestEntry("uv", () => trackingExtension("uv", calls)),
      manifestEntry("lookdev", () => trackingExtension("lookdev", calls)),
      manifestEntry("texture-paint", () => trackingExtension("paint", calls)),
    ]));

    const report = await composition.start();
    expect(report.activations.map(({ feature }) => feature)).toEqual([
      "uv",
      "texture-paint",
      "lookdev",
      "matcap",
    ]);
    expect(composition.active()).toEqual(["uv", "paint", "lookdev", "matcap"]);
    expect(calls.filter((call) => call.startsWith("activate:"))).toEqual([
      "activate:uv",
      "activate:paint",
      "activate:lookdev",
      "activate:matcap",
    ]);

    composition.dispose();
    composition.dispose();

    expect(calls.filter((call) => call.startsWith("dispose:extension:"))).toEqual([
      "dispose:extension:matcap",
      "dispose:extension:lookdev",
      "dispose:extension:paint",
      "dispose:extension:uv",
    ]);
    expect(calls.at(-1)).toBe("dispose:host");
    expect(host.dispose).toHaveBeenCalledTimes(1);
    expect(composition.resources().every(({ total }) => total === 0)).toBe(true);
    expect(composition.cleanupErrors()).toEqual([]);
  });

  it("isolates failed activation, reverses its partial resources, and continues independent extensions", async () => {
    const calls: string[] = [];
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const composition = createOptionalComposition(host, defineOptionalManifest([
      manifestEntry("uv", () => trackingExtension("broken", calls, {
        result: { status: "failed", reason: "fixture failure" },
      })),
      manifestEntry("lookdev", () => trackingExtension("healthy", calls)),
    ]));

    const report = await composition.start();

    expect(report.activations).toEqual([
      { feature: "uv", extensionId: "broken", status: "failed", reason: "fixture failure" },
      { feature: "lookdev", extensionId: "healthy", status: "activated" },
    ]);
    expect(composition.active()).toEqual(["healthy"]);
    expect(host.panels.get("broken.panel")).toBeNull();
    expect(host.shading.get("broken.provider")).toBeNull();
    expect(host.state.save().values["broken.state"]).toBeUndefined();
    expect(host.state.save().values["healthy.state"]).toBeDefined();
    expect(composition.resources()[0]).toMatchObject({ ownerId: "broken", total: 0 });
    expect(composition.resources()[1]?.total).toBeGreaterThan(0);

    composition.dispose();
    expect(composition.resources().every(({ total }) => total === 0)).toBe(true);
  });

  it("rejects duplicate extension ids and duplicate registrations without disturbing prior owners", async () => {
    const calls: string[] = [];
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const composition = createOptionalComposition(host, defineOptionalManifest([
      manifestEntry("uv", () => trackingExtension("same", calls)),
      manifestEntry("texture-paint", () => trackingExtension("same", calls)),
      manifestEntry("lookdev", () => trackingExtension("panel-collision", calls, {
        duplicatePanelId: "same.panel",
      })),
      manifestEntry("matcap", () => trackingExtension("last", calls)),
    ]));

    const report = await composition.start();

    expect(report.activations.map(({ status }) => status)).toEqual([
      "activated",
      "failed",
      "failed",
      "activated",
    ]);
    expect(report.activations[1]?.reason).toContain("already active or activating");
    expect(report.activations[2]?.reason).toContain("already registered");
    expect(composition.active()).toEqual(["same", "last"]);
    expect(host.panels.get("same.panel")).not.toBeNull();
    expect(host.panels.get("last.panel")).not.toBeNull();
    expect(composition.resources()[1]).toMatchObject({ ownerId: "same", total: 0 });
    expect(composition.resources()[2]).toMatchObject({ ownerId: "panel-collision", total: 0 });

    composition.dispose();
  });

  it("cancels pending async activation without late registration or owner leaks", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const composition = createOptionalComposition(host, defineOptionalManifest([
      manifestEntry("matcap", () => trackingExtension("pending", calls, { gate })),
    ]));
    const controller = new AbortController();

    const startup = composition.start(controller.signal);
    await vi.waitFor(() => expect(calls).toContain("activate:pending"));
    controller.abort();
    release();
    const report = await startup;

    expect(report.activations).toEqual([{
      feature: "matcap",
      extensionId: "pending",
      status: "failed",
      reason: 'Extension "pending" activation was cancelled',
    }]);
    expect(composition.active()).toEqual([]);
    expect(composition.resources()).toHaveLength(1);
    expect(composition.resources()[0]).toMatchObject({ ownerId: "pending", total: 0 });
    expect(calls.filter((call) => call === "dispose:extension:pending")).toHaveLength(1);
  });

  it("cancels owner-scoped image edits on deactivate without disposing the shared service", async () => {
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const ref = host.images.seed(Object.freeze({
      id: "paint-image",
      revision: 0,
      width: 1,
      height: 1,
      colorSpace: "srgb",
    }));
    const extension: OptionalExtension = {
      id: "image-owner",
      async activate(owner) {
        await owner.images.prepareEdit(ref);
        return { status: "activated" };
      },
      dispose: () => {},
    };
    const composition = createOptionalComposition(host, defineOptionalManifest([
      manifestEntry("texture-paint", () => extension),
    ]));

    await composition.start();
    expect(composition.resources()[0]).toMatchObject({ imageEdits: 1 });

    composition.deactivate("image-owner");
    expect(composition.resources()[0]).toMatchObject({ imageEdits: 0, total: 0 });
    expect(host.images.current(ref.id)).toEqual(ref);

    composition.dispose();
  });
});
