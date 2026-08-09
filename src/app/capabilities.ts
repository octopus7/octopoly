export const CORE_GPU_BACKEND = "webgl2" as const;

export type CapabilityStatus = "ready" | "unsupported" | "failed";

export type WebGl2Capability =
  | {
      readonly status: "ready";
      readonly backend: typeof CORE_GPU_BACKEND;
      readonly maxTextureSize: number;
    }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

export interface RuntimeCapabilities {
  readonly webgl2: WebGl2Capability;
  readonly webgpuOptional: "available" | "unavailable";
}

export interface CapabilityProbeDependencies {
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly hasWebGpu?: () => boolean;
}

function defaultCreateCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function defaultHasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function errorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "The WebGL2 capability check failed unexpectedly.";
}

export function probeRuntimeCapabilities(
  dependencies: CapabilityProbeDependencies = {},
): RuntimeCapabilities {
  const hasWebGpu = dependencies.hasWebGpu ?? defaultHasWebGpu;
  let webgpuOptional: RuntimeCapabilities["webgpuOptional"] = "unavailable";

  try {
    webgpuOptional = hasWebGpu() ? "available" : "unavailable";
  } catch {
    // Optional WebGPU detection must never block the required WebGL2 probe.
  }

  try {
    const canvas = (dependencies.createCanvas ?? defaultCreateCanvas)();
    const context = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      stencil: false,
    });

    if (context === null) {
      return {
        webgl2: {
          status: "unsupported",
          reason: "WebGL2 is required but is not available in this browser or device configuration.",
        },
        webgpuOptional,
      };
    }

    const maxTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
    if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) {
      return {
        webgl2: {
          status: "failed",
          reason: "WebGL2 initialized but returned an invalid capability result.",
        },
        webgpuOptional,
      };
    }

    return {
      webgl2: {
        status: "ready",
        backend: CORE_GPU_BACKEND,
        maxTextureSize,
      },
      webgpuOptional,
    };
  } catch (error: unknown) {
    return {
      webgl2: { status: "failed", reason: errorReason(error) },
      webgpuOptional,
    };
  }
}
