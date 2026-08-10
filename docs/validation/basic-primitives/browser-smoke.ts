import type { MeshSnapshot, PointerPhase, PointerSample, ProjectDocument } from "../../../src/contracts";

import { mountBasicPrimitivesUi, type BasicPrimitivesUiAdapter } from "../../../src/app/basic-primitives-ui";
import { CoreWorkspace, createProductionCoreWorkspace } from "../../../src/app/composition";
import { createBasicPrimitivesEntry } from "../../../src/app/composition/primitive-entry";
import type { SelectionFrame } from "../../../src/tools/basic/construction-plane";

type SmokeStatus = "STARTING" | "READY" | "RUNNING" | "PASS" | "FAIL" | "UNSUPPORTED";

interface RendererEvidence {
  readonly state: string;
  readonly width: number;
  readonly height: number;
  readonly readbackBytes: number;
  readonly nonZeroPixels: number;
  readonly nonBackgroundPixels: number;
  readonly distinctSampledColors: number;
  readonly pixelFingerprint: string;
}

interface SmokeResult {
  scenario: "plane" | "cube";
  status: SmokeStatus;
  phase: string;
  browser: string;
  webgl2: boolean;
  mesh: { vertices: number; edges: number; corners: number; faces: number; version: number };
  selectedFaceIds: number[];
  frameFingerprint: string | null;
  frameFinite: boolean;
  rendererEvidence: RendererEvidence | null;
  history: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null };
  historyLabels: Array<{ action: string; undoLabel: string | null; redoLabel: string | null }>;
  stableIdsAfterReload: boolean | null;
  savedDocumentBytes: number;
  exportSizes: { obj: number; glb: number };
  actions: string[];
  warnings: string[];
  errors: string[];
}

const viewport = required<HTMLElement>("#smoke-viewport");
const canvas = required<HTMLCanvasElement>("#smoke-canvas");
const output = required<HTMLElement>("#smoke-result");
const moveButton = required<HTMLButtonElement>('[data-testid="move-selection"]');
const extrudeButton = required<HTMLButtonElement>('[data-testid="extrude-selection"]');
const undoButton = required<HTMLButtonElement>('[data-testid="undo"]');
const redoButton = required<HTMLButtonElement>('[data-testid="redo"]');

const warnings: string[] = [];
const errors: string[] = [];
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (...values: unknown[]): void => {
  warnings.push(values.map(describe).join(" "));
  originalWarn(...values);
  publish();
};
console.error = (...values: unknown[]): void => {
  errors.push(values.map(describe).join(" "));
  originalError(...values);
  publish();
};
window.addEventListener("error", (event) => {
  errors.push(event.error instanceof Error ? event.error.message : event.message);
  publish();
});
window.addEventListener("unhandledrejection", (event) => {
  errors.push(describe(event.reason));
  publish();
});

const scenario = new URLSearchParams(location.search).get("scenario") === "cube" ? "cube" : "plane";
const creationAction = scenario === "cube" ? "add-cube" : "add-plane";
const projectId = `stage-2-${scenario}`;

const result: SmokeResult = {
  scenario,
  status: "STARTING",
  phase: "initialize",
  browser: navigator.userAgent,
  webgl2: false,
  mesh: { vertices: 0, edges: 0, corners: 0, faces: 0, version: 0 },
  selectedFaceIds: [],
  frameFingerprint: null,
  frameFinite: false,
  rendererEvidence: null,
  history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
  historyLabels: [],
  stableIdsAfterReload: null,
  savedDocumentBytes: 0,
  exportSizes: { obj: 0, glb: 0 },
  actions: [],
  warnings,
  errors,
};

const databaseName = `octopoly-basic-primitives-${scenario}-${location.pathname.replace(/[^a-z0-9]/gi, "-")}`;
const workspace: CoreWorkspace = createProductionCoreWorkspace({ databaseName });
let frame: SelectionFrame | null = null;
let ui: BasicPrimitivesUiAdapter | null = null;
let gl: WebGL2RenderingContext | null = null;
let savedIds: string | null = null;
let savedFaceIds: number[] = [];
let actionChain = Promise.resolve();

const entry = createBasicPrimitivesEntry({
  mesh: workspace.mesh,
  mutations: workspace.mutations,
  history: workspace.history,
  selection: workspace.selection,
  getCamera: () => workspace.cameraSnapshot(),
  getViewport: () => workspace.viewportSnapshot(),
  applyFrame(nextFrame) {
    // CoreWorkspace does not expose a camera replacement setter. Stage 1 records
    // the real entry's finite framing plan rather than duplicating camera state.
    frame = nextFrame;
  },
  requestRender: () => workspace.requestRender(),
});

ui = mountBasicPrimitivesUi(viewport, {
  importReference: () => runAction("import-reference", async () => {
    throw new Error("Reference import is intentionally outside this reference-free Stage 1 harness");
  }),
  addPlane: () => runAction("add-plane", async () => {
    if (scenario !== "plane") throw new Error("This browser scenario requires Add Cube");
    if (!entry.state().emptyMesh) throw new Error("Stage 1 Add Plane requires an empty New Scene");
    const created = entry.addPlane();
    if ((created.faces?.length ?? 0) !== 1) throw new Error("Add Plane did not create exactly one face");
    await captureRendererEvidence();
  }),
  addCube: () => runAction("add-cube", async () => {
    if (scenario !== "cube") throw new Error("This browser scenario requires Add Plane");
    if (!entry.state().emptyMesh) throw new Error("Add Cube requires an empty New Scene");
    const created = entry.addCube();
    if ((created.faces?.length ?? 0) !== 6) throw new Error("Add Cube did not create exactly six faces");
    await captureRendererEvidence();
  }),
  frameSelection: () => runAction("frame-selection", async () => {
    if (entry.frameSelection() === null) throw new Error("Frame Selection produced no plan");
    await captureRendererEvidence();
  }),
  save: () => runAction("save", async () => {
    const document = await workspace.saveProject(projectId);
    result.savedDocumentBytes = new Blob([JSON.stringify(document)]).size;
    savedIds = stableIdFingerprint(document.mesh);
    savedFaceIds = document.mesh.faces.map((face) => face.id);
  }),
  reload: () => runAction("reload", async () => {
    if (savedIds === null) throw new Error("Save Project must run before Reload Project");
    if (!(await workspace.loadProject(projectId))) throw new Error(`Saved ${scenario} project was not found`);
    result.stableIdsAfterReload = stableIdFingerprint(workspace.serializedMesh()) === savedIds;
    workspace.selection.update("replace", { faces: new Set(savedFaceIds) });
    await captureRendererEvidence();
  }),
  exportObj: () => runAction("export-obj", async () => {
    result.exportSizes.obj = new TextEncoder().encode(workspace.exportObj()).byteLength;
  }),
  exportGlb: () => runAction("export-glb", async () => {
    result.exportSizes.glb = workspace.exportGlb().byteLength;
  }),
}, uiState(false));

ui.element.dataset.testid = "new-scene-ui";
assignAdapterTestIds(ui.element);
bind(moveButton, "move", moveSelection);
bind(extrudeButton, "extrude", extrudeSelection);
bind(undoButton, "undo", async () => { workspace.history.undo(); await captureRendererEvidence(); });
bind(redoButton, "redo", async () => { workspace.history.redo(); await captureRendererEvidence(); });
publish();

void initialize();

async function initialize(): Promise<void> {
  try {
    const initialized = await workspace.initialize(canvas);
    if (initialized.status !== "ready") {
      result.status = initialized.status === "unsupported" ? "UNSUPPORTED" : "FAIL";
      result.phase = initialized.status;
      if (initialized.status === "failed") errors.push(initialized.reason);
      syncState();
      return;
    }
    gl = canvas.getContext("webgl2");
    if (gl === null) throw new Error("Renderer reported ready without an accessible WebGL2 context");
    result.webgl2 = true;
    await captureRendererEvidence();
    result.status = "READY";
    result.phase = "new-scene";
    syncState();
  } catch (error) {
    fail(error);
  }
}

function bind(button: HTMLButtonElement, action: string, operation: () => Promise<void>): void {
  button.addEventListener("click", () => { void runAction(action, operation); });
}

function runAction(action: string, operation: () => Promise<void>): Promise<void> {
  actionChain = actionChain.then(async () => {
    if (!result.webgl2 || result.status === "UNSUPPORTED") throw new Error("WebGL2 is not ready");
    result.status = "RUNNING";
    result.phase = action;
    setBusy(true);
    syncState();
    try {
      await operation();
      result.actions.push(action);
      recordHistory(action);
      result.status = isComplete() ? "PASS" : "READY";
      result.phase = `${action}-complete`;
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
      syncState();
    }
  });
  return actionChain;
}

async function moveSelection(): Promise<void> {
  assertMeshPresent();
  workspace.selection.update("add", { vertices: new Set(workspace.mesh.snapshot().vertices.map((vertex) => vertex.id)) });
  workspace.activateTool("basic.move-vertices");
  const point = findPick("vertex");
  dispatchGesture(41, point, { x: point.x + 48, y: point.y + 32 });
  expectUndoLabel("Move vertices");
  await captureRendererEvidence();
}

async function extrudeSelection(): Promise<void> {
  assertMeshPresent();
  workspace.activateTool("face.extrude");
  const point = findFaceDragPoint();
  dispatchGesture(42, point, { x: point.x + 56, y: point.y });
  expectUndoLabel("Extrude faces");
  await captureRendererEvidence();
}

function dispatchGesture(pointerId: number, start: { x: number; y: number }, end: { x: number; y: number }): void {
  const down = workspace.dispatch(sample(pointerId, "down", start));
  if (!down.handled || down.capturePointer !== true) throw new Error("Tool rejected deterministic PointerSample down");
  workspace.dispatch(sample(pointerId, "move", end));
  const up = workspace.dispatch(sample(pointerId, "up", end));
  if (!up.handled || up.releasePointer !== true) throw new Error("Tool rejected deterministic PointerSample up");
}

function sample(pointerId: number, phase: PointerPhase, point: { x: number; y: number }): PointerSample {
  return Object.freeze({
    pointerId,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: point.x,
    y: point.y,
    pressure: phase === "up" ? 0 : 0.65,
    tiltX: 0,
    tiltY: 0,
    buttons: phase === "up" ? 0 : 1,
    modifiers: Object.freeze({ alt: false, ctrl: false, meta: false, shift: false }),
    timestamp: performance.now(),
    coalesced: false,
  });
}

function findPick(kind: "vertex" | "face"): { x: number; y: number } {
  const view = workspace.viewportSnapshot();
  const camera = workspace.cameraSnapshot();
  const mesh = workspace.mesh.snapshot();
  for (let y = 4; y < view.cssHeight; y += 6) {
    for (let x = 4; x < view.cssWidth; x += 6) {
      if (workspace.picking.pick({ x, y }, camera, view, mesh, 12)?.kind === kind) return { x, y };
    }
  }
  throw new Error(`Could not locate a rendered ${kind} through the real PickingService`);
}

function findFaceDragPoint(): { x: number; y: number } {
  const view = workspace.viewportSnapshot();
  const camera = workspace.cameraSnapshot();
  const mesh = workspace.mesh.snapshot();
  const center = { x: view.cssWidth / 2, y: view.cssHeight / 2 };
  for (const dx of [36, -36, 28, -28, 20, -20]) {
    for (const dy of [0, 12, -12]) {
      const point = { x: center.x + dx, y: center.y + dy };
      if (workspace.picking.pick(point, camera, view, mesh, 4)?.kind === "face") return point;
    }
  }
  const fallback = findPick("face");
  if (Math.abs(fallback.x - center.x) < 2 && Math.abs(fallback.y - center.y) < 2) {
    throw new Error("Face pick is too camera-normal for deterministic reference-free extrusion");
  }
  return fallback;
}

async function captureRendererEvidence(): Promise<void> {
  if (gl === null) return;
  workspace.requestRender();
  await animationFrame();
  workspace.requestRender();
  gl.finish();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonZeroPixels = 0;
  let nonBackgroundPixels = 0;
  let hash = 2166136261;
  const colors = new Set<string>();
  const background = [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!];
  const stride = Math.max(4, Math.floor(pixels.length / 16_384 / 4) * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0 || pixels[offset + 3] !== 0) nonZeroPixels += 1;
    if (
      pixels[offset] !== background[0]
      || pixels[offset + 1] !== background[1]
      || pixels[offset + 2] !== background[2]
      || pixels[offset + 3] !== background[3]
    ) nonBackgroundPixels += 1;
    if (offset % stride === 0) {
      const color = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]},${pixels[offset + 3]}`;
      if (colors.size < 256) colors.add(color);
      hash ^= pixels[offset]!; hash = Math.imul(hash, 16777619);
      hash ^= pixels[offset + 1]!; hash = Math.imul(hash, 16777619);
      hash ^= pixels[offset + 2]!; hash = Math.imul(hash, 16777619);
      hash ^= pixels[offset + 3]!; hash = Math.imul(hash, 16777619);
    }
  }
  result.rendererEvidence = {
    state: workspace.renderer.state(),
    width,
    height,
    readbackBytes: pixels.byteLength,
    nonZeroPixels,
    nonBackgroundPixels,
    distinctSampledColors: colors.size,
    pixelFingerprint: (hash >>> 0).toString(16).padStart(8, "0"),
  };
}

function syncState(): void {
  const mesh = workspace.mesh.snapshot();
  const history = workspace.history.snapshot();
  result.mesh = counts(mesh);
  result.selectedFaceIds = [...workspace.selection.snapshot().faces].sort((a, b) => a - b);
  result.frameFinite = frame !== null && frameValues(frame).every(Number.isFinite);
  result.frameFingerprint = frame === null ? null : frameValues(frame).map((value) => value.toFixed(6)).join(":");
  result.history = {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel ?? null,
    redoLabel: history.redoLabel ?? null,
  };
  ui?.update(uiState(result.status === "RUNNING"));
  const inactiveCreate = ui?.element.querySelector<HTMLButtonElement>(
    scenario === "cube" ? '[data-testid="add-plane"]' : '[data-testid="add-cube"]',
  );
  if (inactiveCreate !== null && inactiveCreate !== undefined) {
    inactiveCreate.hidden = true;
    inactiveCreate.disabled = true;
  }
  publish();
}

function publish(): void {
  output.dataset.status = result.status.toLowerCase();
  output.textContent = JSON.stringify(result, null, 2);
}

function uiState(busy: boolean) {
  return {
    emptyMesh: entry.state().emptyMesh,
    hasReference: workspace.referenceAssetRefs().length > 0,
    busy,
    error: result.status === "FAIL" ? errors.at(-1) ?? "Stage 1 failed" : null,
    status: `${result.status}: ${result.phase}`,
  } as const;
}

function setBusy(busy: boolean): void {
  moveButton.disabled = busy;
  extrudeButton.disabled = busy;
  undoButton.disabled = busy;
  redoButton.disabled = busy;
}

function recordHistory(action: string): void {
  const history = workspace.history.snapshot();
  result.historyLabels.push({ action, undoLabel: history.undoLabel ?? null, redoLabel: history.redoLabel ?? null });
}

function expectUndoLabel(label: string): void {
  if (workspace.history.snapshot().undoLabel !== label) throw new Error(`Expected history label ${label}`);
}

function assertMeshPresent(): void {
  if (entry.state().emptyMesh) throw new Error("Add Plane must run before modeling actions");
}

function isComplete(): boolean {
  return [creationAction, "move", "extrude", "undo", "redo", "save", "reload", "export-obj", "export-glb"]
    .every((action) => result.actions.includes(action))
    && result.frameFinite
    && result.rendererEvidence !== null
    && result.rendererEvidence.nonZeroPixels > 0
    && result.rendererEvidence.nonBackgroundPixels > 0
    && result.stableIdsAfterReload === true
    && result.exportSizes.obj > 0
    && result.exportSizes.glb > 0
    && warnings.length === 0
    && errors.length === 0;
}

function fail(error: unknown): void {
  const message = describe(error);
  if (!errors.includes(message)) errors.push(message);
  result.status = "FAIL";
  result.phase = "failed";
}

function counts(mesh: MeshSnapshot): SmokeResult["mesh"] {
  return { vertices: mesh.vertices.length, edges: mesh.edges.length, corners: mesh.corners.length, faces: mesh.faces.length, version: mesh.version };
}

function frameValues(value: SelectionFrame): number[] {
  return [value.target.x, value.target.y, value.target.z, value.position.x, value.position.y, value.position.z, value.distance, value.paddingFraction];
}

function stableIdFingerprint(mesh: ProjectDocument["mesh"]): string {
  return JSON.stringify({
    vertices: mesh.vertices.map((item) => item.id).sort((a, b) => a - b),
    edges: mesh.edges.map((item) => item.id).sort((a, b) => a - b),
    corners: mesh.corners.map((item) => item.id).sort((a, b) => a - b),
    faces: mesh.faces.map((item) => item.id).sort((a, b) => a - b),
  });
}

function assignAdapterTestIds(element: HTMLElement): void {
  const ids: Record<string, string> = {
    "Import Reference": "import-reference",
    "Add Plane": "add-plane",
    "Add Cube": "add-cube",
    "Frame Selection": "frame-selection",
    "Save Project": "save-project",
    "Reload Project": "reload-project",
    "Export OBJ": "export-obj",
    "Export GLB": "export-glb",
  };
  for (const button of element.querySelectorAll<HTMLButtonElement>("button")) {
    const id = ids[button.getAttribute("aria-label") ?? ""];
    if (id !== undefined) button.dataset.testid = id;
    if (id === (scenario === "cube" ? "add-plane" : "add-cube")) {
      button.hidden = true;
      button.disabled = true;
    }
  }
  element.querySelector<HTMLElement>("[data-empty-state]")?.setAttribute("data-testid", "new-scene");
}

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function describe(value: unknown): string {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing smoke element: ${selector}`);
  return element;
}
