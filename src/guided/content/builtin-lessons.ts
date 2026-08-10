import {
  parseGuidedLesson,
  type GuidedConstraintId,
  type GuidedLessonDefinition,
  type GuidedLessonDensityBand,
} from "../core/lesson.ts";

function lesson(
  lessonId: string,
  purpose: string,
  glossary: ReadonlyArray<string>,
  constraintIds: ReadonlyArray<GuidedConstraintId>,
  densityBand?: GuidedLessonDensityBand,
): GuidedLessonDefinition {
  const source = {
    schemaVersion: 1,
    lessonId,
    contentKey: `guided.lesson.${lessonId}`,
    purpose: { summaryKey: purpose, glossaryKeys: [...glossary] },
    start: {
      requiredCapabilities: ["editable-mesh", "reference-geometry"],
      sampleManifestId: `sample-${lessonId}`,
    },
    steps: [{
      stepId: "shape-purpose-region",
      required: true,
      skippable: false,
      goal: {
        constraintIds: [...constraintIds],
        regionKey: `${lessonId}-target-region`,
        flowPreviewSeed: `${lessonId}-flow-seed`,
        ...(densityBand === undefined ? {} : { densityBand }),
      },
      hintKeys: [`guided.hint.${lessonId}.purpose`],
    }],
    completionRule: "all-required-steps",
    resumeCheckpointPolicy: "after-each-transition",
  };
  const parsed = parseGuidedLesson(source);
  if (parsed.status !== "ok") {
    throw new Error(`Invalid built-in guided lesson ${lessonId}: ${parsed.code} at ${parsed.path}`);
  }
  return parsed.lesson;
}

export const BUILTIN_GUIDED_LESSONS: ReadonlyArray<GuidedLessonDefinition> = Object.freeze([
  lesson("eye-deformation-loop", "guided.purpose.eye-deformation-loop", ["closed-loop", "pole"], ["closed-loop", "manifold"]),
  lesson(
    "mouth-deformation-loop",
    "guided.purpose.mouth-deformation-loop",
    ["closed-loop", "density"],
    ["closed-loop", "density-band"],
    { minRatio: 0.75, maxRatio: 1.25 },
  ),
  lesson("joint-support-loop", "guided.purpose.joint-support-loop", ["support-loop", "deformation"], ["joint-support", "manifold"]),
]);
