import type {
  HistoryService,
  MeshElementSet,
  MeshMutationService,
  MeshQuery,
  SelectionService,
  VertexId,
} from "@octopoly/contracts";

import type { PrimitiveRecipe } from "./primitive-recipes";

const DOMAINS = ["vertices", "edges", "corners", "faces"] as const;

function count(elements: MeshElementSet, domain: (typeof DOMAINS)[number]): number {
  return elements[domain]?.length ?? 0;
}

function assertCreateVertexResult(created: MeshElementSet): VertexId {
  if (count(created, "vertices") !== 1) {
    throw new Error("createVertex must return exactly one created vertex");
  }
  for (const domain of ["edges", "corners", "faces"] as const) {
    if (count(created, domain) !== 0) {
      throw new Error(`createVertex unexpectedly created ${domain}`);
    }
  }
  return created.vertices![0]!;
}

function assertCreateFaceResult(
  created: MeshElementSet,
  expectedCorners: number,
): Required<MeshElementSet> {
  if (
    count(created, "vertices") !== 0
    || count(created, "faces") !== 1
    || count(created, "corners") !== expectedCorners
  ) {
    throw new Error("invalid createFace result shape");
  }
  return {
    vertices: [],
    edges: [...(created.edges ?? [])],
    corners: [...(created.corners ?? [])],
    faces: [...(created.faces ?? [])],
  };
}

function assertExpectedCounts(
  recipe: PrimitiveRecipe,
  created: Required<MeshElementSet>,
): void {
  for (const domain of DOMAINS) {
    const actual = created[domain].length;
    const expected = recipe.expected[domain];
    if (actual !== expected) {
      throw new Error(`expected ${expected} ${domain}, created ${actual}`);
    }
  }
}

function assertCreatedTopology(
  recipe: PrimitiveRecipe,
  vertexIds: ReadonlyArray<VertexId>,
  created: Required<MeshElementSet>,
  mesh: MeshQuery,
): void {
  const createdCorners = new Set(created.corners);
  const expectedEdges = new Set<number>();

  for (let vertexIndex = 0; vertexIndex < vertexIds.length; vertexIndex += 1) {
    const id = vertexIds[vertexIndex]!;
    const actual = mesh.vertex(id);
    const expected = recipe.vertices[vertexIndex]!;
    if (
      actual === null
      || actual.position.x !== expected.x
      || actual.position.y !== expected.y
      || actual.position.z !== expected.z
    ) {
      throw new Error(`created topology vertex ${id} does not match its recipe position`);
    }
  }

  for (let faceIndex = 0; faceIndex < recipe.faces.length; faceIndex += 1) {
    const faceId = created.faces[faceIndex]!;
    const expectedFace = recipe.faces[faceIndex]!;
    const actualFace = mesh.face(faceId);
    if (actualFace === null || actualFace.corners.length !== expectedFace.length) {
      throw new Error(`created topology face ${faceId} has an invalid corner cycle`);
    }
    for (let cornerIndex = 0; cornerIndex < expectedFace.length; cornerIndex += 1) {
      const cornerId = actualFace.corners[cornerIndex]!;
      const corner = mesh.corner(cornerId);
      const expectedVertex = vertexIds[expectedFace[cornerIndex]!]!;
      const nextVertex = vertexIds[expectedFace[(cornerIndex + 1) % expectedFace.length]!]!;
      const edge = mesh.findEdge(expectedVertex, nextVertex);
      if (
        !createdCorners.has(cornerId)
        || corner === null
        || corner.face !== faceId
        || corner.vertex !== expectedVertex
        || edge === null
        || corner.edge !== edge
      ) {
        throw new Error(`created topology corner ${cornerId} has an invalid vertex or edge`);
      }
      expectedEdges.add(edge);
    }
  }

  if (
    expectedEdges.size !== created.edges.length
    || created.edges.some((edge) => !expectedEdges.has(edge))
  ) {
    throw new Error("created topology edge set does not match recipe faces");
  }
}

export interface PrimitiveCreationServices {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly history: HistoryService;
  readonly selection: SelectionService;
}

export function createPrimitive(
  recipe: PrimitiveRecipe,
  services: PrimitiveCreationServices,
): MeshElementSet {
  const transaction = services.history.begin(recipe.label);
  const vertices: VertexId[] = [];
  let committed = false;

  try {
    for (const position of recipe.vertices) {
      const result = services.mutations.execute(recipe.label, {
        kind: "createVertex",
        position,
      });
      transaction.recordApplied(result.patch);
      vertices.push(assertCreateVertexResult(result.created));
    }

    const created = {
      vertices,
      edges: [] as number[],
      corners: [] as number[],
      faces: [] as number[],
    };
    for (const face of recipe.faces) {
      const result = services.mutations.execute(recipe.label, {
        kind: "createFace",
        vertices: face.map((index) => vertices[index]!),
      });
      transaction.recordApplied(result.patch);
      const faceCreated = assertCreateFaceResult(result.created, face.length);
      created.edges.push(...faceCreated.edges);
      created.corners.push(...faceCreated.corners);
      created.faces.push(...faceCreated.faces);
    }

    assertExpectedCounts(recipe, created);
    assertCreatedTopology(recipe, vertices, created, services.mesh);
    transaction.commit();
    committed = true;
    services.selection.update("replace", { faces: new Set(created.faces) });
    return Object.freeze({
      vertices: Object.freeze([...created.vertices]),
      edges: Object.freeze([...created.edges]),
      corners: Object.freeze([...created.corners]),
      faces: Object.freeze([...created.faces]),
    });
  } catch (error) {
    if (!committed) {
      transaction.rollback();
    }
    throw error;
  }
}
