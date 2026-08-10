import type { Disposable } from "@octopoly/contracts";

const DEFAULT_LINE_HEIGHT_CSS_PX = 16;
const DEFAULT_MAX_DELTA_CSS_PX = 600;
const DEFAULT_SENSITIVITY = 0.002;
const NON_PASSIVE_WHEEL_LISTENER = Object.freeze({ passive: false });

export interface WheelZoomAdapterOptions {
  readonly lineHeightCssPx?: number;
  readonly maxDeltaCssPx?: number;
  readonly sensitivity?: number;
  readonly canZoom: () => boolean;
  readonly zoom: (scale: number) => void;
  readonly requestRender: () => void;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive`);
  }
  return value;
}

function normalizedDeltaY(
  event: WheelEvent,
  lineHeightCssPx: number,
  pageHeightCssPx: number,
): number | null {
  let multiplier: number;
  switch (event.deltaMode) {
    case 0:
      multiplier = 1;
      break;
    case 1:
      multiplier = lineHeightCssPx;
      break;
    case 2:
      if (!Number.isFinite(pageHeightCssPx) || pageHeightCssPx <= 0) {
        return null;
      }
      multiplier = pageHeightCssPx;
      break;
    default:
      return null;
  }

  const delta = event.deltaY * multiplier;
  return Number.isFinite(delta) && delta !== 0 ? delta : null;
}

export function createWheelZoomAdapter(
  element: HTMLElement,
  options: WheelZoomAdapterOptions,
): Disposable {
  const lineHeightCssPx = positiveFinite(
    options.lineHeightCssPx ?? DEFAULT_LINE_HEIGHT_CSS_PX,
    "lineHeightCssPx",
  );
  const maxDeltaCssPx = positiveFinite(
    options.maxDeltaCssPx ?? DEFAULT_MAX_DELTA_CSS_PX,
    "maxDeltaCssPx",
  );
  const sensitivity = positiveFinite(
    options.sensitivity ?? DEFAULT_SENSITIVITY,
    "sensitivity",
  );
  positiveFinite(Math.exp(maxDeltaCssPx * sensitivity), "maximum wheel scale");

  let disposed = false;
  let canZoom: (() => boolean) | null = options.canZoom;
  let zoom: ((scale: number) => void) | null = options.zoom;
  let requestRender: (() => void) | null = options.requestRender;

  const onWheel = (event: WheelEvent): void => {
    const currentCanZoom = canZoom;
    const currentZoom = zoom;
    const currentRequestRender = requestRender;
    if (
      disposed ||
      currentCanZoom === null ||
      currentZoom === null ||
      currentRequestRender === null
    ) {
      return;
    }

    const delta = normalizedDeltaY(
      event,
      lineHeightCssPx,
      element.getBoundingClientRect().height,
    );
    if (delta === null || !currentCanZoom()) {
      return;
    }

    const clampedDelta = Math.max(-maxDeltaCssPx, Math.min(maxDeltaCssPx, delta));
    const scale = Math.exp(clampedDelta * sensitivity);
    if (!Number.isFinite(scale) || scale <= 0) {
      return;
    }

    currentZoom(scale);
    currentRequestRender();
    event.preventDefault();
  };

  const wheelListener: EventListener = (event) => onWheel(event as WheelEvent);
  element.addEventListener("wheel", wheelListener, NON_PASSIVE_WHEEL_LISTENER);

  return Object.freeze({
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      element.removeEventListener("wheel", wheelListener);
      canZoom = null;
      zoom = null;
      requestRender = null;
    },
  });
}
