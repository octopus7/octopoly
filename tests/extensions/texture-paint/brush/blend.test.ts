import { describe, expect, it } from "vitest";

import {
  BrushEngine,
  blendPremultipliedRgba,
  brushCoverage,
  erasePremultipliedRgba,
} from "../../../../src/extensions/texture-paint/brush";

describe("brush mask and premultiplied RGBA operations", () => {
  it("applies a deterministic hard core and linear soft edge", () => {
    expect(brushCoverage(0, 10, 0.5)).toBe(1);
    expect(brushCoverage(5, 10, 0.5)).toBe(1);
    expect(brushCoverage(7.5, 10, 0.5)).toBe(0.5);
    expect(brushCoverage(10, 10, 0.5)).toBe(0);
    expect(brushCoverage(3, 0, 0.5)).toBe(0);
    expect(brushCoverage(9.999, 10, 1)).toBe(1);
    expect(() => brushCoverage(-1, 10, 0.5)).toThrow(RangeError);
  });

  it("uses Porter-Duff source-over with byte-stable premultiplied output", () => {
    expect(blendPremultipliedRgba([0, 0, 255, 255], [128, 0, 0, 128])).toEqual([128, 0, 127, 255]);
    expect(blendPremultipliedRgba([0, 0, 255, 255], [128, 0, 0, 128], 0.5)).toEqual([
      64, 0, 191, 255,
    ]);
    expect(blendPremultipliedRgba([0, 0, 0, 0], [128, 0, 0, 128])).toEqual([128, 0, 0, 128]);
  });

  it("erases all premultiplied channels by the same destination-out amount", () => {
    expect(erasePremultipliedRgba([64, 32, 16, 128], 0.5)).toEqual([32, 16, 8, 64]);
    expect(erasePremultipliedRgba([64, 32, 16, 128], 1)).toEqual([0, 0, 0, 0]);
  });

  it("combines radial coverage, mapped opacity and paint/erase mode", () => {
    const engine = new BrushEngine({
      radiusPx: 10,
      hardness: 0.5,
      opacity: 0.5,
      spacingPx: 2,
      pressureRadius: 0,
      pressureOpacity: 0,
    });
    const stamp = engine.generateStamps([{ x: 5, y: 5, pressure: 1, timestamp: 0 }])[0]!;

    expect(engine.blendPixel([0, 0, 0, 0], [255, 0, 0, 255], stamp, 5, 5)).toEqual([
      128, 0, 0, 128,
    ]);
    expect(engine.blendPixel([64, 32, 16, 128], [255, 0, 0, 255], stamp, 5, 5, "erase")).toEqual([
      32, 16, 8, 64,
    ]);
    expect(engine.blendPixel([0, 0, 0, 0], [255, 0, 0, 255], stamp, 15, 5)).toEqual([0, 0, 0, 0]);
    expect(() =>
      engine.blendPixel(
        [0, 0, 0, 0],
        [255, 0, 0, 255],
        stamp,
        5,
        5,
        "smear" as "paint",
      ),
    ).toThrow("mode must be paint or erase");
  });

  it("rejects non-byte or non-premultiplied colors and invalid blend amounts", () => {
    expect(() => blendPremultipliedRgba([0, 0, 0, 0], [255, 0, 0, 128])).toThrow(
      "source must be premultiplied",
    );
    expect(() => blendPremultipliedRgba([0, 0, 0, 0], [0, 0, 0, 0], 1.1)).toThrow(RangeError);
    expect(() => erasePremultipliedRgba([0.5, 0, 0, 1], 0.5)).toThrow("must be an integer");
  });
});
