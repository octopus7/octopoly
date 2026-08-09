import { UvEditorSelection } from "../../../../src/extensions/uv/editor";
import { describe, expect, it } from "vitest";

describe("UvEditorSelection", () => {
  it("exposes genuinely immutable public corner and island sets", () => {
    const selection = new UvEditorSelection();
    selection.replace(new Set([100]), new Set([4]));
    const snapshot = selection.snapshot();
    const corners = snapshot.corners as Set<number>;
    const islands = snapshot.islands as Set<number>;

    expect(() => corners.add(101)).toThrow(TypeError);
    expect(() => corners.delete(100)).toThrow(TypeError);
    expect(() => corners.clear()).toThrow(TypeError);
    expect(() => islands.add(5)).toThrow(TypeError);
    expect(() => islands.delete(4)).toThrow(TypeError);
    expect(() => islands.clear()).toThrow(TypeError);

    expect([...snapshot.corners]).toEqual([100]);
    expect([...snapshot.islands]).toEqual([4]);
    expect([...selection.snapshot().corners]).toEqual([100]);
    expect([...selection.snapshot().islands]).toEqual([4]);
  });

  it("passes the immutable wrapper to ReadonlySet forEach callbacks", () => {
    const selection = new UvEditorSelection();
    selection.updateCorners("replace", new Set([100]));
    const snapshot = selection.snapshot();
    let callbackSet: ReadonlySet<number> | undefined;

    snapshot.corners.forEach((_value, _duplicate, set) => {
      callbackSet = set;
    });

    expect(callbackSet).toBe(snapshot.corners);
    expect(() => (callbackSet as Set<number>).add(101)).toThrow(TypeError);
  });
});
