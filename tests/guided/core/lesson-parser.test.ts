import { describe, expect, it } from "vitest";

import {
  GUIDED_LESSON_SCHEMA_VERSION,
  parseGuidedLesson,
} from "../../../src/guided/core/lesson.ts";
import { validLessonSource } from "../fixtures/lessons/valid-lessons.ts";

describe("parseGuidedLesson", () => {
  it("parses and deeply freezes a current immutable lesson", () => {
    const result = parseGuidedLesson(validLessonSource);

    expect(GUIDED_LESSON_SCHEMA_VERSION).toBe(1);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.lesson).not.toBe(validLessonSource);
    expect(Object.isFrozen(result.lesson)).toBe(true);
    expect(Object.isFrozen(result.lesson.steps)).toBe(true);
    expect(Object.isFrozen(result.lesson.steps[0]?.goal.constraintIds)).toBe(true);
    expect(Object.isFrozen(result.lesson.steps[1]?.goal.densityBand)).toBe(true);
    expect(Object.isFrozen(result.lesson.purpose.glossaryKeys)).toBe(true);
  });

  it.each([
    ["unsupported-version", { ...validLessonSource, schemaVersion: 2 }, "unsupported-schema-version"],
    ["duplicate-step", { ...validLessonSource, steps: [validLessonSource.steps[0], validLessonSource.steps[0]] }, "duplicate-step-id"],
    ["required-skippable", { ...validLessonSource, steps: [{ ...validLessonSource.steps[0], skippable: true }] }, "required-step-skippable"],
    ["empty-constraints", {
      ...validLessonSource,
      steps: [{ ...validLessonSource.steps[0], goal: { ...validLessonSource.steps[0].goal, constraintIds: [] } }],
    }, "empty-constraint-list"],
    ["missing-density-band", {
      ...validLessonSource,
      steps: [{
        ...validLessonSource.steps[1],
        goal: {
          constraintIds: validLessonSource.steps[1].goal.constraintIds,
          regionKey: validLessonSource.steps[1].goal.regionKey,
          flowPreviewSeed: validLessonSource.steps[1].goal.flowPreviewSeed,
        },
      }],
    }, "missing-density-band"],
    ["unsupported-constraint", {
      ...validLessonSource,
      steps: [{
        ...validLessonSource.steps[0],
        goal: { ...validLessonSource.steps[0].goal, constraintIds: ["closed-looop"] },
      }],
    }, "unsupported-constraint"],
  ])("rejects %s without returning a partial lesson", (_label, source, code) => {
    const result = parseGuidedLesson(source);
    expect(result).toEqual(expect.objectContaining({ status: "invalid", code }));
    expect("lesson" in result).toBe(false);
  });

  it("rejects non-record input as invalid content", () => {
    expect(parseGuidedLesson("not-a-record")).toEqual({
      status: "invalid",
      code: "invalid-record",
      path: "$",
    });
  });
});
