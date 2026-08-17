import { createFacialController } from "./controller";
import { mountVertexGizmo, type GizmoAxisDirections, type GizmoDragPlane, type GizmoPosition, type VertexGizmo } from "./gizmo";
import { mountMovementControls, type MovementControls } from "./movement-controls";
import { mountFacialPanel, type FacialPanel, type FacialPresetId } from "./panel";
import { attachVertexPicker } from "./picker";
import { createFacialScene, type FacialViewportScene } from "./scene";
import { createFacialSession, type FacialSession } from "./session";
import type { MeshGeometry } from "./workspace";

interface RuntimeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface FacialViewportPort {
  setScene(scene: FacialViewportScene): void;
  setTexture?(textureKey: string, source: TexImageSource): void;
  deleteTexture?(textureKey: string): void;
  projectVertex(vertexIndex: number): ScreenPoint | null;
  projectAxis?(vertexIndex: number, axis: "x" | "y" | "z"): ScreenPoint | null;
  pickVertex(x: number, y: number, radius?: number): number | null;
  focusVertex?(vertexIndex: number): void;
  modelDeltaForPlaneDrag?(
    vertexIndex: number,
    plane: GizmoDragPlane,
    from: GizmoPosition,
    to: GizmoPosition,
  ): readonly [number, number, number] | null;
  subscribeViewChange?(listener: () => void): () => void;
  dispose(): void;
}

export interface FacialRuntimeOptions {
  readonly canvas: HTMLCanvasElement;
  readonly panelContainer: HTMLElement;
  readonly overlayContainer: HTMLElement;
  readonly storage: RuntimeStorage;
  readonly nextCopyId: () => string;
  readonly parseObjText: (source: string) => MeshGeometry;
  readonly loadPresetText?: (preset: FacialPresetId) => Promise<string>;
  readonly decodeTextureImage?: (file: File) => Promise<ImageBitmap>;
  readonly startViewport: (
    canvas: HTMLCanvasElement,
    initialScene: FacialViewportScene,
  ) => FacialViewportPort;
  readonly onError?: (error: unknown) => void;
}

export interface FacialRuntime {
  dispose(): void;
}

function geometryRadius(positions: readonly number[]): number {
  const minimum = [positions[0]!, positions[1]!, positions[2]!];
  const maximum = [...minimum];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[offset + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, positions[offset + axis]!);
    }
  }
  const center = minimum.map((value, axis) => (value + maximum[axis]!) / 2);
  let radius = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    radius = Math.max(radius, Math.hypot(
      positions[offset]! - center[0]!,
      positions[offset + 1]! - center[1]!,
      positions[offset + 2]! - center[2]!,
    ));
  }
  return radius;
}

export function startFacialRuntime(options: FacialRuntimeOptions): FacialRuntime {
  let viewport: FacialViewportPort | undefined;
  let panel: FacialPanel | undefined;
  let gizmo: VertexGizmo | undefined;
  let movementControls: MovementControls | undefined;
  let session: FacialSession | undefined;
  let detachPicker: (() => void) | undefined;
  let detachKeyboard: (() => void) | undefined;
  let detachViewChange: (() => void) | undefined;
  let disposed = false;
  let textureRequestEpoch = 0;
  let movementUnitsPerPixel = 1 / 300;
  let knownActiveMeshId: string | null = null;
  let knownMeshTopology = new Map<string, {
    readonly indices: readonly number[];
    readonly uvs: readonly number[] | undefined;
  }>();

  const updateGizmo = (): void => {
    const selectedVertex = controller.selectedVertex;
    if (selectedVertex === null) {
      gizmo?.show(null);
      return;
    }
    const activeMesh = controller.workspace.meshes.find(
      (mesh) => mesh.id === controller.workspace.activeMeshId,
    );
    if (activeMesh) {
      const radius = geometryRadius(activeMesh.geometry.positions);
      const modelScale = radius > 0 ? radius : 1;
      movementUnitsPerPixel = modelScale / 300;
      gizmo?.setMovementScale(movementUnitsPerPixel, modelScale / 30);
    }
    const directions = viewport?.projectAxis
      ? Object.fromEntries((["x", "y", "z"] as const).map((axis) => [
          axis,
          viewport!.projectAxis!(selectedVertex, axis) ?? { x: 0, y: 0 },
        ])) as unknown as GizmoAxisDirections
      : undefined;
    gizmo?.show(viewport?.projectVertex(selectedVertex) ?? null, directions);
  };

  const controller = createFacialController({
    storage: options.storage,
    nextCopyId: options.nextCopyId,
    onChange: (workspace, selectedVertex) => {
      if (knownActiveMeshId !== null && workspace.activeMeshId !== knownActiveMeshId) {
        textureRequestEpoch += 1;
      }
      knownActiveMeshId = workspace.activeMeshId;
      const nextTopology = new Map(workspace.meshes.map((mesh) => [mesh.id, {
        indices: mesh.geometry.indices,
        uvs: mesh.geometry.uvs,
      }]));
      let topologyChanged = false;
      for (const [meshId, topology] of knownMeshTopology) {
        const next = nextTopology.get(meshId);
        if (!next || next.indices !== topology.indices || next.uvs !== topology.uvs) {
          topologyChanged = true;
          viewport?.deleteTexture?.(meshId);
        }
      }
      if (topologyChanged) textureRequestEpoch += 1;
      knownMeshTopology = nextTopology;
      const scene = createFacialScene(workspace, selectedVertex, controller.sceneRevision);
      viewport?.setScene(scene);
      panel?.render(workspace, selectedVertex);
      updateGizmo();
    },
  });
  knownActiveMeshId = controller.workspace.activeMeshId;
  knownMeshTopology = new Map(controller.workspace.meshes.map((mesh) => [mesh.id, {
    indices: mesh.geometry.indices,
    uvs: mesh.geometry.uvs,
  }]));

  const disposeSafely = (dispose: (() => void) | undefined): void => {
    try {
      dispose?.();
    } catch {
      // Continue releasing the remaining independently-owned resources.
    }
  };
  const cleanup = (): void => {
    disposeSafely(detachViewChange);
    disposeSafely(detachKeyboard);
    disposeSafely(detachPicker);
    disposeSafely(movementControls ? () => movementControls?.dispose() : undefined);
    disposeSafely(gizmo ? () => gizmo?.dispose() : undefined);
    disposeSafely(panel ? () => panel?.dispose() : undefined);
    disposeSafely(session ? () => session?.dispose() : undefined);
    disposeSafely(() => controller.dispose());
    disposeSafely(viewport ? () => viewport?.dispose() : undefined);
  };
  const runCommand = (command: () => void): boolean => {
    try {
      command();
      return true;
    } catch (error) {
      options.onError?.(error);
      return false;
    }
  };

  try {
    viewport = options.startViewport(
      options.canvas,
      createFacialScene(controller.workspace, controller.selectedVertex, controller.sceneRevision),
    );
    session = createFacialSession({
      controller,
      parseObjText: options.parseObjText,
    });
    panel = mountFacialPanel(options.panelContainer, {
      onImport: (file) => {
        void session?.importObj(file).catch((error: unknown) => options.onError?.(error));
      },
      onLoadPreset: (preset) => {
        const loadPresetText = options.loadPresetText;
        if (!loadPresetText) {
          options.onError?.(new Error("프리셋 로더를 사용할 수 없습니다."));
          return;
        }
        void session?.importObj({
          text: () => loadPresetText(preset),
        }).catch((error: unknown) => options.onError?.(error));
      },
      onLoadTexture: (file) => {
        const requestEpoch = ++textureRequestEpoch;
        const activeMesh = controller.workspace.meshes.find(
          (mesh) => mesh.id === controller.workspace.activeMeshId,
        )!;
        if (file.type !== "image/png" && file.type !== "image/jpeg") {
          options.onError?.(new Error("PNG 또는 JPEG 텍스처만 불러올 수 있습니다."));
          return;
        }
        if (!activeMesh.geometry.uvs) {
          options.onError?.(new Error("현재 작업 모델에는 사용할 수 있는 UV 좌표가 없습니다."));
          return;
        }
        const decodeTextureImage = options.decodeTextureImage;
        if (!decodeTextureImage || !viewport?.setTexture) {
          options.onError?.(new Error("텍스처 이미지 로더를 사용할 수 없습니다."));
          return;
        }
        const meshId = activeMesh.id;
        const indices = activeMesh.geometry.indices;
        const uvs = activeMesh.geometry.uvs;
        let decoded: Promise<ImageBitmap>;
        try {
          decoded = decodeTextureImage(file);
        } catch (error) {
          if (!disposed && requestEpoch === textureRequestEpoch) options.onError?.(error);
          return;
        }
        void decoded.then((bitmap) => {
          try {
            const currentMesh = controller.workspace.meshes.find((mesh) => mesh.id === meshId);
            if (disposed
              || requestEpoch !== textureRequestEpoch
              || controller.workspace.activeMeshId !== meshId
              || currentMesh?.geometry.indices !== indices
              || currentMesh.geometry.uvs !== uvs) return;
            viewport?.setTexture?.(meshId, bitmap);
          } catch (error) {
            if (!disposed && requestEpoch === textureRequestEpoch) options.onError?.(error);
          } finally {
            bitmap.close();
          }
        }, (error: unknown) => {
          if (!disposed
            && requestEpoch === textureRequestEpoch
            && controller.workspace.activeMeshId === meshId) options.onError?.(error);
        });
      },
      onDuplicate: () => runCommand(() => session?.duplicateBase()),
      onSelectMesh: (meshId) => runCommand(() => session?.selectMesh(meshId)),
      onRenameMesh: (meshId, name) => runCommand(() => session?.renameMesh(meshId, name)),
      onDeleteMesh: (meshId) => runCommand(() => session?.deleteMesh(meshId)),
      onFocusSelected: () => {
        const selectedVertex = controller.selectedVertex;
        if (selectedVertex !== null) viewport?.focusVertex?.(selectedVertex);
      },
    });
    gizmo = mountVertexGizmo(options.overlayContainer, {
      onMove: (axis, delta) => {
        if (controller.selectedVertex === null) return;
        runCommand(() => session?.moveVertex(
            controller.workspace.activeMeshId,
            controller.sceneRevision,
            controller.selectedVertex!,
            axis,
            delta,
          ));
      },
      onPlaneMove: (plane, from, to, screenSpace = false) => {
        const selectedVertex = controller.selectedVertex;
        if (selectedVertex === null) return;
        const horizontal = (to.x - from.x) * movementUnitsPerPixel;
        const vertical = (from.y - to.y) * movementUnitsPerPixel;
        const delta = screenSpace && plane !== "view"
          ? plane === "xy" ? [horizontal, vertical, 0] as const
          : plane === "yz" ? [0, vertical, horizontal] as const
          : [horizontal, 0, vertical] as const
          : viewport?.modelDeltaForPlaneDrag?.(selectedVertex, plane, from, to);
        if (!delta) return;
        const meshId = controller.workspace.activeMeshId;
        const sceneRevision = controller.sceneRevision;
        runCommand(() => session?.moveVertexByDelta(
            meshId,
            sceneRevision,
            selectedVertex,
            delta,
          ));
      },
    });
    movementControls = mountMovementControls(panel.element, options.overlayContainer, {
      onChange: (state) => {
        const plane: GizmoDragPlane | null = state.mode === "gizmo"
          ? null
          : state.mode === "view-plane" ? "view" : state.activeConstrainedPlane;
        gizmo?.setConstrainedPlaneScreenSpace(state.constrainedPlaneScreenSpace);
        gizmo?.setDragPlane(plane);
      },
    });
    detachViewChange = viewport.subscribeViewChange?.(updateGizmo);
    detachPicker = attachVertexPicker(options.canvas, ({ x, y }, gesture) => {
      if (!gesture) return;
      runCommand(() => session?.selectVertex(
          gesture.meshId,
          gesture.sceneRevision,
          viewport?.pickVertex(x, y, 12) ?? null,
        ));
    }, () => ({
      meshId: controller.workspace.activeMeshId,
      sceneRevision: controller.sceneRevision,
    }));
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "f" && controller.selectedVertex !== null) {
        event.preventDefault();
        event.stopPropagation();
        viewport?.focusVertex?.(controller.selectedVertex);
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (direction === 0) return;
      const activeMesh = controller.workspace.meshes.find(
        (mesh) => mesh.id === controller.workspace.activeMeshId,
      );
      const vertexCount = (activeMesh?.geometry.positions.length ?? 0) / 3;
      if (vertexCount <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = controller.selectedVertex;
      const next = current === null
        ? direction > 0 ? 0 : vertexCount - 1
        : (current + direction + vertexCount) % vertexCount;
      runCommand(() => session?.selectVertex(
          controller.workspace.activeMeshId,
          controller.sceneRevision,
          next,
        ));
    };
    options.canvas.addEventListener("keydown", onKeyDown);
    detachKeyboard = () => options.canvas.removeEventListener("keydown", onKeyDown);
    panel.render(controller.workspace, controller.selectedVertex);
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cleanup();
    },
  };
}
