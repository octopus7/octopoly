import { describe, expect, it } from "vitest";
import type { MeshDocument, MeshFactory } from "@octopoly/contracts";
import * as meshApi from "../../src/mesh";

describe("mesh local public API", () => {
  it("exports only the concrete canonical providers", () => {
    expect(Object.keys(meshApi).sort()).toEqual(["MeshKernel", "MeshKernelFactory"]);
    const document: MeshDocument = new meshApi.MeshKernel();
    const factory: MeshFactory = new meshApi.MeshKernelFactory();
    expect(document.snapshot().version).toBe(0);
    expect(factory.createEmpty().snapshot().version).toBe(0);
  });
});
