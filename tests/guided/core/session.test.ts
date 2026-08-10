import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  HistoryService,
  HistorySnapshot,
  MeshQuery,
  MeshSnapshot,
  RetopoEngine,
  SelectionService,
  SelectionSnapshot,
  Unsubscribe,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { createGuidedSession } from "../../../src/guided/core/session.ts";
import { parseGuidedLesson } from "../../../src/guided/core/lesson.ts";
import { validLessonSource } from "../fixtures/lessons/valid-lessons.ts";

const emptyAttributes: AttributeSnapshot = {
  has<T extends AttributeValue>(_key: AttributeKey<T>): boolean { return false; },
  get<T extends AttributeValue>(_key: AttributeKey<T>, _id: number): T | undefined { return undefined; },
};

function harness() {
  let meshVersion = 1;
  let history: HistorySnapshot = { canUndo: false, canRedo: false };
  let selection: SelectionSnapshot = { version: 1, vertices: new Set(), edges: new Set(), faces: new Set() };
  const calls = { mesh: 0, selection: 0, history: 0, mutation: 0, retopoBegin: 0 };
  const snapshot = (): MeshSnapshot => ({
    version: meshVersion,
    vertices: [], edges: [], corners: [], faces: [], attributes: emptyAttributes,
  });
  const mesh: MeshQuery = {
    snapshot() { calls.mesh += 1; return snapshot(); },
    vertex: () => null,
    edge: () => null,
    corner: () => null,
    face: () => null,
    incidentEdges: () => [],
    incidentFaces: () => [],
    adjacentFaces: () => [],
    findEdge: () => null,
  };
  const selectionService: SelectionService = {
    snapshot() { calls.selection += 1; return selection; },
    update() { calls.mutation += 1; },
    clear() { calls.mutation += 1; },
    prune() { calls.mutation += 1; },
    subscribe(): Unsubscribe { return () => undefined; },
  };
  const historyService: HistoryService = {
    begin() { calls.mutation += 1; throw new Error("must not begin history"); },
    undo() { calls.mutation += 1; },
    redo() { calls.mutation += 1; },
    clear() { calls.mutation += 1; },
    snapshot() { calls.history += 1; return history; },
    subscribe(): Unsubscribe { return () => undefined; },
  };
  const retopo: RetopoEngine = {
    begin() { calls.retopoBegin += 1; throw new Error("must not begin retopo"); },
  };
  return {
    services: { mesh, selection: selectionService, history: historyService, retopo },
    calls,
    setMeshVersion(value: number) { meshVersion = value; },
    setHistory(value: HistorySnapshot) { history = value; },
    setSelection(value: SelectionSnapshot) { selection = value; },
  };
}

function lesson() {
  const parsed = parseGuidedLesson(validLessonSource);
  if (parsed.status !== "ok") throw new Error("fixture must parse");
  return parsed.lesson;
}

describe("Guided session state", () => {
  it("starts only with compatible capabilities and follows pause/resume/skip/abandon semantics", () => {
    const test = harness();
    const session = createGuidedSession(lesson(), test.services);

    expect(session.start(new Set(["editable-mesh"]))).toEqual({ status: "incompatible-start-source", missing: ["reference-geometry"] });
    expect(session.snapshot().state).toBe("idle");
    expect(session.start(new Set(["editable-mesh", "reference-geometry"]))).toEqual({ status: "started" });
    expect(session.snapshot()).toMatchObject({ state: "active", stepId: "encircle-eye" });
    expect(session.pause()).toEqual({ status: "paused", cancelActiveGesture: true, clearPreview: true });
    expect(session.resume()).toEqual({ status: "resumed" });
    expect(session.skip()).toEqual({ status: "not-skippable", stepId: "encircle-eye" });
    expect(session.abandon()).toEqual({ status: "abandoned", cancelActiveGesture: true, clearPreview: true });
    expect(test.calls.mutation).toBe(0);
    expect(test.calls.retopoBegin).toBe(0);
  });

  it("advances only after committed-state evaluation and returns on undo-like mesh change", () => {
    const test = harness();
    const session = createGuidedSession(lesson(), test.services);
    session.start(new Set(["editable-mesh", "reference-geometry"]));

    expect(session.evaluateCommitted(({ mesh }) => mesh.version === 1)).toEqual({ status: "advanced", stepId: "inspect-density" });
    test.setMeshVersion(2);
    expect(session.evaluateCommitted(() => false)).toEqual({ status: "reopened", stepId: "encircle-eye" });
    expect(session.snapshot()).toMatchObject({ state: "active", stepId: "encircle-eye" });
    test.setMeshVersion(1);
    expect(session.evaluateCommitted(() => true)).toEqual({ status: "advanced", stepId: "inspect-density" });
    expect(session.skip()).toEqual({ status: "completed" });
    expect(test.calls.mesh).toBeGreaterThan(0);
    expect(test.calls.selection).toBeGreaterThan(0);
    expect(test.calls.history).toBeGreaterThan(0);
    expect(test.calls.mutation).toBe(0);
  });

  it("distinguishes evaluated optional completion from an intentional skip", () => {
    const evaluatedHarness = harness();
    const evaluated = createGuidedSession(lesson(), evaluatedHarness.services);
    evaluated.start(new Set(["editable-mesh", "reference-geometry"]));
    expect(evaluated.evaluateCommitted(() => true)).toMatchObject({ status: "advanced" });
    expect(evaluated.evaluateCommitted(() => true)).toEqual({ status: "completed" });
    expect(evaluated.evaluateCommitted(({ step }) => step.stepId !== "inspect-density")).toEqual({
      status: "reopened",
      stepId: "inspect-density",
    });

    const skippedHarness = harness();
    const skipped = createGuidedSession(lesson(), skippedHarness.services);
    skipped.start(new Set(["editable-mesh", "reference-geometry"]));
    skipped.evaluateCommitted(() => true);
    expect(skipped.skip()).toEqual({ status: "completed" });
    expect(skipped.snapshot().skippedStepIds).toEqual(["inspect-density"]);
    expect(skipped.evaluateCommitted(({ step }) => step.stepId !== "inspect-density")).toEqual({ status: "unchanged" });
  });

  it("restarts progress only and rejects progress from another lesson version", () => {
    const test = harness();
    const session = createGuidedSession(lesson(), test.services);
    session.start(new Set(["editable-mesh", "reference-geometry"]));
    session.pause();
    const saved = session.exportProgress();

    expect(session.restartConfirmed()).toEqual({ status: "restarted", stepId: "encircle-eye", meshReset: false });
    expect(session.restore({ ...saved, lessonSchemaVersion: 999 })).toEqual({ status: "lesson-version-mismatch" });
    expect(session.restore({ ...saved, completedStepIds: ["encircle-eye", "encircle-eye"] })).toEqual({ status: "invalid-progress" });
    expect(session.restore({ ...saved, state: "active", stepId: "inspect-density", completedStepIds: [] })).toEqual({ status: "invalid-progress" });
    expect(session.restore({
      ...saved,
      state: "completed",
      stepId: "inspect-density",
      completedStepIds: ["encircle-eye"],
      skippedStepIds: [],
    })).toEqual({ status: "invalid-progress" });
    expect(session.restore({ ...saved, state: "impossible" })).toEqual({ status: "invalid-progress" });
    expect(session.restore("not a progress record")).toEqual({ status: "invalid-progress" });
    expect(test.calls.mutation).toBe(0);
  });

  it("rejects restart before a lesson has entered a restartable state", () => {
    const test = harness();
    const session = createGuidedSession(lesson(), test.services);
    expect(session.restartConfirmed()).toEqual({ status: "invalid-state" });
    expect(test.calls.mutation).toBe(0);
  });
});
