import type {
  ImageAssetRef,
  ImageAssetService,
  Mat4,
  MeshMutationResult,
  MeshQuery,
  MeshTriangulationService,
  PickingService,
  PointerSample,
  Ray,
  ReferenceAssetService,
  RetopoEngine,
  RetopoStep,
  RetopoStrokeInput,
  RetopoStrokeSession,
  TriangleMeshSnapshot,
} from "@octopoly/contracts";
import { vi } from "vitest";

import {
  CoreWorkspace,
  createCoreRendererBundle,
} from "../../src/app/composition/core-workspace";
import {
  IndexedDbImageAssetService,
  IndexedDbReferenceAssetService,
  ProjectRepository,
} from "../../src/project";
import { FakeImageCodec, MemoryProjectStorage } from "../project/fakes";
import { FakeWebGL2 as ReferenceFakeWebGL2 } from "../renderer/reference/fake-webgl2";

export const IDENTITY: Mat4 = Object.freeze({
  elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
});

export const TRANSLATE_REFERENCE_BACK: Mat4 = Object.freeze({
  elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -2, 1,
  ]),
});

export const REFERENCE_TRIANGLE: TriangleMeshSnapshot = Object.freeze({
  version: 3,
  positions: Object.freeze([
    Object.freeze({ x: -2, y: -2, z: 0 }),
    Object.freeze({ x: 2, y: -2, z: 0 }),
    Object.freeze({ x: 0, y: 2, z: 0 }),
  ]),
  indices: Object.freeze([0, 1, 2]),
});

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

export class DeterministicPicking implements PickingService {
  readonly screenPoints: Array<readonly [number, number]> = [];

  rayFromScreen(point: { readonly x: number; readonly y: number }): Ray {
    this.screenPoints.push([point.x, point.y]);
    return Object.freeze({
      origin: Object.freeze({ x: 0, y: 0, z: 5 }),
      direction: Object.freeze({ x: 0, y: 0, z: -1 }),
    });
  }

  pick(): null {
    return null;
  }
}

export class MultiPatchRetopoEngine implements RetopoEngine {
  readonly sessions: MultiPatchSession[] = [];

  begin(): RetopoStrokeSession {
    const session = new MultiPatchSession();
    this.sessions.push(session);
    return session;
  }
}

class MultiPatchSession implements RetopoStrokeSession {
  readonly surfaceHits: RetopoStrokeInput["surfaceHit"][] = [];
  readonly createdVertices: number[] = [];
  cancelled = false;
  disposed = false;
  #continuation = 0;

  update(input: RetopoStrokeInput, _mesh: MeshQuery): RetopoStep {
    this.surfaceHits.push(input.surfaceHit);
    if (input.surfaceHit === null) {
      return { kind: "rejected", reason: "surface miss" };
    }
    if (input.sample.phase === "up") {
      return {
        kind: "commit",
        label: "first staged vertex",
        command: { kind: "createVertex", position: input.surfaceHit.position },
        preview: preview(input.sample.timestamp),
      };
    }
    return { kind: "preview", preview: preview(input.sample.timestamp) };
  }

  continue(result: MeshMutationResult, _mesh: MeshQuery): RetopoStep {
    this.#continuation += 1;
    this.createdVertices.push(...(result.created.vertices ?? []));
    if (this.#continuation < 3) {
      return {
        kind: "commit",
        label: `staged vertex ${this.#continuation + 1}`,
        command: {
          kind: "createVertex",
          position: this.#continuation === 1
            ? { x: 1, y: 0, z: -2 }
            : { x: 0, y: 1, z: -2 },
        },
      };
    }
    if (this.#continuation === 3) {
      return {
        kind: "commit",
        label: "staged face",
        command: { kind: "createFace", vertices: [...this.createdVertices] },
      };
    }
    return { kind: "complete" };
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export class CancelAfterMutationRetopoEngine implements RetopoEngine {
  session: CancelAfterMutationSession | null = null;

  begin(): RetopoStrokeSession {
    this.session = new CancelAfterMutationSession();
    return this.session;
  }
}

export class CancelAfterMutationSession implements RetopoStrokeSession {
  cancelled = false;
  disposed = false;
  #waiting = false;

  update(input: RetopoStrokeInput, _mesh: MeshQuery): RetopoStep {
    if (input.sample.phase === "down") {
      this.#waiting = true;
      return {
        kind: "commit",
        label: "transient vertex",
        command: { kind: "createVertex", position: { x: 0, y: 0, z: -2 } },
        preview: preview(1),
      };
    }
    return { kind: "preview", preview: preview(2) };
  }

  continue(_result: MeshMutationResult, _mesh: MeshQuery): RetopoStep {
    if (!this.#waiting) throw new Error("unexpected continuation");
    this.#waiting = false;
    return { kind: "preview", preview: preview(2) };
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export interface WorkspaceFixture {
  readonly workspace: CoreWorkspace;
  readonly canvas: HTMLCanvasElement;
  readonly gl: IntegrationWebGL2;
  readonly storage: MemoryProjectStorage;
  readonly referenceAssets: ReferenceAssetService;
  readonly picking: DeterministicPicking;
  readonly flushFrames: () => void;
}

export function createWorkspaceFixture(createRetopo: () => RetopoEngine): WorkspaceFixture {
  const storage = new MemoryProjectStorage();
  let nextReferenceId = 1;
  const referenceAssets = new IndexedDbReferenceAssetService(storage, {
    createId: () => `reference-${nextReferenceId++}`,
  });
  const projects = new ProjectRepository(storage);
  const codec = new FakeImageCodec({
    width: 1,
    height: 1,
    rgba8Premultiplied: new Uint8ClampedArray([255, 255, 255, 255]),
  });
  const createImageAssets = (initialRefs: ReadonlyArray<ImageAssetRef>): ImageAssetService => (
    new IndexedDbImageAssetService(storage, {
      initialRefs,
      codec,
      createId: () => "image-1",
    })
  );
  const gl = new IntegrationWebGL2();
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: () => gl.context,
  });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 320,
      height: 200,
      right: 320,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  const captured = new Set<number>();
  canvas.setPointerCapture = (id) => captured.add(id);
  canvas.releasePointerCapture = (id) => captured.delete(id);
  canvas.hasPointerCapture = (id) => captured.has(id);

  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
    const id = nextFrame++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    callbacks.delete(id);
  });

  const triangulation: MeshTriangulationService = {
    triangles(mesh) {
      const face = mesh.faces[0];
      if (face === undefined || face.corners.length < 3) return [];
      const corners = face.corners.slice(0, 3).map((id) => mesh.corners.find((entry) => entry.id === id));
      if (corners.some((corner) => corner === undefined)) return [];
      const first = corners[0];
      const second = corners[1];
      const third = corners[2];
      if (first === undefined || second === undefined || third === undefined) return [];
      const vertices = [first.vertex, second.vertex, third.vertex] as const;
      const positions = vertices.map((id) => mesh.vertices.find((entry) => entry.id === id)?.position);
      if (positions.some((position) => position === undefined)) return [];
      return [{
        face: face.id,
        corners: [first.id, second.id, third.id],
        vertices,
        positions: positions as unknown as readonly [
          { readonly x: number; readonly y: number; readonly z: number },
          { readonly x: number; readonly y: number; readonly z: number },
          { readonly x: number; readonly y: number; readonly z: number },
        ],
      }];
    },
    raycast: () => null,
  };
  const picking = new DeterministicPicking();
  const workspace = new CoreWorkspace({
    referenceAssets,
    projects,
    createImageAssets,
    triangulation,
    picking,
    createRetopo,
    rendererBundle: createCoreRendererBundle(triangulation),
  });

  return {
    workspace,
    canvas,
    gl,
    storage,
    referenceAssets,
    picking,
    flushFrames() {
      const scheduled = [...callbacks.values()];
      callbacks.clear();
      for (const callback of scheduled) callback(0);
    },
  };
}

export function pen(
  phase: PointerSample["phase"],
  timestamp: number,
  options: { readonly pointerId?: number; readonly coalesced?: boolean } = {},
): PointerSample {
  return Object.freeze({
    pointerId: options.pointerId ?? 9,
    pointerType: "pen",
    phase,
    isPrimary: true,
    x: 160 + timestamp / 100,
    y: 100,
    pressure: phase === "up" || phase === "cancel" ? 0 : 0.6,
    tiltX: 18,
    tiltY: -21,
    buttons: phase === "up" || phase === "cancel" ? 0 : 1,
    modifiers: Object.freeze({ alt: false, ctrl: false, meta: false, shift: false }),
    timestamp,
    coalesced: options.coalesced ?? false,
  });
}

function preview(revision: number) {
  return Object.freeze({
    id: "deterministic-e2e-preview",
    revision,
    primitives: Object.freeze([{
      kind: "points" as const,
      positions: Object.freeze([Object.freeze({ x: 0, y: 0, z: -2 })]),
      color: Object.freeze({ x: 1, y: 0.5, z: 0, w: 1 }),
      sizeCssPx: 4,
    }]),
  });
}
