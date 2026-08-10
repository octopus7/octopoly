import type {
  HistoryService,
  HistorySnapshot,
  MeshQuery,
  MeshSnapshot,
  RetopoEngine,
  SelectionService,
  SelectionSnapshot,
} from "@octopoly/contracts";

import type { GuidedLessonDefinition, GuidedLessonStep, GuidedStartCapability } from "./lesson.ts";

export type GuidedSessionState = "idle" | "active" | "paused" | "completed" | "abandoned";

export interface GuidedSessionServices {
  readonly mesh: MeshQuery;
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly retopo: RetopoEngine;
}

export interface GuidedEvaluationInput {
  readonly mesh: MeshSnapshot;
  readonly selection: SelectionSnapshot;
  readonly history: HistorySnapshot;
  readonly step: GuidedLessonStep;
}

export interface GuidedProgressRecord {
  readonly lessonId: string;
  readonly lessonSchemaVersion: number;
  readonly state: GuidedSessionState;
  readonly stepId: string | null;
  readonly completedStepIds: ReadonlyArray<string>;
  readonly skippedStepIds: ReadonlyArray<string>;
}

export interface GuidedSessionSnapshot extends GuidedProgressRecord {}

type RestartResult =
  | { readonly status: "restarted"; readonly stepId: string; readonly meshReset: false }
  | { readonly status: "invalid-state" };

type RestoreResult =
  | { readonly status: "restored" }
  | { readonly status: "lesson-version-mismatch" }
  | { readonly status: "invalid-progress" };

export interface GuidedSession {
  snapshot(): GuidedSessionSnapshot;
  start(capabilities: ReadonlySet<GuidedStartCapability>):
    | { readonly status: "started" }
    | { readonly status: "incompatible-start-source"; readonly missing: ReadonlyArray<GuidedStartCapability> }
    | { readonly status: "invalid-state" };
  pause(): { readonly status: "paused"; readonly cancelActiveGesture: true; readonly clearPreview: true } | { readonly status: "invalid-state" };
  resume(): { readonly status: "resumed" } | { readonly status: "invalid-state" };
  skip():
    | { readonly status: "advanced"; readonly stepId: string }
    | { readonly status: "completed" }
    | { readonly status: "not-skippable"; readonly stepId: string }
    | { readonly status: "invalid-state" };
  abandon(): { readonly status: "abandoned"; readonly cancelActiveGesture: true; readonly clearPreview: true } | { readonly status: "invalid-state" };
  restartConfirmed(): RestartResult;
  evaluateCommitted(evaluate: (input: GuidedEvaluationInput) => boolean):
    | { readonly status: "advanced"; readonly stepId: string }
    | { readonly status: "completed" }
    | { readonly status: "reopened"; readonly stepId: string }
    | { readonly status: "unchanged" };
  exportProgress(): GuidedProgressRecord;
  restore(progress: unknown): RestoreResult;
}

function frozenSnapshot(
  lesson: GuidedLessonDefinition,
  state: GuidedSessionState,
  stepId: string | null,
  completed: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
): GuidedSessionSnapshot {
  return Object.freeze({
    lessonId: lesson.lessonId,
    lessonSchemaVersion: lesson.schemaVersion,
    state,
    stepId,
    completedStepIds: Object.freeze([...completed].sort()),
    skippedStepIds: Object.freeze([...skipped].sort()),
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const sessionStates = new Set<GuidedSessionState>(["idle", "active", "paused", "completed", "abandoned"]);

export function createGuidedSession(lesson: GuidedLessonDefinition, services: GuidedSessionServices): GuidedSession {
  let state: GuidedSessionState = "idle";
  let stepIndex = 0;
  const completed = new Set<string>();
  const skipped = new Set<string>();
  const current = (): GuidedLessonStep => {
    const step = lesson.steps[stepIndex];
    if (step === undefined) throw new Error("Guided lesson has no current step.");
    return step;
  };
  const advance = (): { readonly status: "advanced"; readonly stepId: string } | { readonly status: "completed" } => {
    if (stepIndex + 1 < lesson.steps.length) {
      stepIndex += 1;
      state = "active";
      return Object.freeze({ status: "advanced", stepId: current().stepId });
    }
    state = "completed";
    return Object.freeze({ status: "completed" });
  };
  const capture = (): Omit<GuidedEvaluationInput, "step"> => Object.freeze({
    mesh: services.mesh.snapshot(),
    selection: services.selection.snapshot(),
    history: services.history.snapshot(),
  });
  const observe = (
    committed: Omit<GuidedEvaluationInput, "step">,
    step: GuidedLessonStep,
    evaluate: (input: GuidedEvaluationInput) => boolean,
  ): boolean => evaluate(Object.freeze({ ...committed, step }));
  const reopen = (index: number): { readonly status: "reopened"; readonly stepId: string } => {
    stepIndex = index;
    for (let later = index; later < lesson.steps.length; later += 1) {
      const step = lesson.steps[later];
      if (step !== undefined) {
        completed.delete(step.stepId);
        skipped.delete(step.stepId);
      }
    }
    state = "active";
    return Object.freeze({ status: "reopened", stepId: current().stepId });
  };

  return {
    snapshot() {
      return frozenSnapshot(lesson, state, state === "idle" || state === "abandoned" ? null : current().stepId, completed, skipped);
    },
    start(capabilities) {
      if (state !== "idle") return Object.freeze({ status: "invalid-state" });
      const missing = lesson.start.requiredCapabilities.filter((capability) => !capabilities.has(capability)).sort();
      if (missing.length > 0) return Object.freeze({ status: "incompatible-start-source", missing: Object.freeze(missing) });
      state = "active";
      return Object.freeze({ status: "started" });
    },
    pause() {
      if (state !== "active") return Object.freeze({ status: "invalid-state" });
      state = "paused";
      return Object.freeze({ status: "paused", cancelActiveGesture: true, clearPreview: true });
    },
    resume() {
      if (state !== "paused") return Object.freeze({ status: "invalid-state" });
      state = "active";
      return Object.freeze({ status: "resumed" });
    },
    skip() {
      if (state !== "active") return Object.freeze({ status: "invalid-state" });
      const step = current();
      if (!step.skippable) return Object.freeze({ status: "not-skippable", stepId: step.stepId });
      completed.add(step.stepId);
      skipped.add(step.stepId);
      return advance();
    },
    abandon() {
      if (state !== "active" && state !== "paused") return Object.freeze({ status: "invalid-state" });
      state = "abandoned";
      return Object.freeze({ status: "abandoned", cancelActiveGesture: true, clearPreview: true });
    },
    restartConfirmed() {
      if (state === "idle") return Object.freeze({ status: "invalid-state" });
      state = "active";
      stepIndex = 0;
      completed.clear();
      skipped.clear();
      return Object.freeze({ status: "restarted", stepId: current().stepId, meshReset: false });
    },
    evaluateCommitted(evaluate) {
      if (state !== "active" && state !== "completed") return Object.freeze({ status: "unchanged" });
      const committed = capture();
      const firstFailedIndex = lesson.steps.findIndex((step) =>
        completed.has(step.stepId) && !skipped.has(step.stepId) && !observe(committed, step, evaluate));
      if (firstFailedIndex >= 0) return reopen(firstFailedIndex);
      if (state === "completed") return Object.freeze({ status: "unchanged" });
      const step = current();
      if (!observe(committed, step, evaluate)) return Object.freeze({ status: "unchanged" });
      skipped.delete(step.stepId);
      completed.add(step.stepId);
      return advance();
    },
    exportProgress() {
      return frozenSnapshot(lesson, state, state === "idle" || state === "abandoned" ? null : current().stepId, completed, skipped);
    },
    restore(source) {
      const progress = record(source);
      if (progress === null) return Object.freeze({ status: "invalid-progress" });
      if (typeof progress.lessonId !== "string" || typeof progress.lessonSchemaVersion !== "number") {
        return Object.freeze({ status: "invalid-progress" });
      }
      if (progress.lessonId !== lesson.lessonId || progress.lessonSchemaVersion !== lesson.schemaVersion) {
        return Object.freeze({ status: "lesson-version-mismatch" });
      }
      if (
        typeof progress.state !== "string" ||
        !sessionStates.has(progress.state as GuidedSessionState) ||
        (progress.stepId !== null && typeof progress.stepId !== "string") ||
        !Array.isArray(progress.completedStepIds) ||
        !progress.completedStepIds.every((id) => typeof id === "string") ||
        !Array.isArray(progress.skippedStepIds) ||
        !progress.skippedStepIds.every((id) => typeof id === "string")
      ) return Object.freeze({ status: "invalid-progress" });

      const restoredState = progress.state as GuidedSessionState;
      const restoredIds = progress.completedStepIds as string[];
      const restoredSkippedIds = progress.skippedStepIds as string[];
      const validIds = new Set(lesson.steps.map((step) => step.stepId));
      const index = progress.stepId === null ? -1 : lesson.steps.findIndex((step) => step.stepId === progress.stepId);
      if (
        restoredIds.some((id) => !validIds.has(id)) ||
        new Set(restoredIds).size !== restoredIds.length ||
        restoredSkippedIds.some((id) =>
          !restoredIds.includes(id) || !lesson.steps.find((step) => step.stepId === id)?.skippable) ||
        new Set(restoredSkippedIds).size !== restoredSkippedIds.length
      ) return Object.freeze({ status: "invalid-progress" });
      if ((restoredState === "idle" || restoredState === "abandoned") && progress.stepId !== null) {
        return Object.freeze({ status: "invalid-progress" });
      }
      if ((restoredState === "active" || restoredState === "paused" || restoredState === "completed") && index < 0) {
        return Object.freeze({ status: "invalid-progress" });
      }
      if (restoredState === "idle" && restoredIds.length > 0) return Object.freeze({ status: "invalid-progress" });
      if ((restoredState === "active" || restoredState === "paused") && (
        restoredIds.some((id) => lesson.steps.findIndex((step) => step.stepId === id) >= index) ||
        lesson.steps.slice(0, index).some((step) => !restoredIds.includes(step.stepId))
      )) {
        return Object.freeze({ status: "invalid-progress" });
      }
      if (restoredState === "completed" && (
        index !== lesson.steps.length - 1 ||
        lesson.steps.some((step) => !restoredIds.includes(step.stepId))
      )) return Object.freeze({ status: "invalid-progress" });

      state = restoredState;
      if (index >= 0) stepIndex = index;
      completed.clear();
      restoredIds.forEach((id) => completed.add(id));
      skipped.clear();
      restoredSkippedIds.forEach((id) => skipped.add(id));
      return Object.freeze({ status: "restored" });
    },
  };
}
