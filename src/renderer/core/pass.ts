import type { RenderSceneSnapshot } from "@octopoly/contracts";

export type RenderPassPhase = "base" | "fallback" | "overlay";

/**
 * Renderer-local GPU pass boundary. Implementations retain CPU descriptors only;
 * every WebGL handle must be discarded by invalidate() and rebuilt by initialize().
 */
export interface RenderPass {
  /** Defaults to base for backwards-compatible reference passes. */
  readonly phase?: RenderPassPhase;
  initialize(gl: WebGL2RenderingContext): void;
  render(
    gl: WebGL2RenderingContext,
    scene: RenderSceneSnapshot,
    devicePixelRatio: number,
  ): void;
  invalidate(): void;
  dispose(): void;
}
