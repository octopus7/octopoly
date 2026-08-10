import type {
  MeshCommand,
  MeshMutationService,
  MeshQuery,
  SelectionService,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { createPrimitive } from "../../../src/app/composition/primitive-creation";
import {
  CUBE_RECIPE,
  PLANE_RECIPE,
  type PrimitiveRecipe,
} from "../../../src/app/composition/primitive-recipes";
import { createHistoryService } from "../../../src/history";
import { MeshKernel } from "../../../src/mesh";
import { SelectionStore } from "../../../src/selection";

function execute(mesh: MeshKernel, command: MeshCommand): void {
  mesh.execute("fixture", command);
}

describe("createPrimitive", () => {
  it("creates Plane vertices sequentially from actual result IDs and commits one history entry", () => {
    const mesh = new MeshKernel();
    execute(mesh, { kind: "createVertex", position: { x: -2, y: -2, z: 0 } });
    execute(mesh, { kind: "createVertex", position: { x: -1, y: -2, z: 0 } });
    execute(mesh, { kind: "createVertex", position: { x: -2, y: -1, z: 0 } });
    execute(mesh, { kind: "createFace", vertices: [0, 1, 2] });
    const before = mesh.snapshot();
    const commands: MeshCommand[] = [];
    const mutations: MeshMutationService = {
      execute(label, command) {
        commands.push(command);
        return mesh.execute(label, command);
      },
      validate: (command) => mesh.validate(command),
    };
    const history = createHistoryService();
    const selectionStore = new SelectionStore();
    let historyCommittedBeforeSelection = false;
    const selection: SelectionService = {
      snapshot: () => selectionStore.snapshot(),
      update(mode, change) {
        historyCommittedBeforeSelection = history.snapshot().canUndo;
        selectionStore.update(mode, change);
      },
      clear: () => selectionStore.clear(),
      prune: (query) => selectionStore.prune(query),
      subscribe: (listener) => selectionStore.subscribe(listener),
    };

    const created = createPrimitive(PLANE_RECIPE, {
      mesh,
      mutations,
      history,
      selection,
    });

    expect(commands.map((command) => command.kind)).toEqual([
      "createVertex",
      "createVertex",
      "createVertex",
      "createVertex",
      "createFace",
    ]);
    const vertexIds = created.vertices ?? [];
    expect(vertexIds).toEqual([3, 4, 5, 6]);
    expect(commands[4]).toEqual({ kind: "createFace", vertices: vertexIds });
    expect(created.edges).toHaveLength(4);
    expect(created.corners).toHaveLength(4);
    expect(created.faces).toHaveLength(1);
    const after = mesh.snapshot();
    expect(after.vertices).toHaveLength(before.vertices.length + 4);
    expect(after.edges).toHaveLength(before.edges.length + 4);
    expect(after.corners).toHaveLength(before.corners.length + 4);
    expect(after.faces).toHaveLength(before.faces.length + 1);
    expect(history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "Add plane",
    });
    expect(historyCommittedBeforeSelection).toBe(true);
    expect([...selection.snapshot().faces]).toEqual(created.faces);

    history.undo();
    expect(mesh.snapshot()).toEqual(before);
    history.redo();
    expect(mesh.snapshot().vertices.slice(-4).map(({ id }) => id)).toEqual(vertexIds);
    expect(mesh.snapshot().faces.at(-1)?.id).toBe(created.faces?.[0]);
  });

  it("rejects a malformed createVertex result and rolls back before creating a face", () => {
    const mesh = new MeshKernel();
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    const selectionBefore = selection.snapshot();
    const commands: MeshCommand[] = [];
    const mutations: MeshMutationService = {
      execute(label, command) {
        commands.push(command);
        const result = mesh.execute(label, command);
        if (command.kind !== "createVertex") return result;
        return {
          ...result,
          created: { ...result.created, vertices: [result.created.vertices![0]!, 999] },
        };
      },
      validate: (command) => mesh.validate(command),
    };

    expect(() =>
      createPrimitive(PLANE_RECIPE, { mesh, mutations, history, selection }),
    ).toThrow(/exactly one created vertex/);

    expect(commands.map(({ kind }) => kind)).toEqual(["createVertex"]);
    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
    expect(selection.snapshot()).toBe(selectionBefore);
  });

  it("rejects a malformed createFace result and rolls back all Plane vertices", () => {
    const mesh = new MeshKernel();
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    const selectionBefore = selection.snapshot();
    const mutations: MeshMutationService = {
      execute(label, command) {
        const result = mesh.execute(label, command);
        if (command.kind !== "createFace") return result;
        return {
          ...result,
          created: { ...result.created, faces: [result.created.faces![0]!, 999] },
        };
      },
      validate: (command) => mesh.validate(command),
    };

    expect(() =>
      createPrimitive(PLANE_RECIPE, { mesh, mutations, history, selection }),
    ).toThrow(/createFace result shape/);

    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
    expect(selection.snapshot()).toBe(selectionBefore);
  });

  it("validates exact aggregate counts before commit", () => {
    const mesh = new MeshKernel();
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    const invalidCounts: PrimitiveRecipe = {
      ...PLANE_RECIPE,
      expected: { ...PLANE_RECIPE.expected, edges: 5 },
    };

    expect(() =>
      createPrimitive(invalidCounts, { mesh, mutations: mesh, history, selection }),
    ).toThrow(/expected 5 edges, created 4/);

    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
  });

  it("validates created face corner topology before commit", () => {
    const mesh = new MeshKernel();
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    const corruptQuery: MeshQuery = {
      snapshot: () => mesh.snapshot(),
      vertex: (id) => mesh.vertex(id),
      edge: (id) => mesh.edge(id),
      corner(id) {
        const corner = mesh.corner(id);
        return corner === null ? null : { ...corner, vertex: 999 };
      },
      face: (id) => mesh.face(id),
      incidentEdges: (id) => mesh.incidentEdges(id),
      incidentFaces: (id) => mesh.incidentFaces(id),
      adjacentFaces: (id) => mesh.adjacentFaces(id),
      findEdge: (a, b) => mesh.findEdge(a, b),
    };

    expect(() =>
      createPrimitive(PLANE_RECIPE, {
        mesh: corruptQuery,
        mutations: mesh,
        history,
        selection,
      }),
    ).toThrow(/topology.*vertex/);

    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
  });

  it("rolls back every vertex patch and preserves selection when face creation fails", () => {
    const mesh = new MeshKernel();
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    const selectionBefore = selection.snapshot();
    const mutations: MeshMutationService = {
      execute(label, command) {
        if (command.kind === "createFace") throw new Error("injected face failure");
        return mesh.execute(label, command);
      },
      validate: (command) => mesh.validate(command),
    };

    expect(() =>
      createPrimitive(PLANE_RECIPE, { mesh, mutations, history, selection }),
    ).toThrow("injected face failure");

    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
    expect(selection.snapshot()).toBe(selectionBefore);
  });

  it("rolls back applied patches and preserves selection when a vertex mutation fails", () => {
    const mesh = new MeshKernel();
    execute(mesh, { kind: "createVertex", position: { x: -2, y: -2, z: 0 } });
    execute(mesh, { kind: "createVertex", position: { x: -1, y: -2, z: 0 } });
    execute(mesh, { kind: "createVertex", position: { x: -2, y: -1, z: 0 } });
    execute(mesh, { kind: "createFace", vertices: [0, 1, 2] });
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    selection.update("replace", { faces: new Set([0]) });
    const selectionBefore = selection.snapshot();
    let vertexCalls = 0;
    const mutations: MeshMutationService = {
      execute(label, command) {
        if (command.kind === "createVertex" && ++vertexCalls === 3) {
          throw new Error("injected vertex failure");
        }
        return mesh.execute(label, command);
      },
      validate: (command) => mesh.validate(command),
    };

    expect(() =>
      createPrimitive(PLANE_RECIPE, { mesh, mutations, history, selection }),
    ).toThrow("injected vertex failure");

    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
    expect(selection.snapshot()).toBe(selectionBefore);
  });

  it("does not attempt to roll back an already committed transaction when post-action selection fails", () => {
    const mesh = new MeshKernel();
    const history = createHistoryService();
    const selectionStore = new SelectionStore();
    const selection: SelectionService = {
      snapshot: () => selectionStore.snapshot(),
      update: () => {
        throw new Error("injected selection failure");
      },
      clear: () => selectionStore.clear(),
      prune: (query) => selectionStore.prune(query),
      subscribe: (listener) => selectionStore.subscribe(listener),
    };

    expect(() =>
      createPrimitive(PLANE_RECIPE, { mesh, mutations: mesh, history, selection }),
    ).toThrow("injected selection failure");

    expect(mesh.snapshot().vertices.map(({ id }) => id)).toEqual([0, 1, 2, 3]);
    expect(mesh.snapshot().faces.map(({ id }) => id)).toEqual([0]);
    expect(history.snapshot()).toMatchObject({ canUndo: true, undoLabel: "Add plane" });
  });

  it("creates Cube through fourteen mutations, selects all faces, and records one history entry", () => {
    const mesh = new MeshKernel();
    const history = createHistoryService();
    const selection = new SelectionStore();
    const commands: MeshCommand[] = [];
    const mutations: MeshMutationService = {
      execute(label, command) {
        commands.push(command);
        return mesh.execute(label, command);
      },
      validate: (command) => mesh.validate(command),
    };

    const created = createPrimitive(CUBE_RECIPE, { mesh, mutations, history, selection });
    const snapshot = mesh.snapshot();

    expect(commands.map(({ kind }) => kind)).toEqual([
      ...Array.from({ length: 8 }, () => "createVertex"),
      ...Array.from({ length: 6 }, () => "createFace"),
    ]);
    expect(created.vertices).toHaveLength(8);
    expect(created.edges).toHaveLength(12);
    expect(created.corners).toHaveLength(24);
    expect(created.faces).toHaveLength(6);
    expect(snapshot.vertices).toHaveLength(8);
    expect(snapshot.edges).toHaveLength(12);
    expect(snapshot.corners).toHaveLength(24);
    expect(snapshot.faces).toHaveLength(6);
    expect([...selection.snapshot().faces]).toEqual(created.faces);
    expect(history.snapshot()).toEqual({ canUndo: true, canRedo: false, undoLabel: "Add cube" });

    history.undo();
    expect(mesh.snapshot()).toMatchObject({ vertices: [], edges: [], corners: [], faces: [] });
    history.redo();
    expect(mesh.snapshot().faces.map(({ id }) => id)).toEqual(created.faces);
  });

  it("rolls back all Cube vertices and earlier faces when a middle face mutation fails", () => {
    const mesh = new MeshKernel();
    const before = mesh.snapshot();
    const history = createHistoryService();
    const selection = new SelectionStore();
    selection.update("replace", { vertices: new Set([999]) });
    const selectionBefore = selection.snapshot();
    let faceCalls = 0;
    const mutations: MeshMutationService = {
      execute(label, command) {
        if (command.kind === "createFace" && ++faceCalls === 4) {
          throw new Error("injected cube face failure");
        }
        return mesh.execute(label, command);
      },
      validate: (command) => mesh.validate(command),
    };

    expect(() =>
      createPrimitive(CUBE_RECIPE, { mesh, mutations, history, selection }),
    ).toThrow("injected cube face failure");

    expect(mesh.snapshot()).toEqual(before);
    expect(history.snapshot()).toEqual({ canUndo: false, canRedo: false });
    expect(selection.snapshot()).toBe(selectionBefore);
  });
});
