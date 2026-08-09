import type { RendererCapabilities, ShadingProgramDescriptor } from "@octopoly/contracts";

export const LOOKDEV_REALTIME_MIN_MAX_TEXTURE_SIZE = 2_048;
export const LOOKDEV_REALTIME_MIN_TEXTURE_BUDGET_BYTES = 16 * 1024 * 1024;
export const LOOKDEV_REALTIME_MIN_GPU_BUDGET_BYTES = 32 * 1024 * 1024;

export const LOOKDEV_REALTIME_SHADER_BUDGET = Object.freeze({
  maxVertexSourceBytes: 4 * 1024,
  maxFragmentSourceBytes: 12 * 1024,
  maxAttributes: 2,
  maxVaryingVectors: 2,
  maxTextureSamplers: 6,
});

export function supportsLookdevRealtime(capabilities: RendererCapabilities): boolean {
  return (
    capabilities.backend === "webgl2" &&
    finiteAtLeast(capabilities.maxTextureSize, LOOKDEV_REALTIME_MIN_MAX_TEXTURE_SIZE) &&
    finiteAtLeast(
      capabilities.applicationTextureBudgetBytes,
      LOOKDEV_REALTIME_MIN_TEXTURE_BUDGET_BYTES,
    ) &&
    finiteAtLeast(
      capabilities.applicationGpuBudgetBytes,
      LOOKDEV_REALTIME_MIN_GPU_BUDGET_BYTES,
    )
  );
}

export function isLookdevRealtimeProgramWithinBudget(
  descriptor: ShadingProgramDescriptor,
): boolean {
  return (
    descriptor.language === "glsl-es-300" &&
    asciiByteLength(descriptor.vertexShader) <= LOOKDEV_REALTIME_SHADER_BUDGET.maxVertexSourceBytes &&
    asciiByteLength(descriptor.fragmentShader) <= LOOKDEV_REALTIME_SHADER_BUDGET.maxFragmentSourceBytes &&
    (descriptor.attributes?.length ?? 0) <= LOOKDEV_REALTIME_SHADER_BUDGET.maxAttributes &&
    countDeclarations(descriptor.vertexShader, /\bout\s+(?:(?:lowp|mediump|highp)\s+)?(?:float|vec[234])\s+/gu) <=
      LOOKDEV_REALTIME_SHADER_BUDGET.maxVaryingVectors &&
    countDeclarations(descriptor.fragmentShader, /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler2D\s+/gu) <=
      LOOKDEV_REALTIME_SHADER_BUDGET.maxTextureSamplers
  );
}

function finiteAtLeast(value: number, minimum: number): boolean {
  return Number.isFinite(value) && value >= minimum;
}

function asciiByteLength(source: string): number {
  // Provider shader sources are intentionally ASCII-only, so UTF-8 bytes equal code units.
  return source.length;
}

function countDeclarations(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}
