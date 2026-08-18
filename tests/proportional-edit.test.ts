import { describe, expect, it } from "vitest";

import {
  calculateProportionalWeights,
  createProportionalEditState,
  proportionalEditReducer,
  sampleInfluencedVertexIndices,
} from "../src/facial/proportional-edit";

describe("proportional edit influence", () => {
  it("starts disabled with bounded smooth influence settings", () => {
    const initial = createProportionalEditState();

    expect(initial).toEqual({
      enabled: false,
      radiusRatio: 0.25,
      falloff: "smooth",
      connectedOnly: false,
    });
    expect(proportionalEditReducer(initial, { type: "set-radius-ratio", radiusRatio: 99 }).radiusRatio)
      .toBe(2);
    expect(proportionalEditReducer(initial, { type: "set-radius-ratio", radiusRatio: 0 }).radiusRatio)
      .toBe(0.05);
    expect(proportionalEditReducer(initial, { type: "toggle-enabled" }).enabled).toBe(true);
  });

  it("limits viewport projection indices while spanning the full influenced range", () => {
    const indices = sampleInfluencedVertexIndices(Array.from({ length: 2_000 }, () => 0.5), 512);

    expect(indices).toHaveLength(512);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(1_999);
    expect(new Set(indices).size).toBe(512);
  });

  it("applies a smooth falloff from the selected vertex to the radius boundary", () => {
    const weights = calculateProportionalWeights({
      positions: [
        0, 0, 0,
        0.5, 0, 0,
        1, 0, 0,
      ],
      indices: [0, 1, 2],
    }, 0, 1, "smooth", false);

    expect(weights).toEqual([1, 0.5, 0]);
  });

  it("excludes spatially close vertices outside the selected topology component", () => {
    const geometry = {
      positions: [
        0, 0, 0,
        2, 0, 0,
        0, 2, 0,
        0.1, 0, 0,
        2, 2, 0,
        2, 0.1, 0,
      ],
      indices: [0, 1, 2, 3, 4, 5],
    };

    expect(calculateProportionalWeights(geometry, 0, 1, "linear", false)[3]).toBeCloseTo(0.9);
    expect(calculateProportionalWeights(geometry, 0, 1, "linear", true)[3]).toBe(0);
  });

  it("uses bounded topology distance for connected-only influence on a folded mesh", () => {
    const geometry = {
      positions: [
        0, 0, 0,
        10, 0, 0,
        10, 1, 0,
        0.1, 0, 0,
      ],
      indices: [0, 1, 2, 1, 2, 3],
    };

    expect(calculateProportionalWeights(geometry, 0, 1, "linear", false)[3]).toBeCloseTo(0.9);
    expect(calculateProportionalWeights(geometry, 0, 1, "linear", true)[3]).toBe(0);
  });
});
