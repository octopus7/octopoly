import { describe, expect, it } from "vitest";
import type { AttributeKey, AttributeValue } from "@octopoly/contracts";
import { ImmutableAttributeSnapshot } from "../../../src/mesh/attributes";
import {
  addVertex,
  attributeStoreKey,
  createMeshState,
  setAttributeValue,
  validateTopology,
} from "../../../src/mesh/internal";

describe("generic mesh attributes", () => {
  const weight: AttributeKey<number> = { domain: "vertex", name: "weight" };

  it("stores generic values without interpreting names and returns immutable copies", () => {
    const state = createMeshState();
    const vertex = addVertex(state, { x: 0, y: 0, z: 0 });
    setAttributeValue(state, weight.domain, weight.name, vertex, 0.75);
    setAttributeValue(state, "vertex", "anything", vertex, [1, 2, 3]);
    const snapshot = new ImmutableAttributeSnapshot(state);

    expect(snapshot.has(weight)).toBe(true);
    expect(snapshot.get(weight, vertex)).toBe(0.75);
    const key: AttributeKey<AttributeValue> = { domain: "vertex", name: "anything" };
    const value = snapshot.get(key, vertex) as ReadonlyArray<number>;
    expect(Object.isFrozen(value)).toBe(true);
    expect(validateTopology(state)).toEqual([]);
  });

  it("detects wrong-domain and non-finite entries", () => {
    const state = createMeshState();
    const vertex = addVertex(state, { x: 0, y: 0, z: 0 });
    state.attributes.set(attributeStoreKey("face", "bad"), {
      domain: "face",
      name: "bad",
      entries: new Map([[vertex, Number.NaN]]),
    });

    const errors = validateTopology(state).join("\n");
    expect(errors).toContain("references missing face");
    expect(errors).toContain("must be finite");
  });

  it("rejects object attribute values that are not canonical vectors", () => {
    const state = createMeshState();
    const vertex = addVertex(state, { x: 0, y: 0, z: 0 });
    state.attributes.set(attributeStoreKey("vertex", "bad-shape"), {
      domain: "vertex",
      name: "bad-shape",
      entries: new Map([[vertex, { x: 1 } as never]]),
    });
    expect(validateTopology(state).join("\n")).toContain("must be finite");
  });
});
