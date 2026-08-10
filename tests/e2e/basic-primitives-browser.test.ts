import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createBasicPrimitivesEntry } from "../../src/app/composition/primitive-entry";
import { createPerspectiveCameraSnapshot } from "../../src/camera";
import { createHistoryService } from "../../src/history";
import { MeshKernel } from "../../src/mesh";
import { SelectionStore } from "../../src/selection";
import type { SelectionFrame } from "../../src/tools/basic/construction-plane";

interface SmokeCheckpoint {
  readonly action: string;
  readonly mesh: { readonly vertices: number; readonly edges: number; readonly corners: number; readonly faces: number; readonly version: number };
  readonly faceIds: readonly number[];
  readonly faceVertexCounts: readonly number[];
  readonly meshFingerprint: string;
  readonly topologyFingerprint: string;
  readonly stableIdFingerprint: string;
  readonly selectedFaceIds: readonly number[];
  readonly frameFinite: boolean;
  readonly frameFingerprint: string | null;
  readonly renderer: Record<string, unknown>;
  readonly history: Record<string, unknown>;
}

interface SmokeVerification {
  readonly scenario: string;
  readonly requiredActions: readonly string[];
  readonly actions: readonly string[];
  readonly checkpoints: Partial<Record<"creation" | "undo" | "redo" | "afterMove" | "afterExtrude" | "reload", SmokeCheckpoint>>;
  readonly historyLabels: readonly Record<string, unknown>[];
  readonly fingerprintAlgorithm: string;
  readonly stableIdsAfterReload: boolean | null;
  readonly savedDocumentBytes: number;
  readonly exportSizes: Readonly<{ obj: number; glb: number }>;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

interface SmokeResultModule {
  readonly CATALOG_SCENARIOS: readonly string[];
  readonly FINGERPRINT_ALGORITHM: string;
  readonly SMOKE_SCHEMA: string;
  evaluateSmokeCompletion(value: SmokeVerification): { readonly complete: boolean; readonly failures: readonly string[] };
  requiredSmokeActions(scenario: string): readonly string[];
  scenarioExpectation(scenario: string): { readonly scenario: string; readonly counts: Readonly<{ vertices: number; edges: number; corners: number; faces: number }> };
  parseObjExport(payload: string): unknown;
  parseGlbExport(payload: Uint8Array): unknown;
}

const smokeResultPath = join(dirname(fileURLToPath(import.meta.url)), "../../docs/validation/basic-primitives/smoke-result.ts");
const smokeResultModule = existsSync(smokeResultPath)
  ? await vi.importActual<SmokeResultModule>("../../docs/validation/basic-primitives/smoke-result")
  : null;
const CATALOG_SCENARIOS = smokeResultModule?.CATALOG_SCENARIOS ?? [];
const FINGERPRINT_ALGORITHM = smokeResultModule?.FINGERPRINT_ALGORITHM ?? "";
const SMOKE_SCHEMA = smokeResultModule?.SMOKE_SCHEMA ?? "";
const evaluateSmokeCompletion = (value: SmokeVerification) => requiredSmokeModule().evaluateSmokeCompletion(value);
const requiredSmokeActions = (scenario: string) => requiredSmokeModule().requiredSmokeActions(scenario);
const scenarioExpectation = (scenario: string) => requiredSmokeModule().scenarioExpectation(scenario);

function requiredSmokeModule(): SmokeResultModule {
  if (smokeResultModule === null) throw new Error("Workstream 16 docs validation module is unavailable");
  return smokeResultModule;
}

const viewport = Object.freeze({
  cssWidth: 1024,
  cssHeight: 768,
  devicePixelRatio: 2,
});

function createFixture() {
  const mesh = new MeshKernel();
  const history = createHistoryService();
  const selection = new SelectionStore();
  const appliedFrames: SelectionFrame[] = [];
  let renderRequests = 0;
  const camera = createPerspectiveCameraSnapshot(
    { x: 0, y: 0, z: 5 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    Math.PI / 3,
    0.01,
    1_000,
    viewport,
  );
  const entry = createBasicPrimitivesEntry({
    mesh,
    mutations: mesh,
    history,
    selection,
    getCamera: () => camera,
    getViewport: () => viewport,
    applyFrame(frame) {
      appliedFrames.push(frame);
    },
    requestRender() {
      renderRequests += 1;
    },
  });

  return {
    mesh,
    history,
    selection,
    entry,
    appliedFrames,
    renderRequests: () => renderRequests,
  };
}

function expectFiniteFrame(frame: SelectionFrame): void {
  expect([
    frame.target.x,
    frame.target.y,
    frame.target.z,
    frame.position.x,
    frame.position.y,
    frame.position.z,
    frame.distance,
    frame.paddingFraction,
  ].every(Number.isFinite)).toBe(true);
  expect(frame.distance).toBeGreaterThan(0);
  expect(frame.paddingFraction).toBeGreaterThanOrEqual(0.15);
}

describe("basic primitives composition entry", () => {
  it("adds and selects a framed Plane through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addPlane();

    const mesh = fixture.mesh.snapshot();
    expect(mesh.vertices).toHaveLength(4);
    expect(mesh.edges).toHaveLength(4);
    expect(mesh.corners).toHaveLength(4);
    expect(mesh.faces).toHaveLength(1);
    expect([...fixture.selection.snapshot().faces]).toEqual([mesh.faces[0]!.id]);
    expect(fixture.history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Add plane",
    });
    expect(fixture.appliedFrames).toHaveLength(1);
    expectFiniteFrame(fixture.appliedFrames[0]!);
    expect(fixture.renderRequests()).toBe(1);

    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);
    expect(fixture.history.snapshot().canUndo).toBe(false);
  });

  it("adds and selects a framed Cube through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addCube();

    const mesh = fixture.mesh.snapshot();
    expect(mesh.vertices).toHaveLength(8);
    expect(mesh.edges).toHaveLength(12);
    expect(mesh.corners).toHaveLength(24);
    expect(mesh.faces).toHaveLength(6);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Add cube",
    });
    expect(fixture.appliedFrames).toHaveLength(1);
    expectFiniteFrame(fixture.appliedFrames[0]!);
    expect(fixture.renderRequests()).toBe(1);

    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);
    fixture.history.redo();
    expect(fixture.mesh.snapshot().faces).toHaveLength(6);
  });

  it("adds and selects a framed Duck through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addDuck();

    const mesh = fixture.mesh.snapshot();
    expect(mesh.vertices).toHaveLength(24);
    expect(mesh.edges).toHaveLength(36);
    expect(mesh.corners).toHaveLength(72);
    expect(mesh.faces).toHaveLength(18);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add duck");
    expect(fixture.appliedFrames).toHaveLength(1);
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);
  });

  it("adds and selects a framed Frog through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addFrog();

    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([56, 84, 168, 42]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add frog");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds and selects a framed Pig through one real history entry", () => {
    const fixture = createFixture();
    fixture.entry.addPig();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([64, 96, 192, 48]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add pig");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds and selects a framed Cow through one real history entry", () => {
    const fixture = createFixture();
    fixture.entry.addCow();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([72, 108, 216, 54]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add cow");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds and selects a framed Rabbit through one real history entry", () => {
    const fixture = createFixture();
    fixture.entry.addRabbit();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([48, 72, 144, 36]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add rabbit");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("creates the default Cube exactly once only for a genuinely new first mount", () => {
    const fixture = createFixture();

    const created = fixture.entry.ensureDefaultCubeForFirstMount(true);

    expect(created?.faces).toHaveLength(6);
    expect(fixture.mesh.snapshot().faces).toHaveLength(6);
    expect([...fixture.selection.snapshot().faces]).toEqual(fixture.mesh.snapshot().faces.map(({ id }) => id));
    expect(fixture.appliedFrames).toHaveLength(1);
    fixture.history.undo();
    expect(fixture.entry.ensureDefaultCubeForFirstMount(true)).toBeNull();
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);

    const existing = createFixture();
    expect(existing.entry.ensureDefaultCubeForFirstMount(false)).toBeNull();
    expect(existing.entry.ensureDefaultCubeForFirstMount(true)).toBeNull();
    expect(existing.mesh.snapshot().faces).toHaveLength(0);
  });

  it("adds Cat atomically, selects every face, frames it, and undoes to empty", () => {
    const fixture = createFixture();
    fixture.entry.addCat();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([74, 112, 224, 58]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add cat");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Dog atomically, selects every face, frames it, and undoes to empty", () => {
    const fixture = createFixture();
    fixture.entry.addDog();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([80, 120, 240, 60]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add dog");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Fish atomically, selects every face, frames it, and undoes to empty", () => {
    const fixture = createFixture(); fixture.entry.addFish(); const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([40, 60, 120, 30]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add fish"); expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Turtle atomically, selects all faces, frames it, and undoes", () => {
    const fixture = createFixture(); fixture.entry.addTurtle(); const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([56, 84, 168, 42]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add turtle"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Elephant atomically, selects all faces, frames it, and undoes", () => {
    const fixture = createFixture(); fixture.entry.addElephant(); const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([80, 120, 240, 60]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add elephant"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Cup atomically, selects all faces, frames it, and undoes", () => {
    const fixture = createFixture(); fixture.entry.addCup(); const mesh = fixture.mesh.snapshot(); expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([40, 60, 120, 30]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id)); expect(fixture.history.snapshot().undoLabel).toBe("Add cup"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Chair atomically, selects all faces, frames it, and undoes", () => {
    const fixture = createFixture(); fixture.entry.addChair(); const mesh = fixture.mesh.snapshot(); expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([48, 72, 144, 36]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id)); expect(fixture.history.snapshot().undoLabel).toBe("Add chair"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds Flowerpot atomically, selects all faces, frames it, and undoes", () => { const fixture = createFixture(); fixture.entry.addFlowerpot(); const mesh = fixture.mesh.snapshot(); expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([16, 24, 48, 12]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id)); expect(fixture.history.snapshot().undoLabel).toBe("Add flowerpot"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0); });

  it("adds Kettle atomically, selects all faces, frames it, and undoes", () => { const fixture = createFixture(); fixture.entry.addKettle(); const mesh = fixture.mesh.snapshot(); expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([48, 72, 144, 36]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id)); expect(fixture.history.snapshot().undoLabel).toBe("Add kettle"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0); });

  it("adds Sneaker atomically, selects all faces, frames it, and undoes", () => { const fixture=createFixture(); fixture.entry.addSneaker(); const mesh=fixture.mesh.snapshot(); expect([mesh.vertices.length,mesh.edges.length,mesh.corners.length,mesh.faces.length]).toEqual([32, 48, 96, 24]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({id})=>id)); expect(fixture.history.snapshot().undoLabel).toBe("Add sneaker"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0); });

  it("adds Backpack atomically, selects all faces, frames it, and undoes", () => { const fixture=createFixture(); fixture.entry.addBackpack(); const mesh=fixture.mesh.snapshot(); expect([mesh.vertices.length,mesh.edges.length,mesh.corners.length,mesh.faces.length]).toEqual([48,72,144,36]); expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({id})=>id)); expect(fixture.history.snapshot().undoLabel).toBe("Add backpack"); expectFiniteFrame(fixture.appliedFrames[0]!); fixture.history.undo(); expect(fixture.mesh.snapshot().vertices).toHaveLength(0); });

  it("adds Helmet atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addHelmet();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([40, 60, 120, 28]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add helmet");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("adds Gamepad atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addGamepad();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([80, 120, 240, 56]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add gamepad");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("adds Camera atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addCamera();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([32, 48, 96, 22]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add camera");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("adds Bicycle Saddle atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addBicycleSaddle();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([24, 36, 72, 18]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add bicycle saddle");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("adds Car atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addCar();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([80, 120, 240, 52]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add car");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("adds Rocket atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addRocket();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([53, 80, 160, 39]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add rocket");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("adds Treasure Chest atomically, selects all faces, frames it, and undoes",()=>{const f=createFixture();f.entry.addTreasureChest();const m=f.mesh.snapshot();expect([m.vertices.length,m.edges.length,m.corners.length,m.faces.length]).toEqual([24,36,72,18]);expect([...f.selection.snapshot().faces]).toEqual(m.faces.map(({id})=>id));expect(f.history.snapshot().undoLabel).toBe("Add treasure chest");expectFiniteFrame(f.appliedFrames[0]!);f.history.undo();expect(f.mesh.snapshot().vertices).toHaveLength(0);});

  it("makes frameSelection an explicit no-op for an empty selection", () => {
    const fixture = createFixture();
    const before = fixture.mesh.snapshot();

    fixture.entry.frameSelection();

    expect(fixture.mesh.snapshot()).toEqual(before);
    expect(fixture.appliedFrames).toEqual([]);
    expect(fixture.renderRequests()).toBe(0);
  });

  it("reports empty and non-empty mesh state across add and undo", () => {
    const fixture = createFixture();

    expect(fixture.entry.state()).toMatchObject({ emptyMesh: true });
    fixture.entry.addPlane();
    expect(fixture.entry.state()).toMatchObject({ emptyMesh: false });

    fixture.history.undo();
    expect(fixture.entry.state()).toMatchObject({ emptyMesh: true });
  });
});

const smokeRenderer = Object.freeze({
  state: "ready",
  width: 800,
  height: 600,
  readbackBytes: 1_920_000,
  nonZeroPixels: 480_000,
  nonBackgroundPixels: 10_000,
  distinctSampledColors: 4,
  pixelFingerprint: "feedbeef",
});

function smokeCheckpoint(overrides: Record<string, unknown> = {}): SmokeCheckpoint {
  return {
    action: "add-cube",
    mesh: { vertices: 8, edges: 12, corners: 24, faces: 6, version: 1 },
    faceIds: [0, 1, 2, 3, 4, 5],
    faceVertexCounts: [4, 4, 4, 4, 4, 4],
    meshFingerprint: "100:aaaaaaaa:bbbbbbbb",
    topologyFingerprint: "80:cccccccc:dddddddd",
    stableIdFingerprint: "40:eeeeeeee:ffffffff",
    selectedFaceIds: [0, 1, 2, 3, 4, 5],
    frameFinite: true,
    frameFingerprint: "finite-frame",
    renderer: smokeRenderer,
    history: { canUndo: true, canRedo: false, undoLabel: "Add cube", redoLabel: null },
    ...overrides,
  } as unknown as SmokeCheckpoint;
}

function validSmokeVerification(): SmokeVerification {
  const creation = smokeCheckpoint();
  const afterExtrude = smokeCheckpoint({
    action: "extrude",
    mesh: { vertices: 12, edges: 20, corners: 40, faces: 10, version: 4 },
    faceIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    faceVertexCounts: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    meshFingerprint: "180:11111111:22222222",
    topologyFingerprint: "140:33333333:44444444",
    stableIdFingerprint: "60:55555555:66666666",
    selectedFaceIds: [6],
    history: { canUndo: true, canRedo: false, undoLabel: "Extrude faces", redoLabel: null },
  });
  const historyLabels = [
    { action: "add-cube", canUndo: true, canRedo: false, undoLabel: "Add cube", redoLabel: null },
    { action: "undo", canUndo: false, canRedo: true, undoLabel: null, redoLabel: "Add cube" },
    { action: "redo", canUndo: true, canRedo: false, undoLabel: "Add cube", redoLabel: null },
    { action: "move", canUndo: true, canRedo: false, undoLabel: "Move vertices", redoLabel: null },
    { action: "extrude", canUndo: true, canRedo: false, undoLabel: "Extrude faces", redoLabel: null },
    { action: "save", canUndo: true, canRedo: false, undoLabel: "Extrude faces", redoLabel: null },
    { action: "reload", canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
    { action: "export-obj", canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
    { action: "export-glb", canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
  ];
  return {
    scenario: "cube",
    expectedFaces: 6,
    requiredActions: [...requiredSmokeActions("cube")],
    actions: [...requiredSmokeActions("cube")],
    checkpoints: {
      creation,
      undo: smokeCheckpoint({
        action: "undo",
        mesh: { vertices: 0, edges: 0, corners: 0, faces: 0, version: 2 },
        faceIds: [],
        faceVertexCounts: [],
        meshFingerprint: "20:77777777:88888888",
        topologyFingerprint: "20:77777777:88888888",
        stableIdFingerprint: "20:99999999:aaaaaaaa",
        selectedFaceIds: [],
        frameFinite: false,
        frameFingerprint: null,
        renderer: { ...smokeRenderer, nonBackgroundPixels: 0, distinctSampledColors: 1 },
        history: { canUndo: false, canRedo: true, undoLabel: null, redoLabel: "Add cube" },
      }),
      redo: smokeCheckpoint({ action: "redo", selectedFaceIds: [], mesh: { ...creation.mesh, version: 3 } }),
      afterMove: smokeCheckpoint({
        action: "move",
        meshFingerprint: "120:bbbbbbbb:cccccccc",
        history: { canUndo: true, canRedo: false, undoLabel: "Move vertices", redoLabel: null },
      }),
      afterExtrude,
      reload: smokeCheckpoint({
        ...afterExtrude,
        action: "reload",
        mesh: { ...afterExtrude.mesh, version: 5 },
        history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
      }),
    },
    historyLabels,
    fingerprintAlgorithm: "json-fnv1a-dual-v1",
    stableIdsAfterReload: true,
    savedDocumentBytes: 100,
    exportSizes: { obj: 200, glb: 400 },
    exports: {
      obj: {
        byteLength: 200,
        vertexCount: 12,
        faceCount: 20,
        triangleCount: 20,
        payloadFingerprint: "c8:12345678:90abcdef",
      },
      glb: {
        byteLength: 400,
        magic: "glTF",
        version: 2,
        declaredLength: 400,
        jsonChunkBytes: 200,
        primitiveCount: 1,
        positionCount: 12,
        indexCount: 60,
        triangleCount: 20,
        payloadFingerprint: "190:abcdef12:34567890",
      },
    },
    warnings: [],
    errors: [],
  } as unknown as SmokeVerification;
}

interface MutableSmokeCheckpoint {
  action: string;
  mesh: { vertices: number; edges: number; corners: number; faces: number; version: number };
  faceIds: number[];
  selectedFaceIds: number[];
  meshFingerprint: string;
  topologyFingerprint: string;
  stableIdFingerprint: string;
  history: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null };
}

interface MutableSmokeVerification {
  expectedFaces?: number;
  requiredActions: string[];
  actions: string[];
  checkpoints: Record<"creation" | "undo" | "redo" | "afterMove" | "afterExtrude" | "reload", MutableSmokeCheckpoint>;
  historyLabels: Array<{ action: string; canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null }>;
  exports: {
    obj: { vertexCount: number };
    glb: { positionCount: number; triangleCount: number };
  };
}

function mutateSmoke(mutate: (value: MutableSmokeVerification) => void): SmokeVerification {
  const value = structuredClone(validSmokeVerification()) as unknown as MutableSmokeVerification;
  mutate(value);
  return value as unknown as SmokeVerification;
}

describe.skipIf(smokeResultModule === null)("basic-primitives smoke evidence fail-closed contract", () => {
  it("defines exactly the authoritative 25-scenario set without duplicate Kettle or Sneaker", () => {
    expect(CATALOG_SCENARIOS).toHaveLength(25);
    expect(new Set(CATALOG_SCENARIOS).size).toBe(25);
    expect(CATALOG_SCENARIOS.filter((scenario) => scenario === "kettle")).toHaveLength(1);
    expect(CATALOG_SCENARIOS.filter((scenario) => scenario === "sneaker")).toHaveLength(1);
    for (const scenario of CATALOG_SCENARIOS) {
      expect(scenarioExpectation(scenario).scenario).toBe(scenario);
    }
  });

  it("accepts one fully authoritative structurally validated smoke result", () => {
    expect(evaluateSmokeCompletion(validSmokeVerification())).toEqual({ complete: true, failures: [] });
  });

  it.each([
    ["vertices", 9],
    ["edges", 13],
    ["corners", 25],
    ["faces", 7],
  ] as const)("rejects authoritative creation %s count mismatch", (field, wrong) => {
    const value = mutateSmoke((candidate) => {
      for (const phase of ["creation", "redo", "afterMove"] as const) candidate.checkpoints[phase].mesh[field] = wrong;
      if (field === "faces") {
        candidate.expectedFaces = wrong;
        candidate.checkpoints.creation.faceIds = Array.from({ length: wrong }, (_, index) => index);
        candidate.checkpoints.creation.selectedFaceIds = Array.from({ length: wrong }, (_, index) => index);
        candidate.checkpoints.afterMove.faceIds = Array.from({ length: wrong }, (_, index) => index);
        candidate.checkpoints.afterMove.selectedFaceIds = Array.from({ length: wrong }, (_, index) => index);
      }
    });
    expect(evaluateSmokeCompletion(value).complete).toBe(false);
  });

  it("rejects wrong same-length selected face IDs", () => {
    const value = mutateSmoke((candidate) => {
      candidate.checkpoints.creation.selectedFaceIds = [100, 101, 102, 103, 104, 105];
    });
    expect(evaluateSmokeCompletion(value).complete).toBe(false);
  });

  it("derives required actions internally and rejects caller-supplied omissions", () => {
    const value = mutateSmoke((candidate) => {
      candidate.requiredActions = ["add-cube", "undo", "redo", "save", "reload", "export-obj", "export-glb"];
      candidate.actions = [...candidate.requiredActions];
    });
    expect(evaluateSmokeCompletion(value).complete).toBe(false);
  });

  it.each([
    ["creation", "wrong-add"],
    ["undo", "wrong-undo"],
    ["redo", "wrong-redo"],
    ["afterMove", "wrong-move"],
    ["afterExtrude", "wrong-extrude"],
    ["reload", "wrong-reload"],
  ] as const)("rejects wrong %s checkpoint action field", (phase, wrongAction) => {
    const value = mutateSmoke((candidate) => { candidate.checkpoints[phase].action = wrongAction; });
    expect(evaluateSmokeCompletion(value).complete).toBe(false);
  });

  it("rejects malformed nonempty fingerprints", () => {
    const value = mutateSmoke((candidate) => {
      for (const phase of ["creation", "redo", "afterMove"] as const) {
        candidate.checkpoints[phase].topologyFingerprint = "not-empty";
        candidate.checkpoints[phase].stableIdFingerprint = "not-empty";
      }
    });
    expect(evaluateSmokeCompletion(value).complete).toBe(false);
  });

  it.each(["creation", "undo", "redo", "reload"] as const)(
    "rejects wrong %s checkpoint history state",
    (phase) => {
      const value = mutateSmoke((candidate) => {
        candidate.checkpoints[phase].history = { canUndo: true, canRedo: true, undoLabel: "Wrong", redoLabel: "Wrong" };
      });
      expect(evaluateSmokeCompletion(value).complete).toBe(false);
    },
  );

  it.each(["add-cube", "undo", "redo", "move", "extrude", "save", "reload", "export-obj", "export-glb"])(
    "rejects wrong %s action-by-action history record",
    (action) => {
      const value = mutateSmoke((candidate) => {
        const record = candidate.historyLabels.find((entry: { action: string }) => entry.action === action);
        expect(record).toBeDefined();
        if (record === undefined) throw new Error(`missing fixture history record for ${action}`);
        record.canUndo = !record.canUndo;
        record.undoLabel = "Wrong";
      });
      expect(evaluateSmokeCompletion(value).complete).toBe(false);
    },
  );

  it("rejects garbage OBJ and GLB payloads through structural parsers", () => {
    const parsers = smokeResultModule as unknown as {
      parseObjExport?: (payload: string) => unknown;
      parseGlbExport?: (payload: Uint8Array) => unknown;
    };
    expect(parsers.parseObjExport).toBeTypeOf("function");
    expect(parsers.parseGlbExport).toBeTypeOf("function");
    expect(() => parsers.parseObjExport?.("garbage")).toThrow();
    expect(() => parsers.parseGlbExport?.(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });

  it("rejects parsed export metadata that disagrees with the edited mesh", () => {
    const value = mutateSmoke((candidate) => {
      candidate.exports.obj.vertexCount = 999;
      candidate.exports.glb.positionCount = 999;
      candidate.exports.glb.triangleCount = 999;
    });
    expect(evaluateSmokeCompletion(value).complete).toBe(false);
  });

  it("keeps evaluator and evidence tests inside exact Workstream 16 ownership inventory", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const resultPath = join(root, "docs/workplan/16_BASIC_PRIMITIVES.md");
    expect(existsSync(join(root, "src/app/composition/basic-primitives-smoke-result.ts"))).toBe(false);
    expect(existsSync(join(root, "tests/validation/basic-primitives-smoke-result.test.ts"))).toBe(false);
    const resultText = readFileSync(resultPath, "utf8");
    expect(resultText).toContain("docs/validation/basic-primitives/smoke-result.ts");
    expect(resultText).toContain("tests/e2e/basic-primitives-browser.test.ts");
  });

  it("validates raw 25-scenario evidence against authoritative recipes and generator provenance", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const evidencePath = join(root, "docs/validation/basic-primitives/desktop-chrome-catalog-25.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      schemaVersion: number;
      candidateBaseHead: string;
      generator: Record<string, string>;
      scenarioCount: number;
      scenarios: SmokeVerification[];
    };
    expect(evidence.schemaVersion).toBe(3);
    expect(evidence.candidateBaseHead).toBe("165508b5a489f9d39b6491531aa1356ceb6f2d0b");
    expect(evidence.generator).toEqual({
      runner: "docs/validation/basic-primitives/catalog-runner.ts",
      harness: "docs/validation/basic-primitives/browser-smoke.ts",
      evaluator: "docs/validation/basic-primitives/smoke-result.ts",
      schema: SMOKE_SCHEMA,
      fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
    });
    expect(evidence.scenarioCount).toBe(25);
    expect(evidence.scenarios.map(({ scenario }) => scenario)).toEqual(CATALOG_SCENARIOS);
    expect(new Set(evidence.scenarios.map(({ scenario }) => scenario))).toHaveLength(25);
    for (const result of evidence.scenarios) {
      const scenario = CATALOG_SCENARIOS.find((candidate) => candidate === result.scenario);
      expect(scenario).toBeDefined();
      expect(scenarioExpectation(scenario!).counts).toEqual({
        vertices: result.checkpoints.creation?.mesh.vertices,
        edges: result.checkpoints.creation?.mesh.edges,
        corners: result.checkpoints.creation?.mesh.corners,
        faces: result.checkpoints.creation?.mesh.faces,
      });
      expect(Object.hasOwn(result, "expectedFaces")).toBe(false);
      expect(evaluateSmokeCompletion(result)).toEqual({ complete: true, failures: [] });
    }
  });
});
