import type { RendererCapabilities, ShadingProgramDescriptor } from "@octopoly/contracts";

export const LOOKDEV_QUALITY_MIN_MAX_TEXTURE_SIZE = 4_096;
export const LOOKDEV_QUALITY_MIN_TEXTURE_BUDGET_BYTES = 64 * 1024 * 1024;
export const LOOKDEV_QUALITY_MIN_GPU_BUDGET_BYTES = 128 * 1024 * 1024;

export const LOOKDEV_QUALITY_SHADER_BUDGET = Object.freeze({
  maxVertexSourceBytes: 4 * 1024,
  maxFragmentSourceBytes: 16 * 1024,
  maxAttributes: 2,
  maxVaryingVectors: 2,
  maxTextureSamplers: 6,
});

export type LookdevQualitySupportFailureCode =
  | "unsupported-backend"
  | "unsupported-capability"
  | "resource-budget";

export interface LookdevQualitySupportFailure {
  readonly code: LookdevQualitySupportFailureCode;
  readonly reason: string;
}

export function lookdevQualitySupportFailure(
  capabilities: RendererCapabilities,
): LookdevQualitySupportFailure | null {
  if (capabilities.backend !== "webgl2") {
    return Object.freeze({
      code: "unsupported-backend",
      reason: `Quality lookdev requires WebGL2; received ${capabilities.backend}`,
    });
  }
  if (!capabilities.supportsFloatColorBuffer) {
    return Object.freeze({
      code: "unsupported-capability",
      reason: "Quality lookdev requires float color-buffer support",
    });
  }
  if (!finiteAtLeast(capabilities.maxTextureSize, LOOKDEV_QUALITY_MIN_MAX_TEXTURE_SIZE)) {
    return Object.freeze({
      code: "unsupported-capability",
      reason: `Quality lookdev requires maxTextureSize >= ${LOOKDEV_QUALITY_MIN_MAX_TEXTURE_SIZE}`,
    });
  }
  if (
    !finiteAtLeast(
      capabilities.applicationTextureBudgetBytes,
      LOOKDEV_QUALITY_MIN_TEXTURE_BUDGET_BYTES,
    )
  ) {
    return Object.freeze({
      code: "resource-budget",
      reason:
        `Quality lookdev requires texture budget >= ${LOOKDEV_QUALITY_MIN_TEXTURE_BUDGET_BYTES} bytes`,
    });
  }
  if (
    !finiteAtLeast(
      capabilities.applicationGpuBudgetBytes,
      LOOKDEV_QUALITY_MIN_GPU_BUDGET_BYTES,
    )
  ) {
    return Object.freeze({
      code: "resource-budget",
      reason: `Quality lookdev requires GPU budget >= ${LOOKDEV_QUALITY_MIN_GPU_BUDGET_BYTES} bytes`,
    });
  }
  return null;
}

export function supportsLookdevQuality(capabilities: RendererCapabilities): boolean {
  return lookdevQualitySupportFailure(capabilities) === null;
}

export function isLookdevQualityProgramWithinBudget(
  descriptor: ShadingProgramDescriptor,
): boolean {
  return (
    descriptor.language === "glsl-es-300" &&
    asciiByteLength(descriptor.vertexShader) <= LOOKDEV_QUALITY_SHADER_BUDGET.maxVertexSourceBytes &&
    asciiByteLength(descriptor.fragmentShader) <= LOOKDEV_QUALITY_SHADER_BUDGET.maxFragmentSourceBytes &&
    (descriptor.attributes?.length ?? 0) <= LOOKDEV_QUALITY_SHADER_BUDGET.maxAttributes &&
    countDeclarations(
      descriptor.vertexShader,
      /\bout\s+(?:(?:lowp|mediump|highp)\s+)?(?:float|vec[234])\s+/gu,
    ) <= LOOKDEV_QUALITY_SHADER_BUDGET.maxVaryingVectors &&
    countDeclarations(
      descriptor.fragmentShader,
      /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler2D\s+/gu,
    ) <= LOOKDEV_QUALITY_SHADER_BUDGET.maxTextureSamplers
  );
}

function finiteAtLeast(value: number, minimum: number): boolean {
  return Number.isFinite(value) && value >= minimum;
}

function asciiByteLength(source: string): number {
  return source.length;
}

function countDeclarations(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}
