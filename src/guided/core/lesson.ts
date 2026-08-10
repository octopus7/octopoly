export const GUIDED_LESSON_SCHEMA_VERSION = 1 as const;

export type GuidedStartCapability =
  | "reference-geometry"
  | "editable-mesh"
  | "selection"
  | "retopo-stroke";

export interface GuidedLessonPurpose {
  readonly summaryKey: string;
  readonly glossaryKeys: ReadonlyArray<string>;
}

export interface GuidedLessonDensityBand {
  readonly minRatio: number;
  readonly maxRatio: number;
}

export type GuidedConstraintId =
  | "manifold"
  | "closed-loop"
  | "joint-support"
  | "density-band";

export interface GuidedLessonGoal {
  readonly constraintIds: ReadonlyArray<GuidedConstraintId>;
  readonly regionKey: string;
  readonly flowPreviewSeed: string;
  readonly densityBand?: GuidedLessonDensityBand;
}

export interface GuidedLessonStep {
  readonly stepId: string;
  readonly required: boolean;
  readonly skippable: boolean;
  readonly goal: GuidedLessonGoal;
  readonly hintKeys: ReadonlyArray<string>;
}

export interface GuidedLessonDefinition {
  readonly schemaVersion: typeof GUIDED_LESSON_SCHEMA_VERSION;
  readonly lessonId: string;
  readonly contentKey: string;
  readonly purpose: GuidedLessonPurpose;
  readonly start: {
    readonly requiredCapabilities: ReadonlyArray<GuidedStartCapability>;
    readonly sampleManifestId: string;
  };
  readonly steps: ReadonlyArray<GuidedLessonStep>;
  readonly completionRule: "all-required-steps";
  readonly resumeCheckpointPolicy: "after-each-transition";
}

export type GuidedLessonParseErrorCode =
  | "invalid-record"
  | "unsupported-schema-version"
  | "invalid-field"
  | "duplicate-step-id"
  | "required-step-skippable"
  | "empty-constraint-list"
  | "unsupported-constraint"
  | "missing-density-band"
  | "invalid-density-band";

export type GuidedLessonParseResult =
  | { readonly status: "ok"; readonly lesson: GuidedLessonDefinition }
  | { readonly status: "invalid"; readonly code: GuidedLessonParseErrorCode; readonly path: string };

const capabilities = new Set<GuidedStartCapability>([
  "reference-geometry",
  "editable-mesh",
  "selection",
  "retopo-stroke",
]);

const constraints = new Set<GuidedConstraintId>([
  "manifold",
  "closed-loop",
  "joint-support",
  "density-band",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value: unknown, allowEmpty = false): ReadonlyArray<string> | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(nonEmptyString)) return null;
  return value;
}

function invalid(code: GuidedLessonParseErrorCode, path: string): GuidedLessonParseResult {
  return Object.freeze({ status: "invalid", code, path });
}

function freezeLesson(lesson: GuidedLessonDefinition): GuidedLessonDefinition {
  for (const step of lesson.steps) {
    Object.freeze(step.goal.constraintIds);
    if (step.goal.densityBand !== undefined) Object.freeze(step.goal.densityBand);
    Object.freeze(step.goal);
    Object.freeze(step.hintKeys);
    Object.freeze(step);
  }
  Object.freeze(lesson.steps);
  Object.freeze(lesson.purpose.glossaryKeys);
  Object.freeze(lesson.purpose);
  Object.freeze(lesson.start.requiredCapabilities);
  Object.freeze(lesson.start);
  return Object.freeze(lesson);
}

export function parseGuidedLesson(source: unknown): GuidedLessonParseResult {
  const root = record(source);
  if (root === null) return invalid("invalid-record", "$");
  if (root.schemaVersion !== GUIDED_LESSON_SCHEMA_VERSION) {
    return invalid("unsupported-schema-version", "$.schemaVersion");
  }
  if (!nonEmptyString(root.lessonId) || !nonEmptyString(root.contentKey)) {
    return invalid("invalid-field", "$.lessonId");
  }
  const purpose = record(root.purpose);
  const glossaryKeys = stringList(purpose?.glossaryKeys);
  if (purpose === null || !nonEmptyString(purpose.summaryKey) || glossaryKeys === null || new Set(glossaryKeys).size !== glossaryKeys.length) {
    return invalid("invalid-field", "$.purpose");
  }
  const start = record(root.start);
  const requiredCapabilities = stringList(start?.requiredCapabilities, true);
  if (
    start === null ||
    requiredCapabilities === null ||
    new Set(requiredCapabilities).size !== requiredCapabilities.length ||
    !requiredCapabilities.every((value): value is GuidedStartCapability => capabilities.has(value as GuidedStartCapability)) ||
    !nonEmptyString(start.sampleManifestId)
  ) {
    return invalid("invalid-field", "$.start");
  }
  if (!Array.isArray(root.steps) || root.steps.length === 0) return invalid("invalid-field", "$.steps");
  const steps: GuidedLessonStep[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < root.steps.length; index += 1) {
    const path = `$.steps[${index}]`;
    const item = record(root.steps[index]);
    const goal = record(item?.goal);
    const constraintIds = stringList(goal?.constraintIds);
    const hintKeys = stringList(item?.hintKeys, true);
    if (
      item === null ||
      !nonEmptyString(item.stepId) ||
      typeof item.required !== "boolean" ||
      typeof item.skippable !== "boolean" ||
      goal === null ||
      !nonEmptyString(goal.regionKey) ||
      !nonEmptyString(goal.flowPreviewSeed) ||
      hintKeys === null ||
      new Set(hintKeys).size !== hintKeys.length
    ) return invalid("invalid-field", path);
    if (ids.has(item.stepId)) return invalid("duplicate-step-id", `${path}.stepId`);
    if (item.required && item.skippable) return invalid("required-step-skippable", `${path}.skippable`);
    if (constraintIds === null) return invalid("empty-constraint-list", `${path}.goal.constraintIds`);
    if (!constraintIds.every((constraint) => constraints.has(constraint as GuidedConstraintId))) {
      return invalid("unsupported-constraint", `${path}.goal.constraintIds`);
    }
    if (new Set(constraintIds).size !== constraintIds.length) return invalid("invalid-field", `${path}.goal.constraintIds`);
    const validatedConstraints = constraintIds as ReadonlyArray<GuidedConstraintId>;

    const needsDensityBand = validatedConstraints.includes("density-band");
    const density = record(goal.densityBand);
    if (needsDensityBand && density === null) return invalid("missing-density-band", `${path}.goal.densityBand`);
    if (!needsDensityBand && goal.densityBand !== undefined) return invalid("invalid-density-band", `${path}.goal.densityBand`);
    let densityBand: GuidedLessonDensityBand | undefined;
    if (density !== null) {
      if (
        typeof density.minRatio !== "number" ||
        typeof density.maxRatio !== "number" ||
        !Number.isFinite(density.minRatio) ||
        !Number.isFinite(density.maxRatio) ||
        density.minRatio < 0 ||
        density.maxRatio < density.minRatio
      ) return invalid("invalid-density-band", `${path}.goal.densityBand`);
      densityBand = { minRatio: density.minRatio, maxRatio: density.maxRatio };
    }
    ids.add(item.stepId);
    steps.push({
      stepId: item.stepId,
      required: item.required,
      skippable: item.skippable,
      goal: {
        constraintIds: [...validatedConstraints],
        regionKey: goal.regionKey,
        flowPreviewSeed: goal.flowPreviewSeed,
        ...(densityBand === undefined ? {} : { densityBand }),
      },
      hintKeys: [...hintKeys],
    });
  }
  if (root.completionRule !== "all-required-steps" || root.resumeCheckpointPolicy !== "after-each-transition") {
    return invalid("invalid-field", "$.completionRule");
  }
  return Object.freeze({
    status: "ok",
    lesson: freezeLesson({
      schemaVersion: GUIDED_LESSON_SCHEMA_VERSION,
      lessonId: root.lessonId,
      contentKey: root.contentKey,
      purpose: { summaryKey: purpose.summaryKey, glossaryKeys: [...glossaryKeys] },
      start: {
        requiredCapabilities: [...requiredCapabilities],
        sampleManifestId: start.sampleManifestId,
      },
      steps,
      completionRule: "all-required-steps",
      resumeCheckpointPolicy: "after-each-transition",
    }),
  });
}
