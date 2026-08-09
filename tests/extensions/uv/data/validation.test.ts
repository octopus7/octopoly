import { describe, expect, it } from "vitest";

import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  MeshSnapshot,
} from "@octopoly/contracts";
import {
  UV0_ATTRIBUTE,
  UV0_SEAM_ATTRIBUTE,
  validateUvAttribute,
} from "../../../../src/extensions/uv/data";

function attributes(values: ReadonlyMap<number, unknown>, present = values.size > 0): AttributeSnapshot {
  return {
    has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
      return present && key.domain === "corner" && key.name === "uv0";
    },
    get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
      if (key.domain !== "corner" || key.name !== "uv0") {
        return undefined;
      }
      return values.get(elementId) as T | undefined;
    },
  };
}

function mesh(values: ReadonlyMap<number, unknown>, present?: boolean): MeshSnapshot {
  return {
    version: 1,
    vertices: [],
    edges: [],
    corners: [],
    faces: [
      { id: 20, corners: [200, 201, 202] },
      { id: 10, corners: [100, 101, 102] },
    ],
    attributes: attributes(values, present),
  };
}

describe("UV extension attribute keys", () => {
  it("owns the canonical corner-domain uv0 and optional seam names", () => {
    expect(UV0_ATTRIBUTE).toEqual({ domain: "corner", name: "uv0" });
    expect(UV0_SEAM_ATTRIBUTE).toEqual({ domain: "corner", name: "uv0.seam" });
    expect(Object.isFrozen(UV0_ATTRIBUTE)).toBe(true);
    expect(Object.isFrozen(UV0_SEAM_ATTRIBUTE)).toBe(true);
  });
});

describe("validateUvAttribute", () => {
  it("reports complete finite UVs in deterministic face order", () => {
    const values = new Map([
      [100, { x: 0, y: 0 }],
      [101, { x: 1, y: 0 }],
      [102, { x: 0, y: 1 }],
      [200, { x: 2, y: 0 }],
      [201, { x: 3, y: 0 }],
      [202, { x: 2, y: 1 }],
    ]);

    const result = validateUvAttribute(mesh(values));

    expect(result.valid).toBe(true);
    expect(result.attributePresent).toBe(true);
    expect(result.faces.map(({ face, status }) => [face, status])).toEqual([
      [10, "complete"],
      [20, "complete"],
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.faces)).toBe(true);
  });

  it("distinguishes an absent attribute from all-missing values in a present attribute", () => {
    const absent = validateUvAttribute(mesh(new Map(), false));
    const present = validateUvAttribute(mesh(new Map(), true));

    expect(absent.attributePresent).toBe(false);
    expect(present.attributePresent).toBe(true);
    expect(absent.valid).toBe(true);
    expect(absent.faces.map(({ status }) => status)).toEqual(["missing", "missing"]);
    expect(present.faces.map(({ status }) => status)).toEqual(["missing", "missing"]);
  });

  it("marks a partially populated face invalid without making untouched faces invalid", () => {
    const result = validateUvAttribute(mesh(new Map([
      [100, { x: 0, y: 0 }],
      [102, { x: 0, y: 1 }],
    ])));

    expect(result.valid).toBe(false);
    expect(result.faces[0]).toEqual({
      face: 10,
      status: "partial",
      missingCorners: [101],
      nonFiniteCorners: [],
    });
    expect(result.faces[1]?.status).toBe("missing");
  });

  it("rejects non-finite and non-vector runtime values with precedence over missing values", () => {
    const result = validateUvAttribute(mesh(new Map([
      [100, { x: Number.NaN, y: 0 }],
      [101, { x: 1 }],
      [200, { x: 2, y: Number.POSITIVE_INFINITY }],
      [201, { x: 2, y: 3, z: 4 }],
    ])));

    expect(result.valid).toBe(false);
    expect(result.faces[0]).toEqual({
      face: 10,
      status: "non-finite",
      missingCorners: [102],
      nonFiniteCorners: [100, 101],
    });
    expect(result.faces[1]).toEqual({
      face: 20,
      status: "non-finite",
      missingCorners: [202],
      nonFiniteCorners: [200, 201],
    });
  });

  it("allows complete and wholly missing faces to coexist", () => {
    const result = validateUvAttribute(mesh(new Map([
      [100, { x: 0, y: 0 }],
      [101, { x: 1, y: 0 }],
      [102, { x: 0, y: 1 }],
    ])));

    expect(result.valid).toBe(true);
    expect(result.faces.map(({ status }) => status)).toEqual(["complete", "missing"]);
  });
});
