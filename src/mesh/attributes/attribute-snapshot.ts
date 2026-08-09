import type {
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
} from "@octopoly/contracts";
import { attributeStoreKey, cloneAttributeValue, type MeshState } from "../internal";

function immutableAttributeValue<T extends AttributeValue>(value: T): T {
  const clone = cloneAttributeValue(value);
  if (typeof clone === "object" && clone !== null) {
    Object.freeze(clone);
  }
  return clone;
}
export class ImmutableAttributeSnapshot implements AttributeSnapshot {
  readonly #values: ReadonlyMap<string, ReadonlyMap<number, AttributeValue>>;

  public constructor(state: MeshState) {
    this.#values = new Map(
      [...state.attributes].map(([key, store]) => [
        key,
        new Map(
          [...store.entries].map(([id, value]) => [id, immutableAttributeValue(value)]),
        ),
      ]),
    );
    Object.freeze(this);
  }

  public has<T extends AttributeValue>(key: AttributeKey<T>): boolean {
    return this.#values.has(attributeStoreKey(key.domain, key.name));
  }

  public get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined {
    const value = this.#values.get(attributeStoreKey(key.domain, key.name))?.get(elementId);
    return value === undefined ? undefined : immutableAttributeValue(value as T);
  }
}
