import { describe, expect, it } from "vitest";

import { isModelingPointer } from "../../../src/tools/basic/gesture";
import { pointer } from "./tool-context-fake";

describe("basic tool mouse button routing", () => {
  it("accepts only primary-button mouse down as modeling input", () => {
    expect(isModelingPointer(pointer("down", { pointerType: "mouse", buttons: 1 }))).toBe(true);
    expect(isModelingPointer(pointer("down", { pointerType: "mouse", buttons: 2 }))).toBe(false);
    expect(isModelingPointer(pointer("down", { pointerType: "mouse", buttons: 4 }))).toBe(false);
    expect(isModelingPointer(pointer("down", { pointerType: "mouse", buttons: 3 }))).toBe(false);
    expect(isModelingPointer(pointer("down", { pointerType: "mouse", buttons: 5 }))).toBe(false);
  });

  it("preserves primary Pencil modeling regardless of mouse bit semantics", () => {
    expect(isModelingPointer(pointer("down", { pointerType: "pen", buttons: 1 }))).toBe(true);
    expect(isModelingPointer(pointer("down", { pointerType: "pen", buttons: 2 }))).toBe(true);
    expect(isModelingPointer(pointer("down", { pointerType: "pen", buttons: 4 }))).toBe(true);
  });

  it("rejects touch and non-primary mouse/pen samples", () => {
    expect(isModelingPointer(pointer("down", { pointerType: "touch", buttons: 1 }))).toBe(false);
    expect(
      isModelingPointer(pointer("down", { pointerType: "mouse", buttons: 1, isPrimary: false })),
    ).toBe(false);
    expect(
      isModelingPointer(pointer("down", { pointerType: "pen", buttons: 1, isPrimary: false })),
    ).toBe(false);
  });
});
