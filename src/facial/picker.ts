interface PickPoint {
  readonly x: number;
  readonly y: number;
}

export function attachVertexPicker<T = never>(
  canvas: HTMLCanvasElement,
  onPick: (point: PickPoint, context?: T) => void,
  captureContext?: () => T,
): () => void {
  let candidate: { id: number; start: PickPoint; moved: boolean; context?: T } | null = null;
  const activePointers = new Set<number>();

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) {
      candidate = null;
      return;
    }
    candidate = {
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
      ...(captureContext ? { context: captureContext() } : {}),
    };
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!candidate || candidate.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - candidate.start.x, event.clientY - candidate.start.y) > 4) {
      candidate.moved = true;
    }
  };
  const onPointerUp = (event: PointerEvent): void => {
    activePointers.delete(event.pointerId);
    if (!candidate || candidate.id !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - candidate.start.x,
      event.clientY - candidate.start.y,
    );
    const moved = candidate.moved;
    const context = candidate.context;
    candidate = null;
    if (!moved && distance <= 4) {
      if (captureContext) onPick({ x: event.clientX, y: event.clientY }, context);
      else onPick({ x: event.clientX, y: event.clientY });
    }
  };
  const cancel = (event: PointerEvent): void => {
    activePointers.delete(event.pointerId);
    if (candidate?.id === event.pointerId) candidate = null;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);

  return () => {
    candidate = null;
    activePointers.clear();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("lostpointercapture", cancel);
  };
}
