import type { OrbitCamera } from "./camera";

interface Point {
  readonly x: number;
  readonly y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function attachCameraControls(
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  invalidate: () => void,
): () => void {
  const pointers = new Map<number, Point>();

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "pen" || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;

    const before = [...pointers.values()];
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    const after = [...pointers.values()];

    if (pointers.size === 1) {
      const deltaY = event.pointerType === "touch"
        ? previous.y - next.y
        : next.y - previous.y;
      camera.orbit(next.x - previous.x, deltaY);
    } else if (before.length >= 2 && after.length >= 2) {
      const previousDistance = distance(before[0]!, before[1]!);
      const nextDistance = distance(after[0]!, after[1]!);
      camera.zoomByPinch(previousDistance, nextDistance);
    }

    event.preventDefault();
    invalidate();
  };

  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
  };

  const onWheel = (event: WheelEvent): void => {
    camera.zoomByWheel(event.deltaY);
    event.preventDefault();
    invalidate();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", releasePointer);
    canvas.removeEventListener("pointercancel", releasePointer);
    canvas.removeEventListener("wheel", onWheel);
  };
}
