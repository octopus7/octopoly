import type {
  AttributeKey,
  CornerId,
  Disposable,
  MeshSnapshot,
  ModelingExtensionServices,
  PointerInputSink,
  PointerSample,
  SelectionMode,
  ToolInputResult,
  Unsubscribe,
  Vec2,
  Vec3,
  ViewportSnapshot,
} from "@octopoly/contracts";

import {
  UvMutationController,
  UvTransformService,
  type UvMutationOutcome,
} from "../operations";
import { createUvProjectionService, type UvProjectionService } from "../projection";
import { UvEditorSelection } from "./selection";

export type UvEditorAvailability = "empty" | "missing" | "partial" | "invalid" | "ready";
export type UvSelectionTarget = "corner" | "island";

export interface UvViewportLayout {
  readonly pan: Vec2;
  readonly zoom: number;
}

export interface UvEditorStatus {
  readonly availability: UvEditorAvailability;
  readonly readOnly: boolean;
  readonly message: string;
  readonly meshVersion: number;
}

export interface UvViewportControllerOptions {
  readonly modeling: ModelingExtensionServices;
  readonly selection: UvEditorSelection;
  readonly uvAttribute: AttributeKey<Vec2>;
  readonly initialLayout?: UvViewportLayout;
  readonly pickRadiusCssPx?: number;
  readonly resolveIsland?: (corner: CornerId, mesh: MeshSnapshot) => number | null;
}

interface EditPointer {
  readonly id: number;
  readonly pointerType: "pen" | "mouse";
  readonly start: Vec2;
  readonly meshVersion: number;
  readonly dragSelection: boolean;
}

interface TouchGesture {
  readonly layout: UvViewportLayout;
  readonly points: ReadonlyMap<number, Vec2>;
}

const DEFAULT_LAYOUT: UvViewportLayout = Object.freeze({
  pan: Object.freeze({ x: 0, y: 0 }),
  zoom: 100,
});

function finiteVec2(value: unknown): value is Vec2 {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Vec2>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function cloneLayout(layout: UvViewportLayout): UvViewportLayout {
  if (!finiteVec2(layout.pan)) throw new TypeError("UV viewport pan must be finite");
  if (!Number.isFinite(layout.zoom) || layout.zoom <= 0) {
    throw new TypeError("UV viewport zoom must be finite and greater than zero");
  }
  return Object.freeze({
    pan: Object.freeze({ x: layout.pan.x, y: layout.pan.y }),
    zoom: layout.zoom,
  });
}

function selectionMode(sample: PointerSample): SelectionMode {
  if (sample.modifiers.alt) return "subtract";
  if (sample.modifiers.shift) return "toggle";
  if (sample.modifiers.ctrl || sample.modifiers.meta) return "add";
  return "replace";
}

function distance(first: Vec2, second: Vec2): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function centroid(points: ReadonlyArray<Vec2>): Vec2 {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export class UvViewportController implements PointerInputSink, Disposable {
  readonly #modeling: ModelingExtensionServices;
  readonly #selection: UvEditorSelection;
  readonly #uvAttribute: AttributeKey<Vec2>;
  readonly #pickRadiusCssPx: number;
  readonly #resolveIsland: ((corner: CornerId, mesh: MeshSnapshot) => number | null) | undefined;
  readonly #transforms: UvTransformService;
  readonly #projection: UvProjectionService;
  readonly #listeners = new Set<() => void>();
  readonly #touches = new Map<number, Vec2>();
  readonly #editCancellations = new Set<() => void>();
  #layout: UvViewportLayout;
  #viewport: ViewportSnapshot = Object.freeze({ cssWidth: 0, cssHeight: 0, devicePixelRatio: 1 });
  #selectionTarget: UvSelectionTarget = "corner";
  #editPointer: EditPointer | null = null;
  #touchGesture: TouchGesture | null = null;
  #touchRollbackLayout: UvViewportLayout | null = null;
  #disposed = false;

  constructor(options: UvViewportControllerOptions) {
    if (options.pickRadiusCssPx !== undefined
      && (!Number.isFinite(options.pickRadiusCssPx) || options.pickRadiusCssPx <= 0)) {
      throw new TypeError("UV pick radius must be finite and greater than zero");
    }
    this.#modeling = options.modeling;
    this.#selection = options.selection;
    this.#uvAttribute = options.uvAttribute;
    this.#pickRadiusCssPx = options.pickRadiusCssPx ?? 12;
    this.#resolveIsland = options.resolveIsland;
    this.#transforms = new UvTransformService(options.uvAttribute);
    this.#projection = createUvProjectionService();
    this.#layout = cloneLayout(options.initialLayout ?? DEFAULT_LAYOUT);
  }

  dispatch(sample: PointerSample): ToolInputResult {
    this.#assertUsable();
    if (sample.pointerType === "touch") return this.#dispatchTouch(sample);
    return this.#dispatchEdit(sample);
  }

  layout(): UvViewportLayout {
    this.#assertUsable();
    return this.#layout;
  }

  setLayout(layout: UvViewportLayout): void {
    this.#assertUsable();
    this.#layout = cloneLayout(layout);
    this.#notify();
  }

  viewport(): ViewportSnapshot {
    this.#assertUsable();
    return this.#viewport;
  }

  setViewport(viewport: ViewportSnapshot): void {
    this.#assertUsable();
    if (!Number.isFinite(viewport.cssWidth) || viewport.cssWidth < 0
      || !Number.isFinite(viewport.cssHeight) || viewport.cssHeight < 0
      || !Number.isFinite(viewport.devicePixelRatio) || viewport.devicePixelRatio <= 0) {
      throw new TypeError("UV viewport dimensions must be finite and non-negative");
    }
    this.#viewport = Object.freeze({ ...viewport });
    this.#notify();
  }

  selectionTarget(): UvSelectionTarget {
    this.#assertUsable();
    return this.#selectionTarget;
  }

  islandSelectionAvailable(): boolean {
    this.#assertUsable();
    return this.#resolveIsland !== undefined;
  }

  setSelectionTarget(target: UvSelectionTarget): void {
    this.#assertUsable();
    if (target === "island" && this.#resolveIsland === undefined) {
      throw new Error("UV island selection is unavailable without an island resolver");
    }
    this.#selectionTarget = target;
    this.#notify();
  }

  status(): UvEditorStatus {
    this.#assertUsable();
    const mesh = this.#modeling.mesh.snapshot();
    return inspectUvStatus(mesh, this.#uvAttribute);
  }

  screenFromUv(uv: Vec2): Vec2 {
    this.#assertUsable();
    return Object.freeze({
      x: this.#layout.pan.x + uv.x * this.#layout.zoom,
      y: this.#layout.pan.y - uv.y * this.#layout.zoom,
    });
  }

  uvFromScreen(point: Vec2): Vec2 {
    this.#assertUsable();
    return Object.freeze({
      x: (point.x - this.#layout.pan.x) / this.#layout.zoom,
      y: (this.#layout.pan.y - point.y) / this.#layout.zoom,
    });
  }

  beginEdit(cancel: () => void): Disposable {
    this.#assertUsable();
    this.#editCancellations.add(cancel);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.#editCancellations.delete(cancel);
      },
    };
  }

  projectPlanar(normal: Vec3 = { x: 0, y: 0, z: 1 }): UvMutationOutcome {
    this.#assertUsable();
    const mesh = this.#modeling.mesh.snapshot();
    const selectedFaces = this.#selectedFaces();
    const values = selectedFaces === undefined
      ? this.#projection.planar(mesh, normal)
      : this.#projection.planar(mesh, normal, selectedFaces);
    return this.#applyValues("Planar UV", values);
  }

  projectBox(): UvMutationOutcome {
    this.#assertUsable();
    const mesh = this.#modeling.mesh.snapshot();
    const selectedFaces = this.#selectedFaces();
    const values = selectedFaces === undefined
      ? this.#projection.box(mesh)
      : this.#projection.box(mesh, selectedFaces);
    return this.#applyValues("Box UV", values);
  }

  normalizeSelection(): UvMutationOutcome {
    this.#assertUsable();
    const mesh = this.#modeling.mesh.snapshot();
    if (inspectUvStatus(mesh, this.#uvAttribute).readOnly) return { status: "unchanged" };
    const corners = this.#editableCorners(mesh);
    const values = this.#transforms.normalize(mesh, corners);
    return this.#applyValues("Normalize UV", values);
  }

  cancelActiveEdits(): void {
    this.#assertUsable();
    this.#cancelInput(true);
    const callbacks = [...this.#editCancellations];
    this.#editCancellations.clear();
    for (const cancel of callbacks.reverse()) cancel();
  }

  handleDocumentReplacement(): void {
    this.#assertUsable();
    this.cancelActiveEdits();
    this.#selection.clear();
    this.#notify();
  }

  pruneSelection(): void {
    this.#assertUsable();
    const mesh = this.#modeling.mesh.snapshot();
    const liveCorners = new Set(mesh.corners.map((corner) => corner.id));
    let liveIslands: Set<number> | undefined;
    if (this.#resolveIsland !== undefined) {
      liveIslands = new Set<number>();
      for (const corner of liveCorners) {
        const island = this.#resolveIsland(corner, mesh);
        if (island !== null) liveIslands.add(island);
      }
    }
    this.#selection.prune(liveCorners, liveIslands);
  }

  subscribe(listener: () => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#cancelInput(true);
    const callbacks = [...this.#editCancellations];
    this.#editCancellations.clear();
    for (const cancel of callbacks.reverse()) cancel();
    this.#listeners.clear();
    this.#disposed = true;
  }

  #dispatchEdit(sample: PointerSample): ToolInputResult {
    if (sample.pointerType === "touch") return { handled: false };
    if (sample.phase === "hover") return { handled: false };

    if (sample.phase === "down") {
      if (!sample.isPrimary || this.#editPointer !== null || this.#touches.size > 0) {
        return { handled: false };
      }
      const mesh = this.#modeling.mesh.snapshot();
      const hit = this.#nearestCorner({ x: sample.x, y: sample.y }, mesh);
      this.#editPointer = {
        id: sample.pointerId,
        pointerType: sample.pointerType,
        start: Object.freeze({ x: sample.x, y: sample.y }),
        meshVersion: mesh.version,
        dragSelection: hit !== null && this.#selection.snapshot().corners.has(hit),
      };
      return { handled: true, capturePointer: true };
    }

    if (this.#editPointer?.id !== sample.pointerId) return { handled: false };

    if (sample.phase === "cancel") {
      this.#editPointer = null;
      this.#cancelEditCallbacks();
      return { handled: true, releasePointer: true };
    }

    if (sample.phase === "up") {
      const editPointer = this.#editPointer;
      this.#editPointer = null;
      const deltaX = sample.x - editPointer.start.x;
      const deltaY = sample.y - editPointer.start.y;
      if (editPointer.dragSelection
        && this.#modeling.mesh.snapshot().version === editPointer.meshVersion
        && (deltaX !== 0 || deltaY !== 0)) {
        const mesh = this.#modeling.mesh.snapshot();
        const values = this.#transforms.move(mesh, this.#selection.snapshot().corners, {
          x: deltaX / this.#layout.zoom,
          y: -deltaY / this.#layout.zoom,
        });
        this.#applyValues("Move UV", values);
        this.#notify();
        return { handled: true, releasePointer: true };
      }
      this.#pick(sample);
      return { handled: true, releasePointer: true };
    }

    return { handled: true };
  }

  #dispatchTouch(sample: PointerSample): ToolInputResult {
    if (sample.phase === "hover") return { handled: false };
    const point = Object.freeze({ x: sample.x, y: sample.y });

    if (sample.phase === "down") {
      if (this.#editPointer !== null) return { handled: false };
      if (this.#touches.size === 0) this.#touchRollbackLayout = this.#layout;
      this.#touches.set(sample.pointerId, point);
      this.#rebaseTouchGesture();
      return { handled: true, capturePointer: true };
    }

    if (!this.#touches.has(sample.pointerId)) return { handled: false };

    if (sample.phase === "cancel") {
      if (this.#touchRollbackLayout !== null) this.#layout = this.#touchRollbackLayout;
      this.#touches.clear();
      this.#touchGesture = null;
      this.#touchRollbackLayout = null;
      this.#cancelEditCallbacks();
      this.#notify();
      return { handled: true, releasePointer: true };
    }

    if (sample.phase === "up") {
      this.#touches.delete(sample.pointerId);
      if (this.#touches.size === 0) {
        this.#touchGesture = null;
        this.#touchRollbackLayout = null;
      } else {
        this.#rebaseTouchGesture();
      }
      return { handled: true, releasePointer: true };
    }

    this.#touches.set(sample.pointerId, point);
    this.#updateTouchLayout();
    return { handled: true };
  }

  #rebaseTouchGesture(): void {
    this.#touchGesture = {
      layout: this.#layout,
      points: new Map(this.#touches),
    };
  }

  #updateTouchLayout(): void {
    const gesture = this.#touchGesture;
    if (gesture === null || this.#touches.size === 0) return;
    const ids = [...this.#touches.keys()].filter((id) => gesture.points.has(id)).sort((a, b) => a - b);
    if (ids.length === 0) return;
    const before = ids.map((id) => gesture.points.get(id) as Vec2);
    const after = ids.map((id) => this.#touches.get(id) as Vec2);
    const beforeCenter = centroid(before);
    const afterCenter = centroid(after);
    let zoom = gesture.layout.zoom;
    if (ids.length >= 2) {
      const beforeDistance = distance(before[0] as Vec2, before[1] as Vec2);
      const afterDistance = distance(after[0] as Vec2, after[1] as Vec2);
      if (beforeDistance > 0 && Number.isFinite(afterDistance)) {
        zoom = Math.min(1_000_000, Math.max(1e-6, gesture.layout.zoom * afterDistance / beforeDistance));
      }
    }
    const scale = zoom / gesture.layout.zoom;
    this.#layout = cloneLayout({
      pan: {
        x: afterCenter.x - (beforeCenter.x - gesture.layout.pan.x) * scale,
        y: afterCenter.y - (beforeCenter.y - gesture.layout.pan.y) * scale,
      },
      zoom,
    });
    this.#notify();
  }

  #pick(sample: PointerSample): void {
    const mesh = this.#modeling.mesh.snapshot();
    const nearest = this.#nearestCorner({ x: sample.x, y: sample.y }, mesh);
    if (nearest === null) return;
    const mode = selectionMode(sample);
    if (this.#selectionTarget === "corner") {
      this.#selection.updateCorners(mode, new Set([nearest]));
    } else {
      const island = this.#resolveIsland?.(nearest, mesh) ?? null;
      if (island !== null) this.#selection.updateIslands(mode, new Set([island]));
    }
  }

  #nearestCorner(point: Vec2, mesh: MeshSnapshot): CornerId | null {
    if (inspectUvStatus(mesh, this.#uvAttribute).readOnly) return null;
    const selectedFaces = this.#modeling.selection.snapshot().faces;
    let nearest: { readonly corner: CornerId; readonly distanceSquared: number } | null = null;
    for (const corner of mesh.corners) {
      if (selectedFaces.size > 0 && !selectedFaces.has(corner.face)) continue;
      const uv = mesh.attributes.get(this.#uvAttribute, corner.id);
      if (!finiteVec2(uv)) continue;
      const screen = this.screenFromUv(uv);
      const dx = screen.x - point.x;
      const dy = screen.y - point.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > this.#pickRadiusCssPx * this.#pickRadiusCssPx) continue;
      if (nearest === null
        || distanceSquared < nearest.distanceSquared
        || (distanceSquared === nearest.distanceSquared && corner.id < nearest.corner)) {
        nearest = { corner: corner.id, distanceSquared };
      }
    }
    return nearest?.corner ?? null;
  }

  #editableCorners(mesh: MeshSnapshot): ReadonlySet<CornerId> {
    const selection = this.#selection.snapshot();
    if (selection.corners.size > 0) return selection.corners;

    const corners = new Set<CornerId>();
    if (selection.islands.size > 0 && this.#resolveIsland !== undefined) {
      for (const corner of mesh.corners) {
        const island = this.#resolveIsland(corner.id, mesh);
        if (island !== null && selection.islands.has(island)) corners.add(corner.id);
      }
      if (corners.size > 0) return corners;
    }

    const selectedFaces = this.#modeling.selection.snapshot().faces;
    for (const corner of mesh.corners) {
      if (selectedFaces.size === 0 || selectedFaces.has(corner.face)) corners.add(corner.id);
    }
    return corners;
  }

  #selectedFaces(): ReadonlyArray<number> | undefined {
    const faces = this.#modeling.selection.snapshot().faces;
    return faces.size === 0 ? undefined : Object.freeze([...faces].sort((a, b) => a - b));
  }

  #applyValues(
    label: string,
    values: ReadonlyMap<CornerId, Vec2 | undefined>,
  ): UvMutationOutcome {
    const mutations = new UvMutationController(
      this.#modeling.mesh,
      this.#modeling.mutations,
      this.#modeling.history,
      this.#uvAttribute,
    );
    return mutations.apply(label, values);
  }

  #cancelInput(rollbackTouch: boolean): void {
    this.#editPointer = null;
    if (rollbackTouch && this.#touchRollbackLayout !== null) {
      this.#layout = this.#touchRollbackLayout;
    }
    this.#touches.clear();
    this.#touchGesture = null;
    this.#touchRollbackLayout = null;
  }

  #cancelEditCallbacks(): void {
    const callbacks = [...this.#editCancellations];
    this.#editCancellations.clear();
    for (const cancel of callbacks.reverse()) cancel();
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("UV viewport controller is disposed");
  }
}

export function inspectUvStatus(
  mesh: MeshSnapshot,
  uvAttribute: AttributeKey<Vec2>,
): UvEditorStatus {
  if (mesh.faces.length === 0 || mesh.corners.length === 0) {
    return Object.freeze({
      availability: "empty",
      readOnly: true,
      message: "No editable UV topology",
      meshVersion: mesh.version,
    });
  }

  let anyValue = false;
  for (const face of mesh.faces) {
    if (face.corners.length < 3) {
      return Object.freeze({
        availability: "invalid",
        readOnly: true,
        message: "Degenerate topology cannot be edited",
        meshVersion: mesh.version,
      });
    }
    let faceValues = 0;
    for (const cornerId of face.corners) {
      const corner = mesh.corners.find((candidate) => candidate.id === cornerId);
      if (corner === undefined || corner.face !== face.id) {
        return Object.freeze({
          availability: "invalid",
          readOnly: true,
          message: "Invalid corner topology cannot be edited",
          meshVersion: mesh.version,
        });
      }
      const value = mesh.attributes.get(uvAttribute, cornerId);
      if (value === undefined) continue;
      anyValue = true;
      if (!finiteVec2(value)) {
        return Object.freeze({
          availability: "invalid",
          readOnly: true,
          message: "Non-finite UV values cannot be edited",
          meshVersion: mesh.version,
        });
      }
      faceValues += 1;
    }
    if (faceValues > 0 && faceValues !== face.corners.length) {
      return Object.freeze({
        availability: "partial",
        readOnly: true,
        message: "Partial face UVs are read-only until regenerated",
        meshVersion: mesh.version,
      });
    }
  }

  if (!anyValue) {
    return Object.freeze({
      availability: "missing",
      readOnly: true,
      message: "UVs have not been generated",
      meshVersion: mesh.version,
    });
  }

  return Object.freeze({
    availability: "ready",
    readOnly: false,
    message: "UV editor ready",
    meshVersion: mesh.version,
  });
}
