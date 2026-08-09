import type {
  AttributeKey,
  AttributeValue,
  CornerId,
  ImageAssetRef,
  MeshSnapshot,
  MeshTriangle,
  MeshTriangleHit,
  MeshTriangulationService,
  Vec2,
} from "@octopoly/contracts";
import type { CornerUvTuple } from "../projection";

export const UV0_ATTRIBUTE_KEY: Readonly<AttributeKey<Vec2>> = Object.freeze({
  domain: "corner",
  name: "uv0",
});

function isFiniteVec2(value: AttributeValue | undefined): value is Vec2 {
  const candidate = value as Partial<Vec2 & { readonly z: number; readonly w: number }> | undefined;
  return value !== undefined
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(candidate?.x)
    && Number.isFinite(candidate?.y)
    && candidate?.z === undefined
    && candidate?.w === undefined;
}

function tupleEquals<T>(
  first: readonly [T, T, T],
  second: readonly [T, T, T],
): boolean {
  return first[0] === second[0]
    && first[1] === second[1]
    && first[2] === second[2];
}

function hasCanonicalSnapshotMapping(mesh: MeshSnapshot, triangle: MeshTriangle): boolean {
  const face = mesh.faces.find((candidate) => candidate.id === triangle.face);
  if (face === undefined) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    const cornerId = triangle.corners[index]!;
    const vertexId = triangle.vertices[index]!;
    const corner = mesh.corners.find((candidate) => candidate.id === cornerId);
    if (corner === undefined
      || corner.face !== triangle.face
      || corner.vertex !== vertexId
      || !face.corners.includes(cornerId)
      || !mesh.vertices.some((vertex) => vertex.id === vertexId)) {
      return false;
    }
  }

  return true;
}

function isStructurallyValidImage(ref: ImageAssetRef): boolean {
  return typeof ref.id === "string"
    && ref.id.length > 0
    && Number.isSafeInteger(ref.revision)
    && ref.revision >= 0
    && Number.isSafeInteger(ref.width)
    && ref.width > 0
    && Number.isSafeInteger(ref.height)
    && ref.height > 0
    && (ref.colorSpace === "srgb" || ref.colorSpace === "linear");
}

export class PaintTargetAdapter {
  constructor(private readonly triangulation: MeshTriangulationService) {}

  hasPaintableTriangles(mesh: MeshSnapshot): boolean {
    return this.canonicalTriangles(mesh).length > 0;
  }

  hasCompleteUv0(mesh: MeshSnapshot): boolean {
    if (!mesh.attributes.has(UV0_ATTRIBUTE_KEY)) {
      return false;
    }

    const triangles = this.canonicalTriangles(mesh);
    if (triangles.length === 0) {
      return false;
    }

    const corners = new Set<CornerId>();
    for (const triangle of triangles) {
      for (const corner of triangle.corners) {
        corners.add(corner);
      }
    }

    for (const corner of corners) {
      if (!isFiniteVec2(mesh.attributes.get<AttributeValue>(UV0_ATTRIBUTE_KEY, corner))) {
        return false;
      }
    }
    return true;
  }

  isCanonicalHit(mesh: MeshSnapshot, hit: MeshTriangleHit | null): hit is MeshTriangleHit {
    if (hit === null || hit.meshVersion !== mesh.version) {
      return false;
    }

    return this.canonicalTriangles(mesh).some((triangle) => (
      triangle.face === hit.face
      && tupleEquals(triangle.corners, hit.corners)
      && tupleEquals(triangle.vertices, hit.vertices)
    ));
  }

  resolveCornerUvs(mesh: MeshSnapshot, hit: MeshTriangleHit | null): CornerUvTuple | null {
    if (!this.isCanonicalHit(mesh, hit) || !mesh.attributes.has(UV0_ATTRIBUTE_KEY)) {
      return null;
    }

    const first = mesh.attributes.get<AttributeValue>(UV0_ATTRIBUTE_KEY, hit.corners[0]);
    const second = mesh.attributes.get<AttributeValue>(UV0_ATTRIBUTE_KEY, hit.corners[1]);
    const third = mesh.attributes.get<AttributeValue>(UV0_ATTRIBUTE_KEY, hit.corners[2]);
    if (!isFiniteVec2(first) || !isFiniteVec2(second) || !isFiniteVec2(third)) {
      return null;
    }

    return Object.freeze([
      Object.freeze({ x: first.x, y: first.y }),
      Object.freeze({ x: second.x, y: second.y }),
      Object.freeze({ x: third.x, y: third.y }),
    ] as const);
  }

  isCurrentImage(
    active: ImageAssetRef | null,
    current: ImageAssetRef | null,
  ): active is ImageAssetRef {
    return active !== null
      && current !== null
      && isStructurallyValidImage(active)
      && isStructurallyValidImage(current)
      && active.id === current.id
      && active.revision === current.revision
      && active.width === current.width
      && active.height === current.height
      && active.colorSpace === current.colorSpace;
  }

  private canonicalTriangles(mesh: MeshSnapshot): ReadonlyArray<MeshTriangle> {
    return this.triangulation.triangles(mesh).filter(
      (triangle) => hasCanonicalSnapshotMapping(mesh, triangle),
    );
  }
}
