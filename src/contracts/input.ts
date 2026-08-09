import type { Disposable, Unsubscribe } from "./fundamental";
import type { ToolInputResult } from "./tools";
import type { ViewportSnapshot } from "./camera";

export type PointerKind = "pen" | "touch" | "mouse";
export type PointerPhase = "down" | "move" | "up" | "cancel" | "hover";

export interface PointerModifiers {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

export interface PointerSample {
  readonly pointerId: number;
  readonly pointerType: PointerKind;
  readonly phase: PointerPhase;
  readonly isPrimary: boolean;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly buttons: number;
  readonly modifiers: PointerModifiers;
  readonly timestamp: number;
  readonly coalesced: boolean;
}

export interface PointerInputSink {
  dispatch(sample: PointerSample): ToolInputResult;
}

export interface NormalizedInputSurfaceOptions {
  readonly touchAction?: "none" | "pan-x" | "pan-y" | "manipulation";
}

export interface NormalizedInputSurface extends Disposable {
  viewport(): ViewportSnapshot;
  subscribeViewport(listener: (viewport: ViewportSnapshot) => void): Unsubscribe;
  connect(sink: PointerInputSink): Disposable;
}

export interface NormalizedInputSurfaceFactory {
  create(element: HTMLElement, options?: NormalizedInputSurfaceOptions): NormalizedInputSurface;
}
