import type { AssetId, Disposable, Unsubscribe } from "./fundamental";
import type { Mat4 } from "./math";
import type {
  ReversibleChange,
  SerializedMesh,
  TriangleMeshSnapshot,
} from "./mesh";

export interface ImageAssetRef {
  readonly id: AssetId;
  readonly revision: number;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb" | "linear";
}

export interface ImageAssetResolver {
  resolve(ref: ImageAssetRef): Promise<ImageBitmap>;
  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe;
}

export interface ImageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageTileUpdate extends ImageRect {
  readonly rgba8Premultiplied: Uint8ClampedArray;
}

export type ImageAssetEvent =
  | { readonly kind: "updated"; readonly ref: ImageAssetRef; readonly dirty: ReadonlyArray<ImageRect> }
  | { readonly kind: "removed"; readonly id: AssetId };

export interface ImageRevisionChange extends ReversibleChange {
  readonly assetId: AssetId;
  readonly before: ImageAssetRef;
  readonly after: ImageAssetRef;
}

export interface ImageMutationResult {
  readonly change: ImageRevisionChange;
  readonly ref: ImageAssetRef;
}

export interface ImageEditSession extends Disposable {
  readonly base: ImageAssetRef;
  current(): ImageAssetRef;
  write(update: ImageTileUpdate): ImageAssetRef;
  commit(label: string): ImageMutationResult;
  cancel(): void;
}

export interface ImageAssetService extends ImageAssetResolver, Disposable {
  import(source: Blob): Promise<ImageAssetRef>;
  current(id: AssetId): ImageAssetRef | null;
  prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession>;
  remove(id: AssetId): Promise<void>;
  flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void>;
}

export interface ReferenceAssetRef {
  readonly id: AssetId;
  readonly worldTransform: Mat4;
}

export interface ReferenceAssetService extends Disposable {
  create(geometry: TriangleMeshSnapshot, worldTransform: Mat4): Promise<ReferenceAssetRef>;
  resolve(ref: ReferenceAssetRef): Promise<TriangleMeshSnapshot>;
  remove(id: AssetId): Promise<void>;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

export interface ExtensionStateContribution {
  readonly schemaVersion: number;
  readonly data: JsonValue;
  readonly imageAssets?: ReadonlyArray<ImageAssetRef>;
}

export interface ProjectDocument {
  readonly schemaVersion: number;
  readonly mesh: SerializedMesh;
  readonly referenceAssets: ReadonlyArray<ReferenceAssetRef>;
  readonly imageAssets: ReadonlyArray<ImageAssetRef>;
  readonly extensionData?: Readonly<Record<string, ExtensionStateContribution>>;
}
