import type { CornerId, FaceId, MeshSnapshot, Vec2 } from "@octopoly/contracts";

import { UV0_ATTRIBUTE } from "./attributes";

export type UvFaceUvStatus = "complete" | "missing" | "partial" | "non-finite";

export interface UvFaceValidation {
  readonly face: FaceId;
  readonly status: UvFaceUvStatus;
  readonly missingCorners: ReadonlyArray<CornerId>;
  readonly nonFiniteCorners: ReadonlyArray<CornerId>;
}

export interface UvAttributeValidation {
  readonly valid: boolean;
  readonly attributePresent: boolean;
  readonly faces: ReadonlyArray<UvFaceValidation>;
}

function isFiniteVec2(value: unknown): value is Vec2 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<Vec2> & { readonly z?: unknown; readonly w?: unknown };
  return Number.isFinite(candidate.x)
    && Number.isFinite(candidate.y)
    && !("z" in candidate)
    && !("w" in candidate);
}

export function validateUvAttribute(mesh: MeshSnapshot): UvAttributeValidation {
  let hasAnyValue = false;
  let valid = true;

  const faces = [...mesh.faces]
    .sort((left, right) => left.id - right.id)
    .map((face): UvFaceValidation => {
      const missingCorners: CornerId[] = [];
      const nonFiniteCorners: CornerId[] = [];

      for (const corner of face.corners) {
        const value = mesh.attributes.get(UV0_ATTRIBUTE, corner) as unknown;
        if (value === undefined) {
          missingCorners.push(corner);
        } else {
          hasAnyValue = true;
          if (!isFiniteVec2(value)) {
            nonFiniteCorners.push(corner);
          }
        }
      }

      let status: UvFaceUvStatus;
      if (nonFiniteCorners.length > 0) {
        status = "non-finite";
        valid = false;
      } else if (missingCorners.length === face.corners.length) {
        status = "missing";
      } else if (missingCorners.length > 0) {
        status = "partial";
        valid = false;
      } else {
        status = "complete";
      }

      return Object.freeze({
        face: face.id,
        status,
        missingCorners: Object.freeze(missingCorners),
        nonFiniteCorners: Object.freeze(nonFiniteCorners),
      });
    });

  return Object.freeze({
    valid,
    attributePresent: mesh.attributes.has(UV0_ATTRIBUTE) || hasAnyValue,
    faces: Object.freeze(faces),
  });
}
