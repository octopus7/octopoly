import { describe, expect, it } from "vitest";

import {
  interleavePositionsAndNormals,
  pickVertex,
  projectPosition,
} from "../src/viewport/mesh-utils";

describe("mesh viewport utilities", () => {
  it("computes normalized vertex normals for an indexed triangle", () => {
    const interleaved = interleavePositionsAndNormals(
      [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      [0, 1, 2],
    );

    expect([...interleaved]).toEqual([
      -1, -1, 0, 0, 0, 1,
      1, -1, 0, 0, 0, 1,
      0, 1, 0, 0, 0, 1,
    ]);
  });

  it("projects a visible 3D point into canvas CSS coordinates", () => {
    const identity = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    expect(projectPosition([0, 0, 0], identity, 200, 100)).toEqual({ x: 100, y: 50, depth: 0 });
    expect(projectPosition([1, -1, 0], identity, 200, 100)).toEqual({ x: 200, y: 100, depth: 0 });
  });

  it("picks the nearest projected vertex inside the hit radius", () => {
    const identity = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    const positions = [-0.5, 0, 0, 0.5, 0, 0];

    expect(pickVertex(positions, identity, 200, 100, 147, 51, 12)).toBe(1);
  });
});
