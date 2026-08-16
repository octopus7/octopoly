import { describe, expect, it } from "vitest";

import { createFacialScene } from "../src/facial/scene";
import { createDefaultFacialWorkspace, duplicateBaseMesh } from "../src/facial/workspace";

describe("facial viewport scene adapter", () => {
  it("maps only the active copy and selected vertex into a viewport scene", () => {
    const workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");

    const scene = createFacialScene(workspace, 3, 7);

    expect(scene.meshId).toBe("copy-1");
    expect(scene.sceneRevision).toBe(7);
    expect(scene.geometry).toBe(workspace.meshes[1]?.geometry);
    expect(scene.selectedVertex).toBe(3);
    expect(scene.editable).toBe(true);
  });
});
