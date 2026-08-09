import type {
  ImageAssetRef,
  ImageAssetService,
  ImageTileUpdate,
  MeshSnapshot,
  MeshTriangulationService,
  PickingService,
  PointerSample,
  Tool,
  ToolContext,
  ToolInputResult,
  Vec2,
} from "@octopoly/contracts";

import type {
  BrushBlendMode,
  BrushEngine,
  BrushSample,
  BrushStamp,
  PremultipliedRgba8,
} from "../brush";
import type { TexturePaintImageController, TextureImageDisabledReason } from "../image";
import type { BarycentricUvProjector } from "../projection";
import { PaintSession } from "../session";
import type {
  PaintDisabledReason,
  PaintEligibilityService,
  PaintTargetAdapter,
} from "../target";
import type { TexturePaintBrushController } from "./brush-controller";

export const TEXTURE_PAINT_TOOL_ID = "texture-paint.tool";

export type TexturePaintDisabledReason = PaintDisabledReason | TextureImageDisabledReason;

export interface TexturePaintToolOptions {
  readonly images: ImageAssetService;
  readonly imageController: TexturePaintImageController;
  readonly picking: PickingService;
  readonly triangulation: MeshTriangulationService;
  readonly targets: PaintTargetAdapter;
  readonly eligibility: PaintEligibilityService;
  readonly projector: BarycentricUvProjector;
  readonly brushes: TexturePaintBrushController;
  readonly color?: PremultipliedRgba8;
  readonly blendMode?: BrushBlendMode;
}

interface ProjectedSample {
  readonly point: Vec2;
  readonly sample: BrushSample;
}

const DEFAULT_COLOR: PremultipliedRgba8 = Object.freeze([0, 0, 0, 255] as const);

function currentImage(images: ImageAssetService, active: ImageAssetRef | null): ImageAssetRef | null {
  return active === null ? null : images.current(active.id);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class TexturePaintTool implements Tool {
  readonly id = TEXTURE_PAINT_TOOL_ID;
  readonly #options: TexturePaintToolOptions;
  readonly #color: PremultipliedRgba8;
  readonly #blendMode: BrushBlendMode;
  #session: PaintSession | null = null;
  #pointerId: number | null = null;
  #meshVersion: number | null = null;
  #samples: BrushSample[] = [];
  #writtenStampCount = 0;
  #strokeBrush: BrushEngine | null = null;
  #disabledReason: TexturePaintDisabledReason | null = "missing-image";
  #disposed = false;

  constructor(options: TexturePaintToolOptions) {
    this.#options = options;
    this.#color = options.color ?? DEFAULT_COLOR;
    this.#blendMode = options.blendMode ?? "paint";
  }

  disabledReason(context?: ToolContext): TexturePaintDisabledReason | null {
    this.#assertUsable();
    if (context === undefined) {
      const imageReason = this.#options.imageController.status().reason;
      return imageReason ?? this.#disabledReason;
    }

    return this.evaluateDisabled(context.mesh.snapshot());
  }

  evaluateDisabled(mesh: MeshSnapshot): TexturePaintDisabledReason | null {
    this.#assertUsable();
    const imageStatus = this.#options.imageController.status();
    if (!imageStatus.ready || imageStatus.active === null) {
      this.#disabledReason = imageStatus.reason ?? "missing-image";
      return this.#disabledReason;
    }

    const eligibility = this.#options.eligibility.evaluate(
      mesh,
      imageStatus.active,
      currentImage(this.#options.images, imageStatus.active),
    );
    this.#disabledReason = eligibility.enabled ? null : eligibility.reason;
    return this.#disabledReason;
  }

  pointer(sample: PointerSample, context: ToolContext): ToolInputResult {
    this.#assertUsable();
    if (sample.pointerType === "touch") {
      return Object.freeze({ handled: false });
    }

    if (sample.phase === "down") {
      return this.#pointerDown(sample, context);
    }

    if (this.#session === null || sample.pointerId !== this.#pointerId) {
      return Object.freeze({ handled: false });
    }

    if (sample.phase === "cancel") {
      this.#cancelStroke();
      context.requestRender();
      return Object.freeze({ handled: true, releasePointer: true });
    }

    const mesh = context.mesh.snapshot();
    if (mesh.version !== this.#meshVersion) {
      this.#cancelStroke();
      context.requestRender();
      return Object.freeze({ handled: true, releasePointer: true });
    }

    if (sample.phase === "move" || sample.phase === "up") {
      const projected = this.#project(sample, mesh, context);
      if (projected !== null) {
        this.#samples.push(projected.sample);
        this.#writeAvailableStamps(sample.phase === "up");
      } else {
        this.#breakStrokeSegment();
      }
    }

    if (sample.phase === "up") {
      const session = this.#session;
      this.#resetStrokeFields();
      try {
        const result = session.commit();
        if (result === null) {
          this.#options.imageController.acceptCancelled(session.base);
        } else {
          this.#options.imageController.acceptCommitted(result.ref);
        }
      } catch (error) {
        this.#options.imageController.acceptCancelled(session.base);
        throw error;
      }
      context.requestRender();
      return Object.freeze({ handled: true, releasePointer: true });
    }

    context.requestRender();
    return Object.freeze({ handled: true });
  }

  cancel(context: ToolContext): void {
    this.#assertUsable();
    this.#cancelStroke();
    context.requestRender();
  }

  deactivate(context: ToolContext): void {
    this.cancel(context);
  }

  cancelActive(): void {
    if (this.#disposed) {
      return;
    }
    this.#cancelStroke();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#cancelStroke();
    this.#disposed = true;
  }

  #pointerDown(sample: PointerSample, context: ToolContext): ToolInputResult {
    if (this.#session !== null) {
      this.#cancelStroke();
    }

    if (this.disabledReason(context) !== null) {
      return Object.freeze({ handled: false });
    }

    const mesh = context.mesh.snapshot();
    const projected = this.#project(sample, mesh, context);
    if (projected === null) {
      return Object.freeze({ handled: false });
    }

    const edit = this.#options.imageController.takePreparedEdit();
    if (edit === null) {
      this.#disabledReason = "image-preparing";
      return Object.freeze({ handled: false });
    }

    const session = PaintSession.begin(
      edit,
      context.history,
      "Texture Paint Stroke",
      () => this.#options.imageController.releasePreparedForHistoryTransition(),
    );
    this.#session = session;
    this.#pointerId = sample.pointerId;
    this.#meshVersion = mesh.version;
    this.#samples = [projected.sample];
    this.#writtenStampCount = 0;
    this.#strokeBrush = this.#options.brushes.engine();

    try {
      this.#writeAvailableStamps(true);
    } catch (error) {
      this.#cancelStroke();
      throw error;
    }

    context.requestRender();
    return Object.freeze({ handled: true, capturePointer: true });
  }

  #project(sample: PointerSample, mesh: MeshSnapshot, context: ToolContext): ProjectedSample | null {
    const active = this.#session?.current() ?? this.#options.imageController.activeImage();
    const ray = this.#options.picking.rayFromScreen(
      Object.freeze({ x: sample.x, y: sample.y }),
      context.getCamera(),
      context.getViewport(),
    );
    const hit = this.#options.triangulation.raycast(ray, mesh);
    const eligibility = this.#options.eligibility.evaluateHit(
      mesh,
      hit,
      active,
      currentImage(this.#options.images, active),
    );
    if (!eligibility.enabled || active === null || hit === null) {
      this.#disabledReason = eligibility.enabled ? "unmapped-target" : eligibility.reason;
      return null;
    }

    const cornerUvs = this.#options.targets.resolveCornerUvs(mesh, hit);
    if (cornerUvs === null) {
      this.#disabledReason = "missing-uv";
      return null;
    }

    const point = this.#options.projector.projectTexturePixel(hit, cornerUvs, active);
    if (point === null) {
      this.#disabledReason = "unmapped-target";
      return null;
    }

    this.#disabledReason = null;
    return Object.freeze({
      point,
      sample: Object.freeze({
        x: point.x,
        y: point.y,
        ...(sample.pointerType === "mouse" ? {} : { pressure: sample.pressure }),
        timestamp: sample.timestamp,
        coalesced: sample.coalesced,
      }),
    });
  }

  #writeAvailableStamps(includeEndpoint: boolean): void {
    if (this.#session === null || this.#samples.length === 0) {
      return;
    }

    const brush = this.#strokeBrush;
    if (brush === null) {
      throw new Error("Texture paint stroke brush is unavailable");
    }
    const stamps = brush.generateStamps(this.#samples);
    const exclusiveEnd = includeEndpoint ? stamps.length : Math.max(1, stamps.length - 1);
    const active = this.#session.current();
    if (active === null) {
      throw new Error("Active paint image disappeared during a stroke");
    }

    for (let index = this.#writtenStampCount; index < exclusiveEnd; index += 1) {
      const stamp = stamps[index];
      if (stamp === undefined) {
        throw new Error("Brush stamp stream ended unexpectedly");
      }
      const update = this.#stampUpdate(stamp, active);
      if (update !== null) {
        const ref = this.#session.write(update);
        this.#options.imageController.applyWrittenUpdate(ref, update);
      }
    }
    this.#writtenStampCount = exclusiveEnd;
  }

  #stampUpdate(stamp: BrushStamp, image: ImageAssetRef): ImageTileUpdate | null {
    const minimumX = clampInteger(Math.floor(stamp.x - stamp.radiusPx), 0, image.width);
    const minimumY = clampInteger(Math.floor(stamp.y - stamp.radiusPx), 0, image.height);
    const maximumX = clampInteger(Math.ceil(stamp.x + stamp.radiusPx), 0, image.width);
    const maximumY = clampInteger(Math.ceil(stamp.y + stamp.radiusPx), 0, image.height);
    const width = maximumX - minimumX;
    const height = maximumY - minimumY;
    if (width <= 0 || height <= 0) {
      return null;
    }

    const bytes = new Uint8ClampedArray(width * height * 4);
    const brush = this.#strokeBrush;
    if (brush === null) {
      throw new Error("Texture paint stroke brush is unavailable");
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const rgba = brush.blendPixel(
          this.#options.imageController.pixelAt(minimumX + x, minimumY + y),
          this.#color,
          stamp,
          minimumX + x + 0.5,
          minimumY + y + 0.5,
          this.#blendMode,
        );
        const offset = (y * width + x) * 4;
        bytes[offset] = rgba[0];
        bytes[offset + 1] = rgba[1];
        bytes[offset + 2] = rgba[2];
        bytes[offset + 3] = rgba[3];
      }
    }

    return Object.freeze({
      x: minimumX,
      y: minimumY,
      width,
      height,
      rgba8Premultiplied: bytes,
    });
  }

  #cancelStroke(): void {
    const session = this.#session;
    if (session === null) {
      return;
    }
    this.#resetStrokeFields();
    try {
      session.cancel();
    } finally {
      this.#options.imageController.acceptCancelled(session.base);
    }
  }

  #resetStrokeFields(): void {
    this.#session = null;
    this.#pointerId = null;
    this.#meshVersion = null;
    this.#samples = [];
    this.#writtenStampCount = 0;
    this.#strokeBrush = null;
  }

  #breakStrokeSegment(): void {
    this.#samples = [];
    this.#writtenStampCount = 0;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Texture paint tool is disposed");
    }
  }
}
