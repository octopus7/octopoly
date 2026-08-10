import { describe, expect, it } from "vitest";

import { createBasicPrimitivesEntry } from "../../src/app/composition/primitive-entry";
import { createPerspectiveCameraSnapshot } from "../../src/camera";
import { createHistoryService } from "../../src/history";
import { MeshKernel } from "../../src/mesh";
import { SelectionStore } from "../../src/selection";
import type { SelectionFrame } from "../../src/tools/basic/construction-plane";

const viewport = Object.freeze({
  cssWidth: 1024,
  cssHeight: 768,
  devicePixelRatio: 2,
});

function createFixture() {
  const mesh = new MeshKernel();
  const history = createHistoryService();
  const selection = new SelectionStore();
  const appliedFrames: SelectionFrame[] = [];
  let renderRequests = 0;
  const camera = createPerspectiveCameraSnapshot(
    { x: 0, y: 0, z: 5 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    Math.PI / 3,
    0.01,
    1_000,
    viewport,
  );
  const entry = createBasicPrimitivesEntry({
    mesh,
    mutations: mesh,
    history,
    selection,
    getCamera: () => camera,
    getViewport: () => viewport,
    applyFrame(frame) {
      appliedFrames.push(frame);
    },
    requestRender() {
      renderRequests += 1;
    },
  });

  return {
    mesh,
    history,
    selection,
    entry,
    appliedFrames,
    renderRequests: () => renderRequests,
  };
}

function expectFiniteFrame(frame: SelectionFrame): void {
  expect([
    frame.target.x,
    frame.target.y,
    frame.target.z,
    frame.position.x,
    frame.position.y,
    frame.position.z,
    frame.distance,
    frame.paddingFraction,
  ].every(Number.isFinite)).toBe(true);
  expect(frame.distance).toBeGreaterThan(0);
  expect(frame.paddingFraction).toBeGreaterThanOrEqual(0.15);
}

describe("basic primitives composition entry", () => {
  it("adds and selects a framed Plane through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addPlane();

    const mesh = fixture.mesh.snapshot();
    expect(mesh.vertices).toHaveLength(4);
    expect(mesh.edges).toHaveLength(4);
    expect(mesh.corners).toHaveLength(4);
    expect(mesh.faces).toHaveLength(1);
    expect([...fixture.selection.snapshot().faces]).toEqual([mesh.faces[0]!.id]);
    expect(fixture.history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Add plane",
    });
    expect(fixture.appliedFrames).toHaveLength(1);
    expectFiniteFrame(fixture.appliedFrames[0]!);
    expect(fixture.renderRequests()).toBe(1);

    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);
    expect(fixture.history.snapshot().canUndo).toBe(false);
  });

  it("adds and selects a framed Cube through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addCube();

    const mesh = fixture.mesh.snapshot();
    expect(mesh.vertices).toHaveLength(8);
    expect(mesh.edges).toHaveLength(12);
    expect(mesh.corners).toHaveLength(24);
    expect(mesh.faces).toHaveLength(6);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Add cube",
    });
    expect(fixture.appliedFrames).toHaveLength(1);
    expectFiniteFrame(fixture.appliedFrames[0]!);
    expect(fixture.renderRequests()).toBe(1);

    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);
    fixture.history.redo();
    expect(fixture.mesh.snapshot().faces).toHaveLength(6);
  });

  it("adds and selects a framed Duck through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addDuck();

    const mesh = fixture.mesh.snapshot();
    expect(mesh.vertices).toHaveLength(24);
    expect(mesh.edges).toHaveLength(36);
    expect(mesh.corners).toHaveLength(72);
    expect(mesh.faces).toHaveLength(18);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add duck");
    expect(fixture.appliedFrames).toHaveLength(1);
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);
  });

  it("adds and selects a framed Frog through one real history entry", () => {
    const fixture = createFixture();

    fixture.entry.addFrog();

    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([56, 84, 168, 42]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add frog");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds and selects a framed Pig through one real history entry", () => {
    const fixture = createFixture();
    fixture.entry.addPig();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([64, 96, 192, 48]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add pig");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds and selects a framed Cow through one real history entry", () => {
    const fixture = createFixture();
    fixture.entry.addCow();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([72, 108, 216, 54]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add cow");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("adds and selects a framed Rabbit through one real history entry", () => {
    const fixture = createFixture();
    fixture.entry.addRabbit();
    const mesh = fixture.mesh.snapshot();
    expect([mesh.vertices.length, mesh.edges.length, mesh.corners.length, mesh.faces.length]).toEqual([48, 72, 144, 36]);
    expect([...fixture.selection.snapshot().faces]).toEqual(mesh.faces.map(({ id }) => id));
    expect(fixture.history.snapshot().undoLabel).toBe("Add rabbit");
    expectFiniteFrame(fixture.appliedFrames[0]!);
    fixture.history.undo();
    expect(fixture.mesh.snapshot().vertices).toHaveLength(0);
  });

  it("creates the default Cube exactly once only for a genuinely new first mount", () => {
    const fixture = createFixture();

    const created = fixture.entry.ensureDefaultCubeForFirstMount(true);

    expect(created?.faces).toHaveLength(6);
    expect(fixture.mesh.snapshot().faces).toHaveLength(6);
    expect([...fixture.selection.snapshot().faces]).toEqual(fixture.mesh.snapshot().faces.map(({ id }) => id));
    expect(fixture.appliedFrames).toHaveLength(1);
    fixture.history.undo();
    expect(fixture.entry.ensureDefaultCubeForFirstMount(true)).toBeNull();
    expect(fixture.mesh.snapshot().faces).toHaveLength(0);

    const existing = createFixture();
    expect(existing.entry.ensureDefaultCubeForFirstMount(false)).toBeNull();
    expect(existing.entry.ensureDefaultCubeForFirstMount(true)).toBeNull();
    expect(existing.mesh.snapshot().faces).toHaveLength(0);
  });

  it("makes frameSelection an explicit no-op for an empty selection", () => {
    const fixture = createFixture();
    const before = fixture.mesh.snapshot();

    fixture.entry.frameSelection();

    expect(fixture.mesh.snapshot()).toEqual(before);
    expect(fixture.appliedFrames).toEqual([]);
    expect(fixture.renderRequests()).toBe(0);
  });

  it("reports empty and non-empty mesh state across add and undo", () => {
    const fixture = createFixture();

    expect(fixture.entry.state()).toMatchObject({ emptyMesh: true });
    fixture.entry.addPlane();
    expect(fixture.entry.state()).toMatchObject({ emptyMesh: false });

    fixture.history.undo();
    expect(fixture.entry.state()).toMatchObject({ emptyMesh: true });
  });
});
