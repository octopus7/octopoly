import type { VertexAxis } from "./workspace";

export interface AxisDirection {
  readonly x: number;
  readonly y: number;
}

export function axisDragDelta(
  axis: VertexAxis,
  deltaX: number,
  deltaY: number,
  unitsPerPixel: number,
  direction?: AxisDirection,
): number {
  if (direction) {
    const length = Math.hypot(direction.x, direction.y);
    if (length > 0) return ((deltaX * direction.x + deltaY * direction.y) / length) * unitsPerPixel;
  }
  if (axis === "x") return deltaX * unitsPerPixel;
  if (axis === "y") return -deltaY * unitsPerPixel;
  return ((deltaX - deltaY) / Math.SQRT2) * unitsPerPixel;
}

export interface GizmoPosition {
  readonly x: number;
  readonly y: number;
}

export type GizmoAxisDirections = Readonly<Record<VertexAxis, AxisDirection>>;

export interface VertexGizmo {
  readonly element: HTMLElement;
  show(position: GizmoPosition | null, directions?: GizmoAxisDirections): void;
  setMovementScale(unitsPerPixel: number, keyboardStep: number): void;
  dispose(): void;
}

export interface VertexGizmoOptions {
  readonly onMove: (axis: VertexAxis, delta: number) => void;
  readonly unitsPerPixel?: number;
  readonly keyboardStep?: number;
}

export function mountVertexGizmo(
  container: HTMLElement,
  options: VertexGizmoOptions,
): VertexGizmo {
  const document = container.ownerDocument;
  const element = document.createElement("div");
  element.className = "vertex-gizmo";
  element.setAttribute("aria-label", "정점 이동 기즈모");
  element.hidden = true;
  const detachHandleEvents: Array<() => void> = [];
  const handles = new Map<VertexAxis, HTMLButtonElement>();
  let directions: GizmoAxisDirections = {
    x: { x: 1, y: 0 },
    y: { x: 0, y: -1 },
    z: { x: 1, y: -1 },
  };
  let unitsPerPixel = options.unitsPerPixel ?? 0.01;
  let keyboardStep = options.keyboardStep ?? 0.1;

  for (const axis of ["x", "y", "z"] as const) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.dataset.axis = axis;
    handle.className = `vertex-gizmo__handle vertex-gizmo__handle--${axis}`;
    handle.setAttribute("aria-label", `${axis.toUpperCase()}축 이동`);
    handle.textContent = axis.toUpperCase();
    let dragging = false;
    let activePointerId: number | undefined;
    let previousX = 0;
    let previousY = 0;
    const ownEvent = (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = (event: PointerEvent): void => {
      ownEvent(event);
      if (dragging || event.isPrimary === false || event.button !== 0) return;
      dragging = true;
      activePointerId = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      if (Number.isInteger(activePointerId)) handle.setPointerCapture?.(activePointerId!);
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging || (activePointerId !== undefined && event.pointerId !== activePointerId)) return;
      ownEvent(event);
      const deltaX = event.clientX - previousX;
      const deltaY = event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      options.onMove(axis, axisDragDelta(
        axis,
        deltaX,
        deltaY,
        unitsPerPixel,
        directions[axis],
      ));
    };
    const releasePointer = (event: PointerEvent): void => {
      if (!dragging || (activePointerId !== undefined && event.pointerId !== activePointerId)) return;
      ownEvent(event);
      if (Number.isInteger(activePointerId) && handle.hasPointerCapture?.(activePointerId!)) {
        handle.releasePointerCapture?.(activePointerId!);
      }
      dragging = false;
      activePointerId = undefined;
    };
    const onLostPointerCapture = (event: PointerEvent): void => {
      if (activePointerId !== undefined && event.pointerId !== activePointerId) return;
      dragging = false;
      activePointerId = undefined;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const direction = event.key === "ArrowUp" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 0;
      if (direction === 0) return;
      event.preventDefault();
      event.stopPropagation();
      options.onMove(axis, direction * keyboardStep);
    };
    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", releasePointer);
    handle.addEventListener("pointercancel", releasePointer);
    handle.addEventListener("lostpointercapture", onLostPointerCapture);
    handle.addEventListener("keydown", onKeyDown);
    detachHandleEvents.push(() => {
      if (dragging && activePointerId !== undefined && handle.hasPointerCapture?.(activePointerId)) {
        handle.releasePointerCapture?.(activePointerId);
      }
      dragging = false;
      activePointerId = undefined;
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", releasePointer);
      handle.removeEventListener("pointercancel", releasePointer);
      handle.removeEventListener("lostpointercapture", onLostPointerCapture);
      handle.removeEventListener("keydown", onKeyDown);
    });
    handles.set(axis, handle);
    element.append(handle);
  }
  container.append(element);

  return {
    element,
    show: (position, nextDirections) => {
      element.hidden = position === null;
      if (nextDirections) directions = nextDirections;
      if (position) {
        element.style.transform = `translate(${position.x}px, ${position.y}px)`;
        for (const axis of ["x", "y", "z"] as const) {
          const direction = directions[axis];
          const length = Math.hypot(direction.x, direction.y) || 1;
          const handle = handles.get(axis);
          if (handle) {
            handle.style.left = `${direction.x / length * 36}px`;
            handle.style.top = `${direction.y / length * 36}px`;
          }
        }
      }
    },
    setMovementScale: (nextUnitsPerPixel, nextKeyboardStep) => {
      if (Number.isFinite(nextUnitsPerPixel) && nextUnitsPerPixel > 0) {
        unitsPerPixel = nextUnitsPerPixel;
      }
      if (Number.isFinite(nextKeyboardStep) && nextKeyboardStep > 0) {
        keyboardStep = nextKeyboardStep;
      }
    },
    dispose: () => {
      for (const detach of detachHandleEvents) detach();
      element.remove();
    },
  };
}
