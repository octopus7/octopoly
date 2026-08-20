import { describe, expect, it } from "vitest";

import { serializeWorkspaceObj } from "../src/facial/export-obj";
import type { FacialWorkspace } from "../src/facial/workspace";

const workspace: FacialWorkspace = {
  version: 1,
  activeMeshId: "copy-1",
  meshes: [
    {
      id: "base",
      name: "Base Mask",
      kind: "base",
      geometry: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        uvs: [0, 0, 1, 0, 0, 1],
      },
    },
    {
      id: "copy-1",
      name: "QA Copy / eye",
      kind: "copy",
      geometry: {
        positions: [0, 0, 1, 1, 0, 1, 0, 1, 1],
        indices: [0, 2, 1],
      },
    },
  ],
};

describe("OBJ workspace export", () => {
  it("exports only the active model with local one-based indices", () => {
    expect(serializeWorkspaceObj(workspace, "active")).toBe([
      "# OctoPoly OBJ export",
      "o QA_Copy_eye",
      "v 0 0 1",
      "v 1 0 1",
      "v 0 1 1",
      "f 1 3 2",
      "",
    ].join("\n"));
  });

  it("exports Base and every model in workspace order with global offsets and aligned UVs", () => {
    expect(serializeWorkspaceObj(workspace, "all")).toBe([
      "# OctoPoly OBJ export",
      "o Base_Mask",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "vt 0 0",
      "vt 1 0",
      "vt 0 1",
      "f 1/1 2/2 3/3",
      "o QA_Copy_eye",
      "v 0 0 1",
      "v 1 0 1",
      "v 0 1 1",
      "f 4 6 5",
      "",
    ].join("\n"));
  });

  it("fails closed when the active mesh is missing instead of exporting the wrong model", () => {
    expect(() => serializeWorkspaceObj({ ...workspace, activeMeshId: "missing" }, "active"))
      .toThrow(/active/i);
  });
});
