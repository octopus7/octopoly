import { describe, expect, it } from "vitest";

import {
  BrushEngine,
  clampPressure,
  interpolate,
  mapBrushPressure,
} from "../../../../src/extensions/texture-paint/brush";

describe("BrushEngine pressure mapping", () => {
  it("clamps pressure and linearly maps the configured radius and opacity influence", () => {
    const engine = new BrushEngine({
      radiusPx: 10,
      opacity: 0.8,
      pressureRadius: 0.5,
      pressureOpacity: 1,
      defaultPressure: 0.25,
    });

    expect(mapBrushPressure(-4, engine.settings)).toEqual({ pressure: 0, radiusPx: 5, opacity: 0 });
    expect(mapBrushPressure(4, engine.settings)).toEqual({ pressure: 1, radiusPx: 10, opacity: 0.8 });
    expect(mapBrushPressure(undefined, engine.settings)).toEqual({
      pressure: 0.25,
      radiusPx: 6.25,
      opacity: 0.2,
    });
    expect(clampPressure(-0, 0.5)).toBe(0);
  });

  it("validates settings and interpolation before producing output", () => {
    expect(() => new BrushEngine({ radiusPx: 0 })).toThrow(RangeError);
    expect(() => new BrushEngine({ spacingPx: 0 })).toThrow(RangeError);
    expect(() => new BrushEngine({ hardness: 1.01 })).toThrow(RangeError);
    expect(() => new BrushEngine({ opacity: Number.NaN })).toThrow("opacity must be finite");
    expect(() => interpolate(0, 1, -0.1)).toThrow(RangeError);
    expect(() => clampPressure(Number.POSITIVE_INFINITY, 0.5)).toThrow("pressure must be finite");
  });
});

describe("BrushEngine deterministic stamp spacing", () => {
  it("interpolates pressure and preserves both spacing endpoints", () => {
    const engine = new BrushEngine({
      radiusPx: 10,
      hardness: 0.5,
      opacity: 1,
      spacingPx: 4,
      pressureRadius: 1,
      pressureOpacity: 1,
    });

    const stamps = engine.generateStamps([
      { x: 0, y: 0, pressure: 0, timestamp: 10 },
      { x: 10, y: 0, pressure: 1, timestamp: 20 },
    ]);

    expect(stamps.map(({ x }) => x)).toEqual([0, 4, 8, 10]);
    expect(stamps.map(({ timestamp }) => timestamp)).toEqual([10, 14, 18, 20]);
    expect(stamps.map(({ pressure }) => pressure)).toEqual([0, 0.4, 0.8, 1]);
    expect(stamps.map(({ radiusPx }) => radiusPx)).toEqual([0, 4, 8, 10]);
    expect(stamps.map(({ opacity }) => opacity)).toEqual([0, 0.4, 0.8, 1]);
    expect(Object.isFrozen(stamps)).toBe(true);
    expect(stamps.every(Object.isFrozen)).toBe(true);
  });

  it("carries spacing across polyline segments and retains a short final endpoint", () => {
    const engine = new BrushEngine({ spacingPx: 3, pressureRadius: 0, pressureOpacity: 0 });

    const stamps = engine.generateStamps([
      { x: 0, y: 0, pressure: 0.5, timestamp: 0 },
      { x: 2, y: 0, pressure: 0.5, timestamp: 2 },
      { x: 2, y: 4, pressure: 0.5, timestamp: 6 },
      { x: 4, y: 4, pressure: 0.5, timestamp: 8 },
    ]);

    expect(stamps.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [2, 1],
      [2, 4],
      [4, 4],
    ]);

    const exactEndpoint = new BrushEngine({ spacingPx: 5 }).generateStamps([
      { x: 0, y: 0, timestamp: 0 },
      { x: 10, y: 0, timestamp: 10 },
    ]);
    expect(exactEndpoint.map(({ x }) => x)).toEqual([0, 5, 10]);
  });

  it("is deterministic for the same ordered input and preserves equal-timestamp dispatch order", () => {
    const engine = new BrushEngine({ spacingPx: 3, pressureRadius: 0, pressureOpacity: 0 });
    const ordered = [
      { x: 10, y: 0, pressure: 1.2, timestamp: 3, coalesced: false },
      { x: 0, y: 0, pressure: -0.2, timestamp: 1, coalesced: false },
      { x: 6, y: 0, pressure: 0.6, timestamp: 2, coalesced: true },
      { x: 4, y: 0, pressure: 0.4, timestamp: 2, coalesced: true },
    ] as const;

    const first = engine.generateStamps(ordered);
    const second = engine.generateStamps(ordered);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.map(({ x }) => x)).toEqual([0, 3, 6, 5, 8, 10]);
    expect(first.every((stamp, index) => index === 0 || stamp.timestamp >= first[index - 1]!.timestamp)).toBe(true);
  });

  it("keeps the writable prefix stable when an equal-timestamp sample is appended", () => {
    const engine = new BrushEngine({ spacingPx: 2, pressureRadius: 0, pressureOpacity: 0 });
    const down = { x: 0, y: 0, pressure: 0.5, timestamp: 0, coalesced: false } as const;
    const firstMove = { x: 10, y: 0, pressure: 0.5, timestamp: 1, coalesced: true } as const;
    const exactDuplicate = { ...firstMove };
    const secondMove = { x: 0, y: 10, pressure: 0.5, timestamp: 1, coalesced: false } as const;

    const beforeAppend = engine.generateStamps([down, firstMove]);
    const afterAppend = engine.generateStamps([down, firstMove, exactDuplicate, secondMove]);
    const withoutDuplicate = engine.generateStamps([down, firstMove, secondMove]);

    expect(beforeAppend.slice(0, -1)).toEqual(afterAppend.slice(0, beforeAppend.length - 1));
    expect(afterAppend).toEqual(withoutDuplicate);
    expect(afterAppend.slice(0, 6).map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [2, 0],
      [4, 0],
      [6, 0],
      [8, 0],
      [10, 0],
    ]);
  });

  it("treats an empty or zero-distance path as a safe boundary", () => {
    const engine = new BrushEngine();

    expect(engine.generateStamps([])).toEqual([]);
    expect(
      engine.generateStamps([
        { x: 7, y: 9, pressure: 0.25, timestamp: 1 },
        { x: 7, y: 9, pressure: 0.75, timestamp: 2 },
      ]),
    ).toEqual([
      {
        x: 7,
        y: 9,
        timestamp: 1,
        hardness: 0.75,
        pressure: 0.25,
        radiusPx: 5.25,
        opacity: 0.25,
      },
    ]);
  });

  it("rejects invalid samples and pathological expansions atomically", () => {
    const engine = new BrushEngine();
    expect(() =>
      engine.generateStamps([
        { x: 0, y: 0, timestamp: 0 },
        { x: Number.NaN, y: 0, timestamp: 1 },
      ]),
    ).toThrow("sample.x must be finite");
    expect(() =>
      engine.generateStamps([
        { x: -1e308, y: 0, timestamp: 0 },
        { x: 1e308, y: 0, timestamp: 1 },
      ]),
    ).toThrow("brush sample path length must be finite");
    expect(() =>
      new BrushEngine({ spacingPx: 0.000_001 }).generateStamps([
        { x: 0, y: 0, timestamp: 0 },
        { x: 2, y: 0, timestamp: 1 },
      ]),
    ).toThrow("brush stroke exceeds");
  });
});
