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
export type GizmoDragPlane = "view" | "xy" | "yz" | "xz";

const CONSTRAINED_PLANE_AXES: Readonly<Record<Exclude<GizmoDragPlane, "view">, readonly [VertexAxis, VertexAxis]>> = {
  xy: ["x", "y"],
  yz: ["y", "z"],
  xz: ["x", "z"],
};
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export interface VertexGizmo {
  readonly element: HTMLElement;
  show(position: GizmoPosition | null, directions?: GizmoAxisDirections): void;
  setDragPlane(plane: GizmoDragPlane | null): void;
  setConstrainedPlaneScreenSpace(enabled: boolean): void;
  setMovementScale(unitsPerPixel: number, keyboardStep: number): void;
  dispose(): void;
}

export interface VertexGizmoOptions {
  readonly onMove: (axis: VertexAxis, delta: number) => void;
  readonly onPlaneMove?: (
    plane: GizmoDragPlane,
    from: GizmoPosition,
    to: GizmoPosition,
    screenSpace?: boolean,
  ) => void;
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
  const axisLines = new Map<VertexAxis, HTMLElement>();
  const planeAxisHandles = new Map<VertexAxis, HTMLButtonElement>();
  let directions: GizmoAxisDirections = {
    x: { x: 1, y: 0 },
    y: { x: 0, y: -1 },
    z: { x: 1, y: -1 },
  };
  let unitsPerPixel = options.unitsPerPixel ?? 0.01;
  let keyboardStep = options.keyboardStep ?? 0.1;
  let constrainedPlaneScreenSpace = false;
  let planeDisplayDirections: GizmoAxisDirections = {
    x: { x: 1, y: 0 },
    y: { x: 0, y: -1 },
    z: { x: 1, y: 0 },
  };
  const planeVisual = document.createElementNS(SVG_NAMESPACE, "svg");
  planeVisual.classList.add("vertex-gizmo__plane-visual");
  planeVisual.setAttribute("viewBox", "-80 -80 160 160");
  planeVisual.setAttribute("aria-hidden", "true");
  planeVisual.setAttribute("hidden", "");
  const planeFill = document.createElementNS(SVG_NAMESPACE, "polygon");
  planeFill.dataset.planeFill = "true";
  planeFill.classList.add("vertex-gizmo__plane-fill");
  const planeAxisLines = new Map<VertexAxis, SVGLineElement>();
  for (const axis of ["x", "y", "z"] as const) {
    const line = document.createElementNS(SVG_NAMESPACE, "line");
    line.dataset.planeAxis = axis;
    line.classList.add("vertex-gizmo__plane-axis", `vertex-gizmo__plane-axis--${axis}`);
    line.setAttribute("hidden", "");
    planeAxisLines.set(axis, line);
  }
  planeVisual.append(planeFill, ...planeAxisLines.values());
  const viewPlaneIcon = document.createElementNS(SVG_NAMESPACE, "svg");
  viewPlaneIcon.dataset.viewPlaneGizmo = "true";
  viewPlaneIcon.setAttribute("viewBox", "0 0 24 24");
  viewPlaneIcon.setAttribute("aria-hidden", "true");
  viewPlaneIcon.setAttribute("focusable", "false");
  const viewPlaneIconPath = document.createElementNS(SVG_NAMESPACE, "path");
  viewPlaneIconPath.setAttribute("d", "M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M22 12l-3-3m3 3-3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3");
  viewPlaneIcon.append(viewPlaneIconPath);
  const planeHandle = document.createElement("button");
  planeHandle.type = "button";
  planeHandle.className = "vertex-gizmo__plane-handle";
  planeHandle.hidden = true;
  let dragPlane: GizmoDragPlane | null = null;
  const renderPlaneVisual = (): void => {
    planeVisual.toggleAttribute("hidden", dragPlane === null || dragPlane === "view");
    planeVisual.dataset.plane = dragPlane ?? "";
    planeFill.setAttribute("hidden", "");
    for (const line of planeAxisLines.values()) line.setAttribute("hidden", "");
    for (const handle of planeAxisHandles.values()) handle.hidden = true;
    if (dragPlane === null || dragPlane === "view") return;

    const projected = CONSTRAINED_PLANE_AXES[dragPlane].map((axis) => {
      const direction = constrainedPlaneScreenSpace
        ? axis === "x" || (axis === "z" && dragPlane === "yz")
          ? { x: 1, y: 0 }
          : { x: 0, y: -1 }
        : directions[axis];
      return {
        axis,
        direction,
        length: Math.hypot(direction.x, direction.y),
      };
    });
    const maxLength = Math.max(...projected.map(({ length }) => length));
    const scaled = projected.map(({ axis, direction, length }) => ({
      axis,
      length,
      normalized: length > 0
        ? { x: direction.x / length, y: direction.y / length }
        : null,
      vector: maxLength > 0 && length / maxLength >= 0.08
        ? { x: direction.x / maxLength, y: direction.y / maxLength }
        : null,
    }));
    const valid = scaled.filter((projection) => projection.vector !== null);
    const extent = 34;
    const showAxis = (projection: typeof scaled[number]): void => {
      if (!projection.vector || !projection.normalized) return;
      const line = planeAxisLines.get(projection.axis);
      if (!line) return;
      line.removeAttribute("hidden");
      line.setAttribute("x1", String(-projection.vector.x * extent));
      line.setAttribute("y1", String(-projection.vector.y * extent));
      line.setAttribute("x2", String(projection.vector.x * extent));
      line.setAttribute("y2", String(projection.vector.y * extent));
      planeDisplayDirections = {
        ...planeDisplayDirections,
        [projection.axis]: projection.normalized,
      };
      const handle = planeAxisHandles.get(projection.axis);
      if (handle) {
        const visualLength = Math.hypot(projection.vector.x, projection.vector.y) * extent * 2;
        handle.hidden = false;
        handle.style.width = `${Math.max(44, visualLength)}px`;
        handle.style.setProperty("--plane-axis-visual-length", `${visualLength}px`);
        handle.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(
          projection.vector.y,
          projection.vector.x,
        )}rad)`;
      }
    };
    if (valid.length < 2) {
      if (valid[0]) showAxis(valid[0]);
      return;
    }
    const first = valid[0]!;
    const second = valid[1]!;
    const cross = Math.abs(first.vector!.x * second.vector!.y - first.vector!.y * second.vector!.x);
    if (cross < 0.08) {
      showAxis(first.length >= second.length ? first : second);
      return;
    }

    showAxis(first);
    showAxis(second);
    planeFill.removeAttribute("hidden");
    const corners = [
      { x: -first.vector!.x - second.vector!.x, y: -first.vector!.y - second.vector!.y },
      { x: first.vector!.x - second.vector!.x, y: first.vector!.y - second.vector!.y },
      { x: first.vector!.x + second.vector!.x, y: first.vector!.y + second.vector!.y },
      { x: -first.vector!.x + second.vector!.x, y: -first.vector!.y + second.vector!.y },
    ];
    planeFill.setAttribute("points", corners.map(({ x, y }) => `${x * extent},${y * extent}`).join(" "));
  };
  let planePointerId: number | undefined;
  let planePrevious: GizmoPosition | null = null;
  const ownPlaneEvent = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onPlanePointerDown = (event: PointerEvent): void => {
    ownPlaneEvent(event);
    if (dragPlane === null || planePrevious !== null || event.isPrimary === false || event.button !== 0) return;
    planePointerId = event.pointerId;
    planePrevious = { x: event.clientX, y: event.clientY };
    if (Number.isInteger(planePointerId)) planeHandle.setPointerCapture?.(planePointerId!);
  };
  const onPlanePointerMove = (event: PointerEvent): void => {
    if (dragPlane === null || planePrevious === null
      || (planePointerId !== undefined && event.pointerId !== planePointerId)) return;
    ownPlaneEvent(event);
    const next = { x: event.clientX, y: event.clientY };
    if (dragPlane !== "view" && constrainedPlaneScreenSpace) {
      options.onPlaneMove?.(dragPlane, planePrevious, next, true);
    } else {
      options.onPlaneMove?.(dragPlane, planePrevious, next);
    }
    planePrevious = next;
  };
  const releasePlanePointer = (event: PointerEvent): void => {
    if (planePrevious === null || (planePointerId !== undefined && event.pointerId !== planePointerId)) return;
    ownPlaneEvent(event);
    if (Number.isInteger(planePointerId) && planeHandle.hasPointerCapture?.(planePointerId!)) {
      planeHandle.releasePointerCapture?.(planePointerId!);
    }
    planePointerId = undefined;
    planePrevious = null;
  };
  const losePlanePointer = (event: PointerEvent): void => {
    if (planePointerId !== undefined && event.pointerId !== planePointerId) return;
    planePointerId = undefined;
    planePrevious = null;
  };
  planeHandle.addEventListener("pointerdown", onPlanePointerDown);
  planeHandle.addEventListener("pointermove", onPlanePointerMove);
  planeHandle.addEventListener("pointerup", releasePlanePointer);
  planeHandle.addEventListener("pointercancel", releasePlanePointer);
  planeHandle.addEventListener("lostpointercapture", losePlanePointer);
  detachHandleEvents.push(() => {
    planeHandle.removeEventListener("pointerdown", onPlanePointerDown);
    planeHandle.removeEventListener("pointermove", onPlanePointerMove);
    planeHandle.removeEventListener("pointerup", releasePlanePointer);
    planeHandle.removeEventListener("pointercancel", releasePlanePointer);
    planeHandle.removeEventListener("lostpointercapture", losePlanePointer);
  });

  element.append(planeVisual);
  for (const axis of ["x", "y", "z"] as const) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.hidden = true;
    handle.dataset.planeAxisHandle = axis;
    handle.className = `vertex-gizmo__plane-axis-handle vertex-gizmo__plane-axis-handle--${axis}`;
    handle.setAttribute("aria-label", `${axis.toUpperCase()}축으로만 이동`);
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
        planeDisplayDirections[axis],
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
    planeAxisHandles.set(axis, handle);
    element.append(handle);
  }
  for (const axis of ["x", "y", "z"] as const) {
    const axisLine = document.createElement("span");
    axisLine.className = `vertex-gizmo__axis-line vertex-gizmo__axis-line--${axis}`;
    axisLine.dataset.axisLine = axis;
    axisLine.setAttribute("aria-hidden", "true");
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
    axisLines.set(axis, axisLine);
    handles.set(axis, handle);
    element.append(axisLine, handle);
  }
  element.append(planeHandle);
  container.append(element);

  return {
    element,
    show: (position, nextDirections) => {
      element.hidden = position === null;
      if (nextDirections) directions = nextDirections;
      renderPlaneVisual();
      if (position) {
        element.style.transform = `translate(${position.x}px, ${position.y}px)`;
        for (const axis of ["x", "y", "z"] as const) {
          const direction = directions[axis];
          const length = Math.hypot(direction.x, direction.y) || 1;
          const handle = handles.get(axis);
          const axisLine = axisLines.get(axis);
          const normalizedX = direction.x / length;
          const normalizedY = direction.y / length;
          if (handle) {
            handle.style.left = `${normalizedX * 36}px`;
            handle.style.top = `${normalizedY * 36}px`;
          }
          if (axisLine) {
            axisLine.style.width = "20px";
            axisLine.style.transform = `rotate(${Math.atan2(normalizedY, normalizedX)}rad)`;
          }
        }
      }
    },
    setDragPlane: (plane) => {
      dragPlane = plane;
      planeHandle.hidden = plane === null;
      planeHandle.replaceChildren();
      planeHandle.dataset.dragPlane = plane ?? "";
      planeHandle.classList.toggle("vertex-gizmo__plane-handle--view", plane === "view");
      planeHandle.classList.toggle("vertex-gizmo__plane-handle--constrained", plane !== null && plane !== "view");
      if (plane === "view") {
        planeHandle.append(viewPlaneIcon);
        planeHandle.setAttribute("aria-label", "뷰 평면 2D 정점 이동");
      } else if (plane !== null) {
        planeHandle.setAttribute("aria-label", `${plane.toUpperCase()} 제한 평면에서 정점 이동`);
      } else {
        planeHandle.removeAttribute("aria-label");
      }
      for (const handle of handles.values()) handle.hidden = plane !== null;
      for (const axisLine of axisLines.values()) axisLine.hidden = plane !== null;
      renderPlaneVisual();
    },
    setConstrainedPlaneScreenSpace: (enabled) => {
      if (constrainedPlaneScreenSpace === enabled) return;
      constrainedPlaneScreenSpace = enabled;
      renderPlaneVisual();
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
