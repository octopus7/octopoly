import type {
  PointerKind,
  PointerPhase,
  PointerSample,
} from "@octopoly/contracts";

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.max(minimum, Math.min(maximum, value));
}

function pointerKind(pointerType: string): PointerKind {
  if (pointerType === "pen" || pointerType === "touch") {
    return pointerType;
  }
  return "mouse";
}

export function pointerPhase(event: PointerEvent): PointerPhase {
  switch (event.type) {
    case "pointerdown":
      return "down";
    case "pointerup":
      return "up";
    case "pointercancel":
    case "lostpointercapture":
      return "cancel";
    case "pointermove":
      return event.pointerType !== "touch" && event.buttons === 0 ? "hover" : "move";
    default:
      throw new RangeError(`unsupported pointer event type: ${event.type}`);
  }
}

export function normalizePointerEvent(
  event: PointerEvent,
  phase: PointerPhase,
  elementLeft: number,
  elementTop: number,
  coalesced: boolean,
  timestamp = event.timeStamp,
): PointerSample {
  if (
    !Number.isFinite(elementLeft) ||
    !Number.isFinite(elementTop) ||
    !Number.isFinite(event.clientX) ||
    !Number.isFinite(event.clientY) ||
    !Number.isFinite(timestamp)
  ) {
    throw new RangeError("pointer coordinates and timestamp must be finite");
  }
  const modifiers = Object.freeze({
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  });
  return Object.freeze({
    pointerId: event.pointerId,
    pointerType: pointerKind(event.pointerType),
    phase,
    isPrimary: event.isPrimary,
    x: event.clientX - elementLeft,
    y: event.clientY - elementTop,
    pressure: clamp(event.pressure, 0, 1),
    tiltX: clamp(event.tiltX, -90, 90),
    tiltY: clamp(event.tiltY, -90, 90),
    buttons: event.buttons,
    modifiers,
    timestamp,
    coalesced,
  });
}
