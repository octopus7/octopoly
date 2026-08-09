import type { MeshElementSet, MeshPatch } from "@octopoly/contracts";
import { cloneMeshState, type MeshState } from "../internal";

export interface MeshPatchHost {
  transitionPatch(expectedStamp: number, target: MeshState): void;
  assertActive(): void;
}
export class KernelMeshPatch implements MeshPatch {
  readonly #before: MeshState;
  readonly #after: MeshState;
  #disposed = false;

  public constructor(
    private readonly host: MeshPatchHost,
    public readonly id: string,
    public readonly label: string,
    before: MeshState,
    after: MeshState,
    public readonly affected: MeshElementSet,
  ) {
    this.#before = cloneMeshState(before);
    this.#after = cloneMeshState(after);
    this.beforeVersion = before.version;
    this.afterVersion = after.version;
    Object.freeze(this.affected);
  }

  public readonly beforeVersion: number;
  public readonly afterVersion: number;

  public apply(): void {
    this.#assertUsable();
    this.host.transitionPatch(this.#before.stamp, this.#after);
  }

  public revert(): void {
    this.#assertUsable();
    this.host.transitionPatch(this.#after.stamp, this.#before);
  }

  public dispose(): void {
    this.#disposed = true;
  }

  #assertUsable(): void {
    this.host.assertActive();
    if (this.#disposed) {
      throw new Error(`mesh patch ${this.id} is disposed`);
    }
  }
}
