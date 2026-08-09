import type {
  ImageAssetRef,
  MeshSnapshot,
  MeshTriangleHit,
} from "@octopoly/contracts";
import type { PaintTargetAdapter } from "./paint-target-adapter";

export type PaintDisabledReason = "missing-uv" | "unmapped-target" | "missing-image";

export type PaintEligibility =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: PaintDisabledReason };

const ENABLED: PaintEligibility = Object.freeze({ enabled: true });
const MISSING_IMAGE: PaintEligibility = Object.freeze({
  enabled: false,
  reason: "missing-image",
});
const UNMAPPED_TARGET: PaintEligibility = Object.freeze({
  enabled: false,
  reason: "unmapped-target",
});
const MISSING_UV: PaintEligibility = Object.freeze({
  enabled: false,
  reason: "missing-uv",
});

export class PaintEligibilityService {
  constructor(private readonly targets: PaintTargetAdapter) {}

  evaluate(
    mesh: MeshSnapshot,
    activeImage: ImageAssetRef | null,
    currentImage: ImageAssetRef | null,
  ): PaintEligibility {
    if (!this.targets.isCurrentImage(activeImage, currentImage)) {
      return MISSING_IMAGE;
    }
    if (!this.targets.hasPaintableTriangles(mesh)) {
      return UNMAPPED_TARGET;
    }
    if (!this.targets.hasCompleteUv0(mesh)) {
      return MISSING_UV;
    }
    return ENABLED;
  }

  evaluateHit(
    mesh: MeshSnapshot,
    hit: MeshTriangleHit | null,
    activeImage: ImageAssetRef | null,
    currentImage: ImageAssetRef | null,
  ): PaintEligibility {
    const targetEligibility = this.evaluate(mesh, activeImage, currentImage);
    if (!targetEligibility.enabled) {
      return targetEligibility;
    }
    if (!this.targets.isCanonicalHit(mesh, hit)) {
      return UNMAPPED_TARGET;
    }
    if (this.targets.resolveCornerUvs(mesh, hit) === null) {
      return MISSING_UV;
    }
    return ENABLED;
  }
}
