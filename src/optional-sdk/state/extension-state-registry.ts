import type {
  ExtensionStateBundle,
  ExtensionStateContribution,
  ExtensionStateProvider,
  ExtensionStateRegistry,
  ImageAssetRef,
  JsonValue,
} from "@octopoly/contracts";

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneJson(item)));
  }

  if (value !== null && typeof value === "object") {
    const clone: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      clone[key] = cloneJson(item);
    }
    return Object.freeze(clone);
  }

  return value;
}

function cloneImageRef(ref: ImageAssetRef): ImageAssetRef {
  return Object.freeze({
    id: ref.id,
    revision: ref.revision,
    width: ref.width,
    height: ref.height,
    colorSpace: ref.colorSpace,
  });
}

function cloneContribution(value: ExtensionStateContribution): ExtensionStateContribution {
  const imageAssets = value.imageAssets?.map(cloneImageRef);
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    data: cloneJson(value.data),
    ...(imageAssets === undefined ? {} : { imageAssets: Object.freeze(imageAssets) }),
  });
}

function sameImageRef(first: ImageAssetRef, second: ImageAssetRef): boolean {
  return first.id === second.id
    && first.revision === second.revision
    && first.width === second.width
    && first.height === second.height
    && first.colorSpace === second.colorSpace;
}

function collectImageAssets(
  values: Readonly<Record<string, ExtensionStateContribution>>,
): ReadonlyArray<ImageAssetRef> {
  const byRevision = new Map<string, ImageAssetRef>();

  for (const contribution of Object.values(values)) {
    for (const image of contribution.imageAssets ?? []) {
      const key = `${image.id}\u0000${image.revision}`;
      const existing = byRevision.get(key);
      if (existing !== undefined && !sameImageRef(existing, image)) {
        throw new Error(
          `Conflicting metadata for image asset "${image.id}" revision ${image.revision}`,
        );
      }
      if (existing === undefined) {
        byRevision.set(key, cloneImageRef(image));
      }
    }
  }

  return Object.freeze([...byRevision.values()]);
}

export class ExtensionStateRegistryImpl implements ExtensionStateRegistry {
  readonly #providers = new Map<string, ExtensionStateProvider>();
  readonly #disposedProviders = new Set<ExtensionStateProvider>();
  #unknown = new Map<string, ExtensionStateContribution>();
  #disposed = false;
  #loading = false;

  register(provider: ExtensionStateProvider): void {
    this.#assertMutable();
    this.#assertIdentifier(provider.id);
    if (this.#providers.has(provider.id)) {
      throw new Error(`Extension state provider "${provider.id}" is already registered`);
    }

    this.#providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.#assertMutable();
    const provider = this.#providers.get(id);
    if (provider === undefined) {
      return;
    }

    this.#providers.delete(id);
    try {
      const contribution = provider.save();
      if (contribution !== undefined) {
        this.#unknown.set(id, cloneContribution(contribution));
      } else {
        this.#unknown.delete(id);
      }
    } finally {
      this.#disposeProvider(provider);
    }
  }

  async load(values: Readonly<Record<string, ExtensionStateContribution>>): Promise<void> {
    this.#assertUsable();
    if (this.#loading) {
      throw new Error("Extension state load is already in progress");
    }

    this.#loading = true;
    const snapshot = new Map<string, ExtensionStateContribution>();
    for (const [id, contribution] of Object.entries(values)) {
      this.#assertIdentifier(id);
      snapshot.set(id, cloneContribution(contribution));
    }

    try {
      for (const [id, provider] of this.#providers) {
        await provider.load(snapshot.get(id));
      }

      this.#assertUsable();
      const unknown = new Map<string, ExtensionStateContribution>();
      for (const [id, contribution] of snapshot) {
        if (!this.#providers.has(id)) {
          unknown.set(id, contribution);
        }
      }
      this.#unknown = unknown;
    } finally {
      this.#loading = false;
    }
  }

  save(): ExtensionStateBundle {
    this.#assertUsable();
    if (this.#loading) {
      throw new Error("Cannot save extension state while a load is in progress");
    }

    const values: Record<string, ExtensionStateContribution> = {};
    for (const [id, contribution] of this.#unknown) {
      values[id] = cloneContribution(contribution);
    }

    for (const [id, provider] of this.#providers) {
      const contribution = provider.save();
      if (contribution === undefined) {
        delete values[id];
      } else {
        values[id] = cloneContribution(contribution);
      }
    }

    const frozenValues = Object.freeze(values);
    return Object.freeze({
      values: frozenValues,
      imageAssets: collectImageAssets(frozenValues),
    });
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    const providers = [...this.#providers.values()];
    this.#providers.clear();
    this.#unknown.clear();
    for (const provider of providers.reverse()) {
      this.#disposeProvider(provider);
    }
  }

  #disposeProvider(provider: ExtensionStateProvider): void {
    if (this.#disposedProviders.has(provider)) {
      return;
    }

    this.#disposedProviders.add(provider);
    provider.dispose();
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("Extension state registry is disposed");
    }
  }

  #assertMutable(): void {
    this.#assertUsable();
    if (this.#loading) {
      throw new Error("Cannot change extension state providers while a load is in progress");
    }
  }

  #assertIdentifier(id: string): void {
    if (id.trim().length === 0) {
      throw new Error("Extension state id must not be empty");
    }
  }
}

export function createExtensionStateRegistry(): ExtensionStateRegistry {
  return new ExtensionStateRegistryImpl();
}
