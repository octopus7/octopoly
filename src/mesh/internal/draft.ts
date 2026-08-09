import type {
  AttributeDomain,
  AttributeValue,
  Vec3,
} from "@octopoly/contracts";
import {
  addFace,
  addVertex,
  faceVertices,
  removeFace,
  removeVertex,
  replaceFaceVertices,
  setAttributeValue,
  setVertexPosition,
} from "./state";
import type { CreatedFaceRecords, MeshState, RemovedElementIds } from "./types";

/**
 * Frozen Gate-1 mutation surface. Command operators mutate only a cloned MeshState through this API;
 * MeshKernel validates the completed draft before atomically installing it.
 */
export class MeshDraft {
  public constructor(public readonly state: MeshState) {}

  public createVertex(position: Vec3): number {
    return addVertex(this.state, position);
  }

  public createFace(vertices: ReadonlyArray<number>): CreatedFaceRecords {
    return addFace(this.state, vertices);
  }

  public replaceFace(face: number, vertices: ReadonlyArray<number>): ReturnType<typeof replaceFaceVertices> {
    return replaceFaceVertices(this.state, face, vertices);
  }

  public removeFace(face: number): RemovedElementIds {
    return removeFace(this.state, face);
  }

  public removeVertex(vertex: number): void {
    removeVertex(this.state, vertex);
  }

  public setVertexPosition(vertex: number, position: Vec3): void {
    setVertexPosition(this.state, vertex, position);
  }

  public setAttribute(
    domain: AttributeDomain,
    name: string,
    element: number,
    value: AttributeValue | undefined,
  ): void {
    setAttributeValue(this.state, domain, name, element, value);
  }

  public faceVertices(face: number): ReadonlyArray<number> {
    return faceVertices(this.state, face);
  }

  public incidentFaces(vertex: number): ReadonlyArray<number> {
    return [...(this.state.vertexFaces.get(vertex) ?? [])].sort((a, b) => a - b);
  }

  public adjacentFaces(edge: number): ReadonlyArray<number> {
    return [...(this.state.edgeFaces.get(edge) ?? [])].sort((a, b) => a - b);
  }
}
