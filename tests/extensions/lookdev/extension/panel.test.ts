import { describe, expect, it } from "vitest";

import { LookdevMaterialStore } from "../../../../src/extensions/lookdev/material";
import {
  LookdevController,
  LookdevPanel,
} from "../../../../src/extensions/lookdev/extension";
import { LOOKDEV_REALTIME_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/realtime";
import { LOOKDEV_QUALITY_PROVIDER_ID } from "../../../../src/extensions/lookdev/webgl2/quality";
import {
  ContractTestRenderControl,
  ContractTestRenderExtensionRegistry,
  createContractTestExtensionHost,
} from "../../../../src/optional-sdk/testkit";
import { QUALITY_CAPABILITIES, TrackingProvider } from "./fakes";

describe("LookdevPanel", () => {
  it("mounts material/provider/fallback state and drives scoped preset selection", () => {
    const registry = new ContractTestRenderExtensionRegistry(QUALITY_CAPABILITIES);
    const renderer = new ContractTestRenderControl(QUALITY_CAPABILITIES);
    registry.register(new TrackingProvider(LOOKDEV_REALTIME_PROVIDER_ID));
    registry.register(new TrackingProvider(LOOKDEV_QUALITY_PROVIDER_ID));
    registry.fail(LOOKDEV_QUALITY_PROVIDER_ID, "compile-failed", "quality compile failure");
    const controller = new LookdevController(registry, renderer, "quality");
    const materials = new LookdevMaterialStore([{ id: "lookdev.default" }]);
    const panel = new LookdevPanel(controller, materials);
    const host = createContractTestExtensionHost();
    const container = document.createElement("aside");

    panel.mount(container, host.panelContext());
    expect(container.textContent).toContain("Material: lookdev.default");
    expect(container.textContent).toContain(`Provider: ${LOOKDEV_REALTIME_PROVIDER_ID}`);
    expect(container.textContent).toContain("quality compile failure");

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    if (select !== null) {
      select.value = "realtime";
      select.dispatchEvent(new Event("change"));
    }
    expect(controller.preset()).toBe("realtime");
    expect(container.textContent).toContain("Fallback: none");

    panel.dispose();
    panel.dispose();
    expect(container.children).toHaveLength(0);
    controller.dispose();
    registry.dispose();
    host.dispose();
  });
});
