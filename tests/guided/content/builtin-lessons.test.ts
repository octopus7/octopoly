import { describe, expect, it } from "vitest";

import { BUILTIN_GUIDED_LESSONS } from "../../../src/guided/content/builtin-lessons.ts";
import { parseGuidedLesson } from "../../../src/guided/core/lesson.ts";

describe("built-in purpose lesson definitions", () => {
  it("expresses eye, mouth, and joint purposes through the same locale-neutral schema", () => {
    expect(BUILTIN_GUIDED_LESSONS.every((lesson) => Object.isFrozen(lesson))).toBe(true);
    expect(BUILTIN_GUIDED_LESSONS.every((lesson) => Object.isFrozen(lesson.steps))).toBe(true);
    expect(BUILTIN_GUIDED_LESSONS.every((lesson) => Object.isFrozen(lesson.steps[0]?.goal))).toBe(true);
    expect(BUILTIN_GUIDED_LESSONS.map((lesson) => lesson.lessonId)).toEqual([
      "eye-deformation-loop",
      "mouth-deformation-loop",
      "joint-support-loop",
    ]);
    for (const source of BUILTIN_GUIDED_LESSONS) {
      const parsed = parseGuidedLesson(source);
      expect(parsed.status).toBe("ok");
      if (parsed.status !== "ok") continue;
      expect(parsed.lesson.contentKey).toMatch(/^guided\.lesson\./);
      expect(parsed.lesson.purpose.glossaryKeys.length).toBeGreaterThan(0);
      expect(parsed.lesson.steps.every((step) => step.goal.constraintIds.length > 0)).toBe(true);
    }
  });

  it("keeps user-facing prose out of evaluation records", () => {
    expect(JSON.stringify(BUILTIN_GUIDED_LESSONS)).not.toMatch(/Wrap the|edge loop|manifold topology/i);
  });
});
