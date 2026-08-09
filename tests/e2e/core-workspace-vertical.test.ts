import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CancelAfterMutationRetopoEngine,
  createWorkspaceFixture,
  MultiPatchRetopoEngine,
  pen,
  REFERENCE_TRIANGLE,
  TRANSLATE_REFERENCE_BACK,
} from "./core-workspace-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CoreWorkspace end-to-end vertical slice", () => {
  it("imports, renders, strokes through staged mutations, groups history, reloads, and exports", async () => {
    const retopo = new MultiPatchRetopoEngine();
    const fixture = createWorkspaceFixture(() => retopo);
    const { workspace } = fixture;
    await expect(workspace.initialize(fixture.canvas)).resolves.toMatchObject({
      status: "ready",
      capabilities: { backend: "webgl2" },
    });

    const referenceRef = await workspace.importReference(
      REFERENCE_TRIANGLE,
      TRANSLATE_REFERENCE_BACK,
    );
    fixture.flushFrames();
    expect(referenceRef.worldTransform).toEqual(TRANSLATE_REFERENCE_BACK);
    expect(workspace.renderedReferenceGeometry()?.positions.map((position) => position.z)).toEqual([-2, -2, -2]);
    expect(fixture.gl.draws).toContainEqual([
      fixture.gl.TRIANGLES,
      3,
      fixture.gl.UNSIGNED_INT,
      0,
    ]);

    expect(workspace.dispatch(pen("down", 10))).toMatchObject({ capturePointer: true });
    expect(workspace.sceneSnapshot().preview?.id).toBe("deterministic-e2e-preview");
    expect(workspace.dispatch(pen("move", 12, { coalesced: true }))).toMatchObject({ handled: true });
    fixture.flushFrames();
    expect(fixture.gl.arrayDraws.some(([, count]) => count === 1)).toBe(true);

    const touchWhileCaptured = workspace.dispatch(Object.freeze({
      ...pen("down", 13, { pointerId: 77 }),
      pointerType: "touch" as const,
    }));
    expect(touchWhileCaptured).toEqual({ handled: false });
    expect(workspace.dispatch(pen("up", 14))).toMatchObject({ releasePointer: true });
    fixture.flushFrames();

    const completed = workspace.serializedMesh();
    expect(completed.vertices).toHaveLength(3);
    expect(completed.faces).toHaveLength(1);
    expect(retopo.sessions[0]?.createdVertices).toEqual(completed.vertices.map((vertex) => vertex.id));
    expect(retopo.sessions[0]?.surfaceHits.every((hit) => hit?.position.z === -2)).toBe(true);
    expect(fixture.picking.screenPoints).toEqual([
      [160.1, 100],
      [160.12, 100],
      [160.14, 100],
    ]);
    expect(workspace.sceneSnapshot().preview).toBeUndefined();
    expect(workspace.history.snapshot()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: "Retopo stroke" });

    const stableIds = {
      vertices: completed.vertices.map((vertex) => vertex.id),
      edges: completed.edges.map((edge) => edge.id),
      corners: completed.corners.map((corner) => corner.id),
      faces: completed.faces.map((face) => face.id),
    };
    workspace.history.undo();
    expect(workspace.mesh.snapshot()).toMatchObject({ vertices: [], faces: [] });
    expect(workspace.history.snapshot()).toMatchObject({ canUndo: false, canRedo: true });
    workspace.history.redo();
    expect({
      vertices: workspace.mesh.snapshot().vertices.map((vertex) => vertex.id),
      edges: workspace.mesh.snapshot().edges.map((edge) => edge.id),
      corners: workspace.mesh.snapshot().corners.map((corner) => corner.id),
      faces: workspace.mesh.snapshot().faces.map((face) => face.id),
    }).toEqual(stableIds);

    const faceId = workspace.mesh.snapshot().faces[0]?.id;
    expect(faceId).toBeDefined();
    workspace.selection.update("replace", { faces: new Set([faceId as number]) });
    fixture.flushFrames();
    expect([...workspace.sceneSnapshot().selection.faces]).toEqual([faceId]);

    const saved = await workspace.saveProject("vertical-slice");
    expect(saved.mesh).toEqual(workspace.serializedMesh());
    expect(saved.referenceAssets).toEqual([referenceRef]);
    expect(await workspace.loadProject("vertical-slice")).toBe(true);
    expect(workspace.serializedMesh()).toEqual(saved.mesh);
    expect(workspace.referenceAssetRefs()).toEqual(saved.referenceAssets);
    expect(workspace.renderedReferenceGeometry()?.positions.map((position) => position.z)).toEqual([-2, -2, -2]);
    expect(workspace.exportObj()).toContain("f ");
    expect(workspace.exportGlb().byteLength).toBeGreaterThan(20);

    workspace.dispose();
  });

  it("normalizes lost capture into rollback with no mesh or history residue", async () => {
    const retopo = new CancelAfterMutationRetopoEngine();
    const fixture = createWorkspaceFixture(() => retopo);
    const { workspace, canvas } = fixture;
    await workspace.initialize(canvas);

    canvas.dispatchEvent(pointerEvent("pointerdown", 31, 10));
    expect(workspace.mesh.snapshot().vertices).toHaveLength(1);
    expect(workspace.sceneSnapshot().preview?.id).toBe("deterministic-e2e-preview");
    expect(workspace.history.snapshot()).toMatchObject({ canUndo: false, canRedo: false });

    canvas.dispatchEvent(pointerEvent("lostpointercapture", 31, 11));
    canvas.dispatchEvent(pointerEvent("lostpointercapture", 31, 12));
    fixture.flushFrames();

    expect(workspace.mesh.snapshot().vertices).toEqual([]);
    expect(workspace.sceneSnapshot().preview).toBeUndefined();
    expect(workspace.history.snapshot()).toMatchObject({ canUndo: false, canRedo: false });
    expect(retopo.session).toMatchObject({ cancelled: true, disposed: true });
    workspace.dispose();
  });

  it("restores the Core WebGL2 renderer and last CPU scene after context loss", async () => {
    const fixture = createWorkspaceFixture(() => new MultiPatchRetopoEngine());
    const { workspace } = fixture;
    await workspace.initialize(fixture.canvas);
    await workspace.importReference(REFERENCE_TRIANGLE, TRANSLATE_REFERENCE_BACK);
    fixture.flushFrames();
    const drawsBeforeLoss = fixture.gl.draws.length;

    workspace.handleContextLoss();
    expect(workspace.renderer.state()).toBe("context-lost");
    await expect(workspace.restoreRenderer()).resolves.toMatchObject({ status: "ready" });
    fixture.flushFrames();

    expect(workspace.renderer.state()).toBe("ready");
    expect(fixture.gl.draws.length).toBeGreaterThan(drawsBeforeLoss);
    expect(workspace.sceneSnapshot().reference?.positions.map((position) => position.z)).toEqual([-2, -2, -2]);
    workspace.dispose();
  });
});

function pointerEvent(type: string, pointerId: number, timeStamp: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 160,
    clientY: 100,
    buttons: type === "pointerdown" ? 1 : 0,
  });
  for (const [key, value] of Object.entries({
    pointerId,
    pointerType: "pen",
    isPrimary: true,
    pressure: type === "pointerdown" ? 0.5 : 0,
    tiltX: 12,
    tiltY: -14,
    timeStamp,
    getCoalescedEvents: () => [],
  })) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event as PointerEvent;
}
