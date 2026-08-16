import type { OrbitCamera } from "./camera";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface TrackedPointer extends Point {
  readonly pan: boolean;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function attachCameraControls(
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  invalidate: () => void,
): () => void {
  const pointers = new Map<number, TrackedPointer>();

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "pen" || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pan: event.pointerType === "mouse" && event.shiftKey,
    });
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;

    const before = [...pointers.values()];
    const next: TrackedPointer = {
      x: event.clientX,
      y: event.clientY,
      pan: previous.pan,
    };
    pointers.set(event.pointerId, next);
    const after = [...pointers.values()];

    if (pointers.size === 1) {
      if (previous.pan) {
        camera.pan(next.x - previous.x, next.y - previous.y, canvas.clientHeight || 1);
      } else {
        const deltaY = event.pointerType === "touch"
          ? previous.y - next.y
          : next.y - previous.y;
        camera.orbit(next.x - previous.x, deltaY);
      }
    } else if (before.length >= 2 && after.length >= 2) {
      const previousDistance = distance(before[0]!, before[1]!);
      const nextDistance = distance(after[0]!, after[1]!);
      const previousCenter = midpoint(before[0]!, before[1]!);
      const nextCenter = midpoint(after[0]!, after[1]!);
      camera.pan(
        nextCenter.x - previousCenter.x,
        nextCenter.y - previousCenter.y,
        canvas.clientHeight || 1,
      );
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
