import type { MeshTriangulationService, RendererService } from "@octopoly/contracts";

import {
  WebGL2RendererService,
  WebGL2RenderExtensionRegistry,
} from "./core";
import { PreviewRenderPass } from "./preview";
import { ReferenceRenderPass } from "./reference";
import { createRetopoRenderPasses, RetopoRenderPass } from "./retopo";

/**
 * Creates the Required Core renderer in its fixed depth/overlay order.
 * Optional shading providers are not required for this solid/wireframe path.
 */
export function createWebGL2Renderer(
  triangulation: MeshTriangulationService,
): RendererService {
  const retopo = createRetopoRenderPasses(triangulation);
  return new WebGL2RendererService([
    new ReferenceRenderPass(),
    retopo.solid,
    retopo.overlay,
    new PreviewRenderPass(),
  ], undefined, undefined, undefined, triangulation);
}

export {
  PreviewRenderPass,
  ReferenceRenderPass,
  RetopoRenderPass,
  WebGL2RendererService,
  WebGL2RenderExtensionRegistry,
};
export type { RenderPass } from "./core";
