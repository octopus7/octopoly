export const validLessonSource = {
  schemaVersion: 1,
  lessonId: "eye-loop",
  contentKey: "guided.lesson.eye",
  purpose: {
    summaryKey: "guided.lesson.eye.purpose",
    glossaryKeys: ["closed-edge-loop", "pole", "density"],
  },
  start: {
    requiredCapabilities: ["editable-mesh", "reference-geometry"],
    sampleManifestId: "guided-eye-v1",
  },
  steps: [
    {
      stepId: "encircle-eye",
      required: true,
      skippable: false,
      goal: {
        constraintIds: ["closed-loop", "manifold"],
        regionKey: "eye-perimeter",
        flowPreviewSeed: "eye-loop-clockwise",
      },
      hintKeys: ["guided.hint.eye.closed-loop"],
    },
    {
      stepId: "inspect-density",
      required: false,
      skippable: true,
      goal: {
        constraintIds: ["density-band"],
        regionKey: "eye-perimeter",
        flowPreviewSeed: "eye-density-orbit",
        densityBand: { minRatio: 0.75, maxRatio: 1.25 },
      },
      hintKeys: [],
    },
  ],
  completionRule: "all-required-steps",
  resumeCheckpointPolicy: "after-each-transition",
} as const;
