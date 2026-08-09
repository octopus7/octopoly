import type {
  AttributeKey,
  AttributeValue,
  CornerId,
  HistoryService,
  MeshCommand,
  MeshMutationResult,
  MeshMutationService,
  MeshQuery,
  Vec2,
} from "@octopoly/contracts";

import { UV0_ATTRIBUTE, UV0_SEAM_ATTRIBUTE } from "../data/attributes";

export type UvMutationOutcome =
  | { readonly status: "applied"; readonly result: MeshMutationResult }
  | { readonly status: "unchanged" }
  | { readonly status: "rejected"; readonly errors: ReadonlyArray<string> }
  | { readonly status: "failed"; readonly error: unknown };

function finiteUv(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function attributeValues<T extends AttributeValue>(
  source: ReadonlyMap<CornerId, T | undefined>,
  clone: (value: T) => T,
): ReadonlyMap<number, AttributeValue | undefined> {
  const values = new Map<number, AttributeValue | undefined>();
  for (const [corner, value] of source) {
    values.set(corner, value === undefined ? undefined : clone(value));
  }
  return values;
}

/**
 * Applies extension-owned UV attributes solely through MeshMutationService and
 * records the already-applied patch as one atomic history entry.
 */
export class UvMutationController {
  constructor(
    private readonly mesh: MeshQuery,
    private readonly mutations: MeshMutationService,
    private readonly history: HistoryService,
    private readonly uvKey: AttributeKey<Vec2> = UV0_ATTRIBUTE,
    private readonly seamKey: AttributeKey<boolean> = UV0_SEAM_ATTRIBUTE,
  ) {}

  apply(
    label: string,
    uvValues: ReadonlyMap<CornerId, Vec2 | undefined>,
    seamValues: ReadonlyMap<CornerId, boolean | undefined> = new Map(),
  ): UvMutationOutcome {
    if (label.trim().length === 0) {
      throw new Error("UV mutation label must not be empty");
    }
    if (uvValues.size === 0 && seamValues.size === 0) {
      return { status: "unchanged" };
    }

    const command = this.command(uvValues, seamValues);
    const errors = [
      ...this.validateUvSemantics(uvValues, seamValues),
      ...this.mutations.validate(command),
    ];
    if (errors.length > 0) {
      return { status: "rejected", errors: Object.freeze([...new Set(errors)]) };
    }

    let transaction;
    try {
      transaction = this.history.begin(label);
    } catch (error) {
      return { status: "failed", error };
    }

    let result: MeshMutationResult | null = null;
    try {
      result = this.mutations.execute(label, command);
      transaction.recordApplied(result.patch);
      transaction.commit();
      return { status: "applied", result };
    } catch (error) {
      let rollbackError: unknown;
      try {
        transaction.rollback();
      } catch (caught) {
        rollbackError = caught;
      }

      // A conforming transaction reverts every recorded patch. This fallback
      // also protects the mesh if recordApplied itself failed before recording.
      if (result !== null && this.mesh.snapshot().version === result.patch.afterVersion) {
        try {
          result.patch.revert();
        } catch (caught) {
          rollbackError = rollbackError === undefined
            ? caught
            : new AggregateError([rollbackError, caught], "UV mutation rollback failed");
        }
      }

      return rollbackError === undefined
        ? { status: "failed", error }
        : { status: "failed", error: new AggregateError([error, rollbackError], "UV mutation failed") };
    }
  }

  private command(
    uvValues: ReadonlyMap<CornerId, Vec2 | undefined>,
    seamValues: ReadonlyMap<CornerId, boolean | undefined>,
  ): MeshCommand {
    const commands: MeshCommand[] = [];
    if (uvValues.size > 0) {
      commands.push({
        kind: "setAttribute",
        key: this.uvKey,
        values: attributeValues(uvValues, (value) => Object.freeze({ x: value.x, y: value.y })),
      });
    }
    if (seamValues.size > 0) {
      commands.push({
        kind: "setAttribute",
        key: this.seamKey,
        values: attributeValues(seamValues, (value) => value),
      });
    }
    if (commands.length === 1) {
      const command = commands[0];
      if (command === undefined) {
        throw new Error("missing UV attribute command");
      }
      return command;
    }
    return { kind: "batch", commands };
  }

  private validateUvSemantics(
    uvValues: ReadonlyMap<CornerId, Vec2 | undefined>,
    seamValues: ReadonlyMap<CornerId, boolean | undefined>,
  ): ReadonlyArray<string> {
    const snapshot = this.mesh.snapshot();
    const corners = new Map(snapshot.corners.map((corner) => [corner.id, corner]));
    const errors: string[] = [];

    for (const [corner, value] of uvValues) {
      if (!corners.has(corner)) {
        errors.push(`UV update targets missing corner ${corner}`);
      } else if (value !== undefined && !finiteUv(value)) {
        errors.push(`UV value for corner ${corner} must be finite`);
      }
    }
    for (const [corner, value] of seamValues) {
      if (!corners.has(corner)) {
        errors.push(`UV seam update targets missing corner ${corner}`);
      } else if (value !== undefined && typeof value !== "boolean") {
        errors.push(`UV seam value for corner ${corner} must be boolean`);
      }
    }

    for (const face of snapshot.faces) {
      if (face.corners.length < 3) {
        errors.push(`face ${face.id} is degenerate`);
        continue;
      }
      let present = 0;
      for (const cornerId of face.corners) {
        const corner = corners.get(cornerId);
        if (corner?.face !== face.id) {
          errors.push(`face ${face.id} references invalid corner ${cornerId}`);
          continue;
        }
        const value = uvValues.has(cornerId)
          ? uvValues.get(cornerId)
          : snapshot.attributes.get(this.uvKey, cornerId);
        if (value !== undefined) {
          present += 1;
          if (!finiteUv(value)) {
            errors.push(`UV value for corner ${cornerId} must be finite`);
          }
        }
      }
      if (present > 0 && present < face.corners.length) {
        errors.push(`face ${face.id} would have partial UV values`);
      }
    }

    return errors;
  }
}
