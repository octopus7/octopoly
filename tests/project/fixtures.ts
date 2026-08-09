import type { ProjectDocument, SerializedMesh } from "@octopoly/contracts";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../src/project/validation";

export const meshFixture: SerializedMesh = {
  version: 3,
  vertices: [
    { id: 1, position: { x: 0, y: 0, z: 0 } },
    { id: 2, position: { x: 1, y: 0, z: 0 } },
    { id: 3, position: { x: 0, y: 1, z: 0 } },
  ],
  edges: [
    { id: 11, vertices: [1, 2] },
    { id: 12, vertices: [2, 3] },
    { id: 13, vertices: [3, 1] },
  ],
  corners: [
    { id: 21, face: 31, vertex: 1, edge: 11 },
    { id: 22, face: 31, vertex: 2, edge: 12 },
    { id: 23, face: 31, vertex: 3, edge: 13 },
  ],
  faces: [{ id: 31, corners: [21, 22, 23] }],
  attributes: [{ domain: "vertex", name: "weight", entries: [[1, 0.5]] }],
};

export const projectFixture: ProjectDocument = {
  schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
  mesh: meshFixture,
  referenceAssets: [],
  imageAssets: [],
  extensionData: {
    "unknown.example": { schemaVersion: 9, data: { preserved: [true, "yes"] } },
  },
};
