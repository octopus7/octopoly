import { beforeEach, describe, expect, it } from "vitest";

import { mountBootstrap, renderEmergencyShell } from "../../src/app/bootstrap";
import type { RuntimeCapabilities } from "../../src/app/capabilities";

const ready: RuntimeCapabilities = {
  webgl2: { status: "ready", backend: "webgl2", maxTextureSize: 4096 },
  webgpuOptional: "unavailable",
};

describe("minimal bootstrap shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("renders a non-blank accessible shell before capability probing settles", async () => {
    let resolveProbe!: (result: RuntimeCapabilities) => void;
    const probe = new Promise<RuntimeCapabilities>((resolve) => {
      resolveProbe = resolve;
    });
    const root = document.getElementById("app") as HTMLElement;

    const mounted = mountBootstrap(root, () => probe);

    expect(root.textContent).toContain("OctoPoly");
    expect(root.textContent).toContain("Checking WebGL2");
    expect(root.querySelector("h1")?.id).toBe("octopoly-title");
    expect(root.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");

    resolveProbe(ready);
    await mounted;
  });

  it("publishes the ready state without adding product features", async () => {
    const root = document.getElementById("app") as HTMLElement;

    await mountBootstrap(root, () => ready);

    expect(root.dataset.capability).toBe("ready");
    expect(root.textContent).toContain("WebGL2 ready");
    expect(root.querySelector("canvas")).toBeNull();
    expect(root.querySelector("button")).toBeNull();
  });

  it("keeps the shell visible for unsupported WebGL2", async () => {
    const root = document.getElementById("app") as HTMLElement;

    await mountBootstrap(root, () => ({
      webgl2: { status: "unsupported", reason: "WebGL2 unavailable" },
      webgpuOptional: "available",
    }));

    expect(root.dataset.capability).toBe("unsupported");
    expect(root.textContent).toContain("OctoPoly");
    expect(root.textContent).toContain("WebGL2 unsupported");
    expect(root.textContent).toContain("WebGPU optional: available");
  });

  it("converts a rejected probe into a visible failed state", async () => {
    const root = document.getElementById("app") as HTMLElement;

    const result = await mountBootstrap(root, () => Promise.reject(new Error("probe rejected")));

    expect(result.webgl2.status).toBe("failed");
    expect(root.dataset.capability).toBe("failed");
    expect(root.textContent).toContain("Capability check failed");
    expect(root.textContent).toContain("probe rejected");
  });

  it("has an emergency non-blank failure renderer", () => {
    const root = document.getElementById("app") as HTMLElement;

    renderEmergencyShell(root, new Error("bootstrap crashed"));

    expect(root.dataset.capability).toBe("failed");
    expect(root.textContent).toContain("OctoPoly");
    expect(root.textContent).toContain("bootstrap crashed");
  });
});
