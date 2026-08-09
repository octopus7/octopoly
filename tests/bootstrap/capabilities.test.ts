import { describe, expect, it } from "vitest";

import { probeRuntimeCapabilities } from "../../src/app/capabilities";

function canvasWithContext(context: unknown): HTMLCanvasElement {
  return {
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

describe("probeRuntimeCapabilities", () => {
  it("reports ready only after a valid WebGL2 context is available", () => {
    const context = {
      MAX_TEXTURE_SIZE: 0x0d33,
      getParameter: () => 8192,
    };

    const result = probeRuntimeCapabilities({
      createCanvas: () => canvasWithContext(context),
      hasWebGpu: () => true,
    });

    expect(result).toEqual({
      webgl2: { status: "ready", backend: "webgl2", maxTextureSize: 8192 },
      webgpuOptional: "available",
    });
  });

  it("reports unsupported when WebGL2 context creation returns null", () => {
    const result = probeRuntimeCapabilities({
      createCanvas: () => canvasWithContext(null),
      hasWebGpu: () => false,
    });

    expect(result.webgl2.status).toBe("unsupported");
    expect(result.webgpuOptional).toBe("unavailable");
  });

  it("reports failed when context creation throws", () => {
    const result = probeRuntimeCapabilities({
      createCanvas: () => {
        throw new Error("context creation blocked");
      },
      hasWebGpu: () => false,
    });

    expect(result.webgl2).toEqual({ status: "failed", reason: "context creation blocked" });
  });

  it("reports failed for a malformed WebGL2 capability result", () => {
    const context = {
      MAX_TEXTURE_SIZE: 0x0d33,
      getParameter: () => Number.NaN,
    };

    const result = probeRuntimeCapabilities({
      createCanvas: () => canvasWithContext(context),
      hasWebGpu: () => false,
    });

    expect(result.webgl2.status).toBe("failed");
  });

  it("ignores an optional WebGPU detection failure", () => {
    const context = {
      MAX_TEXTURE_SIZE: 0x0d33,
      getParameter: () => 4096,
    };

    const result = probeRuntimeCapabilities({
      createCanvas: () => canvasWithContext(context),
      hasWebGpu: () => {
        throw new Error("optional detector failed");
      },
    });

    expect(result.webgl2.status).toBe("ready");
    expect(result.webgpuOptional).toBe("unavailable");
  });
});
