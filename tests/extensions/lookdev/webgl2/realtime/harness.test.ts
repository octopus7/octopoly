import { describe, expect, it } from "vitest";

import { LookdevMaterialStore } from "../../../../../src/extensions/lookdev/material";
import {
  LOOKDEV_REALTIME_PROVIDER_ID,
  WebGL2PbrShadingProvider,
} from "../../../../../src/extensions/lookdev/webgl2/realtime";
import { createWebGl2ProviderHarness } from "../../../../optional-sdk/webgl2/harness";
import { createScene } from "../../../../renderer/core/fakes";

describe("realtime PBR repository WebGL2 harness", () => {
  it("compiles, links, binds finite uniforms, and renders through the canonical provider lifecycle", async () => {
    const provider = new WebGL2PbrShadingProvider(new LookdevMaterialStore());
    const harness = await createWebGl2ProviderHarness({
      providers: [provider],
      candidates: [LOOKDEV_REALTIME_PROVIDER_ID],
    });

    harness.renderer.render(createScene());
    harness.scheduler.flush();

    expect(harness.gl.createdPrograms).toHaveLength(1);
    expect(harness.gl.deletedShaders).toHaveLength(2);
    expect(harness.gl.uniformCalls).toContain("m4");
    expect(harness.gl.uniformCalls).toContain("3f");
    expect(harness.gl.uniformCalls).toContain("4f");
    expect(harness.gl.uniformCalls).toContain("1f");
    expect(harness.gl.drawCalls).toEqual([[harness.gl.TRIANGLES, 0, 0]]);
    expect(harness.lease.snapshot()).toEqual({
      candidates: [LOOKDEV_REALTIME_PROVIDER_ID],
      effectiveProviderId: LOOKDEV_REALTIME_PROVIDER_ID,
      failures: [],
    });
    expect(harness.fallbackPass.renderCount).toBe(0);

    harness.renderer.dispose();
  });
});
