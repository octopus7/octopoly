import type {
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetService,
  ImageEditSession,
  ProjectDocument,
  Unsubscribe,
} from "@octopoly/contracts";

import type { ProjectDocumentRepository } from "../../src/app/composition";
import {
  IndexedDbImageAssetService,
  ProjectRepository,
  type ProjectStorage,
} from "../../src/project";
import { FakeWebGL2 as ReferenceFakeWebGL2 } from "../renderer/reference/fake-webgl2";

export class IntegrationWebGL2 extends ReferenceFakeWebGL2 {
  readonly MAX_TEXTURE_SIZE = 0x0d33;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly DEPTH_BUFFER_BIT = 0x0100;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly LINES = 0x0001;
  readonly LINE_STRIP = 0x0003;
  readonly POINTS = 0x0000;
  readonly LESS = 0x0201;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;

  readonly arrayDraws: Array<readonly [number, number]> = [];
  drawingBufferWidth = 1;
  drawingBufferHeight = 1;

  getParameter(parameter: number): unknown {
    return parameter === this.MAX_TEXTURE_SIZE ? 8192 : null;
  }

  getExtension(name: string): object | null {
    return name === "EXT_color_buffer_float" ? {} : null;
  }

  viewport(_x: number, _y: number, width: number, height: number): void {
    this.drawingBufferWidth = width;
    this.drawingBufferHeight = height;
  }

  clearColor(): void {}
  clearDepth(): void {}
  clear(): void {}
  uniform1f(): void {}
  lineWidth(): void {}
  blendFunc(): void {}
  detachShader(): void {}

  getAttribLocation(_program: WebGLProgram, name: string): number {
    return name === "aPosition" ? 0 : -1;
  }

  drawArrays(mode: number, _first: number, count: number): void {
    this.arrayDraws.push([mode, count]);
  }
}

export class MemoryProjectStorage implements ProjectStorage {
  readonly values = new Map<string, unknown>();
  readonly events: string[] = [];
  #disposed = false;

  async get<T>(store: Parameters<ProjectStorage["get"]>[0], key: string): Promise<T | undefined> {
    this.#assertUsable();
    return structuredClone(this.values.get(`${store}:${key}`)) as T | undefined;
  }

  async transact(mutations: Parameters<ProjectStorage["transact"]>[0]): Promise<void> {
    this.#assertUsable();
    const next = new Map(this.values);
    for (const mutation of mutations) {
      const key = `${mutation.store}:${mutation.key}`;
      if (mutation.kind === "put") {
        next.set(key, structuredClone(mutation.value));
      } else {
        next.delete(key);
      }
    }
    this.values.clear();
    for (const [key, value] of next) {
      this.values.set(key, value);
    }
    this.events.push(`transact:${mutations.map((item) => item.store).join(",")}`);
  }

  dispose(): void {
    this.#disposed = true;
  }

  disposed(): boolean {
    return this.#disposed;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("storage disposed");
    }
  }
}

export class TrackingProjectRepository implements ProjectDocumentRepository {
  readonly inner: ProjectRepository;
  readonly events: string[];
  disposeCount = 0;

  constructor(storage: ProjectStorage, events: string[]) {
    this.inner = new ProjectRepository(storage);
    this.events = events;
  }

  load(id: string, signal?: AbortSignal): Promise<ProjectDocument | null> {
    return signal === undefined ? this.inner.load(id) : this.inner.load(id, signal);
  }

  async save(id: string, document: ProjectDocument, signal?: AbortSignal): Promise<void> {
    this.events.push("project-save");
    if (signal === undefined) {
      await this.inner.save(id, document);
    } else {
      await this.inner.save(id, document, signal);
    }
  }

  dispose(): void {
    this.disposeCount += 1;
    this.inner.dispose();
  }
}

export class TrackingImageAssetService implements ImageAssetService {
  readonly inner: ImageAssetService;
  disposeCount = 0;

  constructor(
    storage: ProjectStorage,
    refs: ReadonlyArray<ImageAssetRef>,
    private readonly events: string[],
  ) {
    this.inner = new IndexedDbImageAssetService(storage, {
      initialRefs: refs,
      createId: () => "integration-image",
      codec: {
        async decode() {
          return {
            width: 1,
            height: 1,
            rgba8Premultiplied: new Uint8ClampedArray([12, 34, 56, 255]),
          };
        },
        async createBitmap(image) {
          return {
            width: image.width,
            height: image.height,
            close() {},
          } as ImageBitmap;
        },
      },
    });
  }

  import(source: Blob): Promise<ImageAssetRef> {
    return this.inner.import(source);
  }

  current(id: string): ImageAssetRef | null {
    return this.inner.current(id);
  }

  prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession> {
    return this.inner.prepareEdit(ref);
  }

  remove(id: string): Promise<void> {
    return this.inner.remove(id);
  }

  async flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void> {
    this.events.push("image-flush");
    if (refs === undefined) {
      await this.inner.flush();
    } else {
      await this.inner.flush(refs);
    }
  }

  resolve(ref: ImageAssetRef): Promise<ImageBitmap> {
    return this.inner.resolve(ref);
  }

  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe {
    return this.inner.subscribe(listener);
  }

  dispose(): void {
    this.disposeCount += 1;
    this.inner.dispose();
  }
}
