import { describe, expect, it } from "vitest";

import {
  pointsOverlay,
  polylineOverlay,
  reviseToolPreview,
  toolPreview,
  trianglesOverlay,
} from "../../../src/renderer/overlays";

const color = { x: 1, y: 0.5, z: 0.25, w: 1 };

describe("overlay builders", () => {
  it("creates deeply immutable canonical overlay values", () => {
    const source = [{ x: 1, y: 2, z: 3 }];
    const primitive = pointsOverlay(source, color, 8);
    const preview = toolPreview("preview", 0, [primitive]);

    source[0]!.x = 99;
    expect(preview.primitives[0]?.positions[0]).toEqual({ x: 1, y: 2, z: 3 });
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.primitives)).toBe(true);
    expect(Object.isFrozen(preview.primitives[0])).toBe(true);
    expect(Object.isFrozen(preview.primitives[0]?.positions)).toBe(true);
    expect(Object.isFrozen(preview.primitives[0]?.positions[0])).toBe(true);
  });

  it("increments preview revisions deterministically", () => {
    const first = toolPreview("stroke", 41, [polylineOverlay([], color, 2)]);
    const second = reviseToolPreview(first, [pointsOverlay([], color, 4)]);

    expect(second.id).toBe("stroke");
    expect(second.revision).toBe(42);
    expect(first.revision).toBe(41);
  });

  it("rejects invalid geometry and CSS-pixel sizes before returning a value", () => {
    expect(() => trianglesOverlay([{ x: 0, y: 0, z: 0 }], color)).toThrow(/divisible/);
    expect(() => pointsOverlay([], color, 0)).toThrow(/greater than zero/);
    expect(() => toolPreview("", 0, [])).toThrow(/must not be empty/);
  });
});
