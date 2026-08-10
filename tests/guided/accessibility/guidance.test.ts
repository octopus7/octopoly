import { describe, expect, it } from "vitest";

import {
  createAccessiblePreviewDescriptor,
  recordInputDevice,
  statusPresentation,
  type GuidedInputAvailability,
} from "../../../src/guided/accessibility/guidance.ts";

describe("guided accessibility guidance", () => {
  it("maps every severity to non-color icon, label, pattern, and live-region policy", () => {
    expect(statusPresentation("info")).toEqual({ icon: "ℹ", label: "Information", pattern: "dots", live: "polite" });
    expect(statusPresentation("warning")).toEqual({ icon: "!", label: "Warning", pattern: "diagonal", live: "polite" });
    expect(statusPresentation("completion-blocker")).toEqual({ icon: "×", label: "Blocked", pattern: "crosshatch", live: "assertive" });
  });

  it("replaces animation with numbered static segments under reduced motion", () => {
    expect(createAccessiblePreviewDescriptor("reduced", 3)).toEqual({
      mode: "static",
      segments: [
        { index: 1, label: "Flow segment 1 of 3" },
        { index: 2, label: "Flow segment 2 of 3" },
        { index: 3, label: "Flow segment 3 of 3" },
      ],
    });
    expect(createAccessiblePreviewDescriptor("full", 3)).toEqual({ mode: "animated", segmentCount: 3 });
  });

  it("supports mixed-device handoff without locking the session to its first input", () => {
    const initial: GuidedInputAvailability = Object.freeze({
      available: Object.freeze(["pen", "touch", "mouse", "keyboard"] as const),
      lastUsed: null,
    });
    const pen = recordInputDevice(initial, "pen");
    const keyboard = recordInputDevice(pen, "keyboard");
    expect(pen.lastUsed).toBe("pen");
    expect(keyboard.lastUsed).toBe("keyboard");
    expect(keyboard.available).toEqual(initial.available);
    expect(Object.isFrozen(keyboard)).toBe(true);
  });
});
