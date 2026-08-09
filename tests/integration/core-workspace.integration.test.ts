import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Mat4,
  PointerPhase,
  ProjectDocument,
  TriangleMeshSnapshot,
} from "@octopoly/contracts";

import { mountCoreWorkspace } from "../../src/app/bootstrap";
import { CoreWorkspace } from "../../src/app/composition";
import { IndexedDbReferenceAssetService } from "../../src/project";
import { DeterministicRetopoEngine } from "../../src/retopo";
import {
  IntegrationWebGL2,
  MemoryProjectStorage,
  TrackingImageAssetService,
  TrackingProjectRepository,
} from "./fakes";

const REFERENCE: TriangleMeshSnapshot = Object.freeze({
  version: 7,
  positions: Object.freeze([
    Object.freeze({ x: -5, y: -5, z: 0 }),
    Object.freeze({ x: 5, y: -5, z: 0 }),
    Object.freeze({ x: 5, y: 5, z: 0 }),
    Object.freeze({ x: -5, y: 5, z: 0 }),
  ]),
  normals: Object.freeze([
    Object.freeze({ x: 0, y: 0, z: 1 }),
    Object.freeze({ x: 0, y: 0, z: 1 }),
    Object.freeze({ x: 0, y: 0, z: 1 }),
    Object.freeze({ x: 0, y: 0, z: 1 }),
  ]),
  indices: Object.freeze([0, 1, 2, 0, 2, 3]),
});

const TRANSLATE_X: Mat4 = Object.freeze({
  elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 0, 0, 1,
  ]),
});

interface Harness {
  readonly workspace: CoreWorkspace;
  readonly storage: MemoryProjectStorage;
  readonly repository: TrackingProjectRepository;
  readonly events: string[];
  readonly images: TrackingImageAssetService[];
}

function createHarness(options: { readonly stagedBudget?: number } = {}): Harness {
  const storage = new MemoryProjectStorage();
  const events: string[] = [];
  const images: TrackingImageAssetService[] = [];
  const repository = new TrackingProjectRepository(storage, events);
  const workspace = new CoreWorkspace({
    referenceAssets: new IndexedDbReferenceAssetService(storage, {
      createId: () => `reference-${storage.values.size}`,
    }),
    projects: repository,
    createImageAssets: (refs) => {
      const service = new TrackingImageAssetService(storage, refs, events);
      images.push(service);
      return service;
    },
    disposeInfrastructure: () => storage.dispose(),
    initialViewport: { cssWidth: 200, cssHeight: 200, devicePixelRatio: 2 },
    ...(options.stagedBudget === undefined
      ? {}
      : {
          createRetopo: () =>
            new DeterministicRetopoEngine({ maxStagedSteps: options.stagedBudget! }),
        }),
  });
  return { workspace, storage, repository, events, images };
}

function canvasFor(gl: IntegrationWebGL2): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: () => gl.context,
  });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const captured = new Set<number>();
  canvas.setPointerCapture = vi.fn((id: number) => captured.add(id));
  canvas.releasePointerCapture = vi.fn((id: number) => captured.delete(id));
  canvas.hasPointerCapture = vi.fn((id: number) => captured.has(id));
  document.body.append(canvas);
  return canvas;
}

function pointerEvent(
  type: string,
  values: {
    readonly pointerId: number;
    readonly x: number;
    readonly y: number;
    readonly timestamp: number;
    readonly phase?: PointerPhase;
    readonly coalesced?: ReadonlyArray<PointerEvent>;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: values.x,
    clientY: values.y,
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
  });
  for (const [name, value] of Object.entries({
    pointerId: values.pointerId,
    pointerType: "pen",
    isPrimary: true,
    pressure: type === "pointerup" || type === "pointercancel" ? 0 : 0.65,
    tiltX: 12,
    tiltY: -8,
    timeStamp: values.timestamp,
    getCoalescedEvents: () => [...(values.coalesced ?? [])],
  })) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  return event as PointerEvent;
}

function dispatchStroke(
  canvas: HTMLCanvasElement,
  pointerId: number,
  y: number,
  timestamp: number,
): void {
  canvas.dispatchEvent(pointerEvent("pointerdown", {
    pointerId,
    x: 60,
    y,
    timestamp,
  }));
  const coalesced = pointerEvent("pointermove", {
    pointerId,
    x: 80,
    y,
    timestamp: timestamp + 1,
  });
  canvas.dispatchEvent(pointerEvent("pointermove", {
    pointerId,
    x: 110,
    y,
    timestamp: timestamp + 2,
    coalesced: [coalesced],
  }));
  canvas.dispatchEvent(pointerEvent("pointerup", {
    pointerId,
    x: 140,
    y,
    timestamp: timestamp + 3,
  }));
}

function beginStroke(
  canvas: HTMLCanvasElement,
  pointerId: number,
  y: number,
  timestamp: number,
): void {
  canvas.dispatchEvent(pointerEvent("pointerdown", {
    pointerId,
    x: 60,
    y,
    timestamp,
  }));
  canvas.dispatchEvent(pointerEvent("pointermove", {
    pointerId,
    x: 100,
    y,
    timestamp: timestamp + 1,
  }));
}

function installFrameQueue(): { readonly flush: () => void } {
  let next = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = next;
    next += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return {
    flush(): void {
      const queued = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of queued) {
        callback(performance.now());
      }
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CoreWorkspace vertical integration", () => {
  it("mounts an accessible production workspace and keeps unsupported WebGL2 explicit", async () => {
    const frames = installFrameQueue();
    const ready = createHarness();
    const gl = new IntegrationWebGL2();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl.context);
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const root = document.body.appendChild(document.createElement("div"));
    const mounted = await mountCoreWorkspace(root, {
      createWorkspace: () => ready.workspace,
    });
    frames.flush();

    expect(mounted.renderer.status).toBe("ready");
    expect(root.dataset.renderer).toBe("ready");
    expect(root.querySelector('canvas[aria-label="OctoPoly modeling viewport"]')).not.toBeNull();
    expect(root.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(root.querySelector('input[aria-label="Import OBJ reference"]')).not.toBeNull();
    expect(root.textContent).toContain("Import OBJ");
    expect(root.textContent).toContain("Export OBJ");
    expect(root.textContent).toContain("Export GLB");
    expect(root.querySelectorAll("button").length).toBeGreaterThan(7);
    expect(root.querySelector('[role="status"]')?.textContent).toContain("WebGL2 ready");
    mounted.dispose();

    vi.restoreAllMocks();
    const unsupported = createHarness();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const fallbackRoot = document.body.appendChild(document.createElement("div"));
    const fallback = await mountCoreWorkspace(fallbackRoot, {
      createWorkspace: () => unsupported.workspace,
    });
    expect(fallback.renderer).toMatchObject({ status: "unsupported" });
    expect(fallbackRoot.dataset.renderer).toBe("unsupported");
    expect(fallbackRoot.querySelector("canvas")).not.toBeNull();
    expect(fallbackRoot.querySelector('[role="status"]')?.textContent).toContain(
      "WebGL2 unsupported",
    );
    fallback.dispose();

    vi.restoreAllMocks();
    const failed = createHarness();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("synthetic context failure");
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const failedRoot = document.body.appendChild(document.createElement("div"));
    const failedMount = await mountCoreWorkspace(failedRoot, {
      createWorkspace: () => failed.workspace,
    });
    expect(failedMount.renderer).toEqual({
      status: "failed",
      reason: "synthetic context failure",
    });
    expect(failedRoot.querySelector('[role="status"]')?.textContent).toContain(
      "WebGL2 failed",
    );
    failedMount.dispose();
  });

  it("runs reference persistence, normalized Pencil retopo, grouped history, reload, and export", async () => {
    const frames = installFrameQueue();
    const harness = createHarness();
    const gl = new IntegrationWebGL2();
    const canvas = canvasFor(gl);
    const initialized = await harness.workspace.initialize(canvas);
    expect(initialized.status).toBe("ready");

    const ref = await harness.workspace.importReference(REFERENCE, TRANSLATE_X);
    expect(ref.worldTransform).toEqual(TRANSLATE_X);
    expect(harness.workspace.renderedReferenceGeometry()?.positions[0]).toEqual({
      x: -4,
      y: -5,
      z: 0,
    });
    frames.flush();
    expect(gl.draws.length + gl.arrayDraws.length).toBeGreaterThan(0);

    dispatchStroke(canvas, 11, 80, 10);
    expect(harness.workspace.mesh.snapshot().faces).toHaveLength(0);
    expect(harness.workspace.history.snapshot().canUndo).toBe(false);

    dispatchStroke(canvas, 12, 120, 20);
    const committed = harness.workspace.serializedMesh();
    // Four retained points per chain (down, coalesced move, raw move, up)
    // become eight stable vertices and three quad faces.
    expect(committed.vertices).toHaveLength(8);
    expect(committed.faces).toHaveLength(3);
    expect(harness.workspace.history.snapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: "Retopo stroke",
    });

    harness.workspace.history.undo();
    expect(harness.workspace.mesh.snapshot().faces).toHaveLength(0);
    expect(harness.workspace.history.snapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
    });
    harness.workspace.history.redo();
    expect(harness.workspace.serializedMesh()).toEqual(committed);
    expect(harness.workspace.history.snapshot().canRedo).toBe(false);

    const image = await harness.workspace.importImage(new Blob(["image"]));
    await harness.workspace.extensionHost.state.load({
      "unknown.integration": {
        schemaVersion: 3,
        data: { retained: true },
        imageAssets: [image],
      },
    });
    const saved: ProjectDocument = await harness.workspace.saveProject("vertical");
    expect(saved.mesh).toEqual(committed);
    expect(saved.referenceAssets).toEqual([ref]);
    expect(saved.imageAssets).toEqual([image]);
    expect(saved.extensionData).toEqual({
      "unknown.integration": {
        schemaVersion: 3,
        data: { retained: true },
        imageAssets: [image],
      },
    });
    expect(harness.events.slice(-2)).toEqual(["image-flush", "project-save"]);

    const vertex = committed.vertices[0]!;
    harness.workspace.mutations.execute("temporary move", {
      kind: "setVertexPositions",
      positions: new Map([[vertex.id, { x: 99, y: 99, z: 99 }]]),
    });
    expect(harness.workspace.mesh.vertex(vertex.id)?.position).not.toEqual(vertex.position);
    await expect(harness.workspace.loadProject("vertical")).resolves.toBe(true);
    expect(harness.workspace.serializedMesh()).toEqual(committed);
    expect(harness.workspace.referenceAssetRefs()).toEqual([ref]);
    expect(harness.workspace.extensionHost.state.save().values).toEqual(saved.extensionData);
    expect(harness.workspace.renderedReferenceGeometry()?.positions[0]).toEqual({
      x: -4,
      y: -5,
      z: 0,
    });

    expect(harness.workspace.exportObj()).toContain("# OctoPoly OBJ");
    const glb = harness.workspace.exportGlb();
    expect(new DataView(glb).getUint32(0, true)).toBe(0x46546c67);
    expect(harness.workspace.extensions.active()).toEqual([]);
    expect(harness.workspace.rendererExtensions.list()).toEqual([]);
    expect(harness.workspace.extensionHost.state.save()).toEqual({
      values: saved.extensionData,
      imageAssets: [image],
    });

    harness.workspace.dispose();
    harness.workspace.dispose();
    expect(harness.images.every((service) => service.disposeCount === 1)).toBe(true);
    expect(harness.repository.disposeCount).toBe(1);
    expect(harness.storage.disposed()).toBe(true);
  });

  it("rolls back lost capture and recreates retained retopo state for the next gesture pair", async () => {
    installFrameQueue();
    const harness = createHarness();
    const canvas = canvasFor(new IntegrationWebGL2());
    await harness.workspace.initialize(canvas);
    await harness.workspace.importReference(REFERENCE, TRANSLATE_X);

    dispatchStroke(canvas, 21, 80, 100);
    beginStroke(canvas, 22, 120, 110);
    canvas.dispatchEvent(pointerEvent("lostpointercapture", {
      pointerId: 22,
      x: 100,
      y: 120,
      timestamp: 112,
    }));

    expect(harness.workspace.mesh.snapshot()).toMatchObject({ vertices: [], faces: [] });
    expect(harness.workspace.history.snapshot()).toMatchObject({
      canUndo: false,
      canRedo: false,
    });
    expect(harness.workspace.sceneSnapshot()).not.toHaveProperty("preview");

    // The first post-cancel stroke must seed a fresh engine, not pair with stale state.
    dispatchStroke(canvas, 23, 80, 120);
    expect(harness.workspace.mesh.snapshot().faces).toHaveLength(0);
    dispatchStroke(canvas, 24, 120, 130);
    expect(harness.workspace.mesh.snapshot().faces.length).toBeGreaterThan(0);
    expect(harness.workspace.history.snapshot().canUndo).toBe(true);
    harness.workspace.dispose();
  });

  it("cancels an active gesture on document replacement and rejects over-budget staged work atomically", async () => {
    installFrameQueue();
    const replacement = createHarness();
    const replacementCanvas = canvasFor(new IntegrationWebGL2());
    await replacement.workspace.initialize(replacementCanvas);
    await replacement.workspace.importReference(REFERENCE, TRANSLATE_X);
    await replacement.workspace.saveProject("empty");

    dispatchStroke(replacementCanvas, 31, 80, 200);
    beginStroke(replacementCanvas, 32, 120, 210);
    await replacement.workspace.loadProject("empty");
    expect(replacement.workspace.mesh.snapshot().faces).toHaveLength(0);
    expect(replacement.workspace.sceneSnapshot()).not.toHaveProperty("preview");
    dispatchStroke(replacementCanvas, 33, 80, 220);
    expect(replacement.workspace.mesh.snapshot().faces).toHaveLength(0);
    replacement.workspace.dispose();

    const budget = createHarness({ stagedBudget: 2 });
    const budgetCanvas = canvasFor(new IntegrationWebGL2());
    await budget.workspace.initialize(budgetCanvas);
    await budget.workspace.importReference(REFERENCE, TRANSLATE_X);
    dispatchStroke(budgetCanvas, 41, 80, 300);
    dispatchStroke(budgetCanvas, 42, 120, 310);
    expect(budget.workspace.mesh.snapshot()).toMatchObject({ vertices: [], faces: [] });
    expect(budget.workspace.history.snapshot()).toMatchObject({
      canUndo: false,
      canRedo: false,
    });
    expect(budget.workspace.sceneSnapshot()).not.toHaveProperty("preview");
    budget.workspace.dispose();
  });

  it("restores the concrete WebGL2 renderer after context loss", async () => {
    installFrameQueue();
    const harness = createHarness();
    const canvas = canvasFor(new IntegrationWebGL2());
    await harness.workspace.initialize(canvas);
    expect(harness.workspace.renderer.state()).toBe("ready");

    const loss = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(loss);
    expect(loss.defaultPrevented).toBe(true);
    expect(harness.workspace.renderer.state()).toBe("context-lost");
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await vi.waitFor(() => expect(harness.workspace.renderer.state()).toBe("ready"));

    harness.workspace.handleContextLoss();
    expect(harness.workspace.renderer.state()).toBe("context-lost");
    await expect(harness.workspace.restoreRenderer()).resolves.toMatchObject({ status: "ready" });
    harness.workspace.dispose();
  });
});
