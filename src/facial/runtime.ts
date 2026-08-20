import { createFacialController } from "./controller";
import { mountVertexGizmo, type GizmoAxisDirections, type GizmoDragPlane, type GizmoPosition, type VertexGizmo } from "./gizmo";
import { mountMovementControls, type MovementControls } from "./movement-controls";
import { mountProportionalControls, type ProportionalControls } from "./proportional-controls";
import { calculateProportionalWeights, sampleInfluencedVertexIndices } from "./proportional-edit";
import { createVertexMovementModeState } from "./movement-mode";
import { serializeWorkspaceObj } from "./export-obj";
import { mountFacialPanel, type FacialPanel, type FacialPresetId } from "./panel";
import { attachVertexPicker } from "./picker";
import { createFacialScene, type FacialViewportScene } from "./scene";
import { createFacialSession, type FacialSession } from "./session";
import type { MeshGeometry } from "./workspace";
import type { CameraState } from "../viewport/camera";
import {
  decodeOctopolyProject,
  encodeOctopolyProject,
  OCTOPOLY_ARCHIVE_LIMITS,
  OCTOPOLY_DECODED_TEXTURE_LIMITS,
  OCTOPOLY_PROJECT_FILENAME,
  validateOctopolyTextureBytes,
  type OctopolyProjectTexture,
} from "./project-codec";

interface RuntimeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface FacialViewportPort {
  setScene(scene: FacialViewportScene): void;
  cameraState?(): CameraState;
  restoreCameraState?(state: CameraState): void;
  prepareScene?(scene: FacialViewportScene): { commit(): void; dispose(): void; finalize?(): void };
  setTexture?(textureKey: string, source: TexImageSource): void;
  replaceTextures?(entries: readonly {
    readonly textureKey: string;
    readonly source: TexImageSource;
  }[]): void;
  prepareTextures?(entries: readonly {
    readonly textureKey: string;
    readonly source: TexImageSource;
  }[]): { commit(): void; dispose(): void; finalize?(): void };
  deleteTexture?(textureKey: string): void;
  projectVertex(vertexIndex: number): ScreenPoint | null;
  projectRadius?(vertexIndex: number, modelRadius: number): number | null;
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
  readonly downloadProject?: (archive: Uint8Array, filename: string) => void;
  readonly downloadObj?: (source: string, filename: string) => void;
  readonly onNewProject?: () => void;
  readonly startViewport: (
    canvas: HTMLCanvasElement,
    initialScene: FacialViewportScene,
  ) => FacialViewportPort;
  readonly onError?: (error: unknown) => void;
  readonly onStatus?: (message: string) => void;
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
  let proportionalControls: ProportionalControls | undefined;
  let activeProportionalInfluence: {
    readonly meshId: string;
    readonly selectedVertex: number;
    readonly weights: readonly number[];
  } | null = null;
  let movementInteractionOpen = false;
  let activeMovementGesture: {
    readonly meshId: string;
    readonly selectedVertex: number;
    sceneRevision: number;
  } | null = null;
  let session: FacialSession | undefined;
  let detachPicker: (() => void) | undefined;
  let detachKeyboard: (() => void) | undefined;
  let detachViewChange: (() => void) | undefined;
  let disposed = false;
  let textureRequestEpoch = 0;
  let projectRequestEpoch = 0;
  let restoringProjectMovement = false;
  let publishingProject = false;
  let movementUnitsPerPixel = 1 / 300;
  let textureAssets = new Map<string, OctopolyProjectTexture>();
  let texturePixels = new Map<string, number>();
  let knownActiveMeshId: string | null = null;
  let knownMeshTopology = new Map<string, {
    readonly indices: readonly number[];
    readonly uvs: readonly number[] | undefined;
  }>();

  const updateProportionalInfluence = (
    workspace = controller.workspace,
    selectedVertex = controller.selectedVertex,
  ): void => {
    const controls = proportionalControls;
    const activeViewport = viewport;
    const projectRadius = activeViewport?.projectRadius;
    if (!controls || !controls.state.enabled || selectedVertex === null || !activeViewport || !projectRadius) {
      controls?.showInfluence(null);
      return;
    }
    const settings = controls.state;
    const activeMesh = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId);
    if (!activeMesh) {
      controls.showInfluence(null);
      return;
    }
    const modelRadius = geometryRadius(activeMesh.geometry.positions);
    const radius = (modelRadius > 0 ? modelRadius : 1) * settings.radiusRatio;
    const center = activeViewport.projectVertex(selectedVertex);
    const radiusPixels = projectRadius.call(activeViewport, selectedVertex, radius);
    if (!center || !radiusPixels) {
      controls.showInfluence(null);
      return;
    }
    const weights = calculateProportionalWeights(
      activeMesh.geometry,
      selectedVertex,
      radius,
      settings.falloff,
      settings.connectedOnly,
    );
    const points = sampleInfluencedVertexIndices(weights, 512).flatMap((vertexIndex) => {
      const projected = activeViewport.projectVertex(vertexIndex);
      return projected ? [{ ...projected, weight: weights[vertexIndex]! }] : [];
    });
    controls.showInfluence({ center, radiusPixels, points });
  };

  const updateGizmo = (
    workspace = controller.workspace,
    selectedVertex = controller.selectedVertex,
  ): void => {
    if (selectedVertex === null) {
      gizmo?.show(null);
      updateProportionalInfluence(workspace, selectedVertex);
      return;
    }
    const activeMesh = workspace.meshes.find(
      (mesh) => mesh.id === workspace.activeMeshId,
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
    updateProportionalInfluence(workspace, selectedVertex);
  };

  const controller = createFacialController({
    storage: options.storage,
    nextCopyId: options.nextCopyId,
    onChange: (workspace, selectedVertex, sceneRevision = controller.sceneRevision) => {
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
          if (!publishingProject) {
            textureAssets.delete(meshId);
            texturePixels.delete(meshId);
            viewport?.deleteTexture?.(meshId);
          }
        }
      }
      if (topologyChanged) textureRequestEpoch += 1;
      knownMeshTopology = nextTopology;
      const scene = createFacialScene(workspace, selectedVertex, sceneRevision);
      if (!publishingProject) viewport?.setScene(scene);
      panel?.render(workspace, selectedVertex);
      updateGizmo(workspace, selectedVertex);
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
    disposeSafely(proportionalControls ? () => proportionalControls?.dispose() : undefined);
    disposeSafely(movementControls ? () => movementControls?.dispose() : undefined);
    disposeSafely(gizmo ? () => gizmo?.dispose() : undefined);
    disposeSafely(panel ? () => panel?.dispose() : undefined);
    disposeSafely(session ? () => session?.dispose() : undefined);
    disposeSafely(() => controller.dispose());
    disposeSafely(viewport ? () => viewport?.dispose() : undefined);
    textureAssets.clear();
    texturePixels.clear();
  };
  const runCommand = (command: () => void): boolean => {
    projectRequestEpoch += 1;
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
      onNewProject: () => {
        projectRequestEpoch += 1;
        textureRequestEpoch += 1;
        session?.invalidatePendingImport();
        try {
          options.onNewProject?.();
        } catch (error) {
          options.onError?.(error);
        }
      },
      onSaveProject: () => {
        try {
        if (!options.downloadProject) throw new Error("작업 파일 저장 기능을 사용할 수 없습니다.");
        const cameraState = viewport?.cameraState?.();
        if (!cameraState) throw new Error("카메라 상태를 저장할 수 없습니다.");
        const archive = encodeOctopolyProject({
          workspace: controller.workspace,
          selectedVertex: controller.selectedVertex,
          movementState: movementControls?.state ?? createVertexMovementModeState(),
          cameraState,
          textures: [...textureAssets.values()].map((texture) => ({
            ...texture,
            bytes: texture.bytes.slice(),
          })),
        });
        options.downloadProject(archive, OCTOPOLY_PROJECT_FILENAME);
        options.onStatus?.("작업 파일을 저장했습니다.");
        } catch (error) {
          options.onError?.(error);
        }
      },
      onExportAllObj: () => {
        try {
          if (!options.downloadObj) throw new Error("OBJ 내보내기 기능을 사용할 수 없습니다.");
          options.downloadObj(serializeWorkspaceObj(controller.workspace, "all"), "octopoly-all.obj");
          options.onStatus?.("전체 모델을 OBJ로 내보냈습니다.");
        } catch (error) {
          options.onError?.(error);
        }
      },
      onExportActiveObj: () => {
        try {
          if (!options.downloadObj) throw new Error("OBJ 내보내기 기능을 사용할 수 없습니다.");
          options.downloadObj(serializeWorkspaceObj(controller.workspace, "active"), "octopoly-current.obj");
          options.onStatus?.("현재 모델을 OBJ로 내보냈습니다.");
        } catch (error) {
          options.onError?.(error);
        }
      },
      onOpenProject: (file) => {
        const requestEpoch = ++projectRequestEpoch;
        textureRequestEpoch += 1;
        session?.invalidatePendingImport();
        if (!Number.isSafeInteger(file.size)
          || file.size <= 0
          || file.size > OCTOPOLY_ARCHIVE_LIMITS.archiveBytes) {
          options.onError?.(new Error("작업 파일 크기 제한을 벗어났습니다."));
          return;
        }
        const decodeTextureImage = options.decodeTextureImage;
        const prepareTextures = viewport?.prepareTextures;
        if (!decodeTextureImage || !prepareTextures) {
          options.onError?.(new Error("작업 파일 텍스처 로더를 사용할 수 없습니다."));
          return;
        }
        let archiveRead: Promise<ArrayBuffer>;
        try {
          archiveRead = file.arrayBuffer();
        } catch (error) {
          if (!disposed && requestEpoch === projectRequestEpoch) options.onError?.(error);
          return;
        }
        void archiveRead.then(async (archive) => {
          let bitmaps: ImageBitmap[] = [];
          try {
            const project = decodeOctopolyProject(archive);
            let totalPixels = 0;
            for (const texture of project.textures) {
              const imageFile = new File(
                [new Uint8Array(texture.bytes).buffer as ArrayBuffer],
                texture.originalFilename ?? (texture.mimeType === "image/png" ? "texture.png" : "texture.jpg"),
                { type: texture.mimeType },
              );
              const bitmap = await decodeTextureImage(imageFile);
              if (disposed || requestEpoch !== projectRequestEpoch) {
                try { bitmap.close(); } catch { /* best-effort decoded resource cleanup */ }
                return;
              }
              if (!Number.isInteger(bitmap.width) || !Number.isInteger(bitmap.height)
                || bitmap.width <= 0 || bitmap.height <= 0
                || bitmap.width > OCTOPOLY_DECODED_TEXTURE_LIMITS.dimension
                || bitmap.height > OCTOPOLY_DECODED_TEXTURE_LIMITS.dimension) {
                try { bitmap.close(); } catch { /* best-effort decoded resource cleanup */ }
                throw new Error("작업 파일 텍스처 해상도는 4096×4096 이하여야 합니다.");
              }
              const nextTotalPixels = totalPixels + bitmap.width * bitmap.height;
              if (!Number.isSafeInteger(nextTotalPixels)
                || nextTotalPixels > OCTOPOLY_DECODED_TEXTURE_LIMITS.totalPixels) {
                try { bitmap.close(); } catch { /* best-effort decoded resource cleanup */ }
                throw new Error("작업 파일 텍스처의 전체 해상도가 너무 큽니다.");
              }
              totalPixels = nextTotalPixels;
              bitmaps.push(bitmap);
            }
            if (disposed || requestEpoch !== projectRequestEpoch) return;
            const candidateTextureAssets = new Map<string, OctopolyProjectTexture>();
            const candidateTexturePixels = new Map<string, number>();
            for (let index = 0; index < project.textures.length; index += 1) {
              const texture = project.textures[index]!;
              const bitmap = bitmaps[index]!;
              candidateTextureAssets.set(texture.modelId, { ...texture, bytes: texture.bytes.slice() });
              candidateTexturePixels.set(texture.modelId, bitmap.width * bitmap.height);
            }
            if (!viewport?.cameraState || !viewport.restoreCameraState) {
              throw new Error("카메라 상태를 저장하고 복원할 수 없습니다.");
            }
            const previousCameraState = viewport.cameraState();
            const transaction = prepareTextures.call(viewport, project.textures.map((texture, index) => ({
              textureKey: texture.modelId,
              source: bitmaps[index]!,
            })));
            const previousMovementState = movementControls?.state;
            const previousScene = createFacialScene(
              controller.workspace,
              controller.selectedVertex,
              controller.sceneRevision,
            );
            const candidateScene = createFacialScene(
              project.workspace,
              project.selectedVertex,
              controller.sceneRevision + 1,
            );
            let fallbackSceneCommitAttempted = false;
            let cameraRestoreAttempted = false;
            let sceneTransaction: { commit(): void; dispose(): void; finalize?(): void };
            try {
              sceneTransaction = viewport?.prepareScene
                ? viewport.prepareScene(candidateScene)
                : {
                  commit: () => {
                    fallbackSceneCommitAttempted = true;
                    viewport?.setScene(candidateScene);
                  },
                  dispose: () => {
                    if (fallbackSceneCommitAttempted) viewport?.setScene(previousScene);
                  },
                  finalize: () => undefined,
                };
            } catch (error) {
              disposeSafely(() => transaction.dispose());
              throw error;
            }
            try {
              const projectTransaction = controller.prepareProject(project.workspace, project.selectedVertex);
              restoringProjectMovement = true;
              try {
                movementControls?.replaceState(project.movementState);
              } finally {
                restoringProjectMovement = false;
              }
              transaction.commit();
              sceneTransaction.commit();
              cameraRestoreAttempted = true;
              viewport.restoreCameraState(project.cameraState);
              publishingProject = true;
              try {
                projectTransaction.commit();
              } finally {
                publishingProject = false;
              }
              try { sceneTransaction.finalize?.(); } catch { /* no-throw committed resource cleanup */ }
              try { transaction.finalize?.(); } catch { /* no-throw committed resource cleanup */ }
              textureAssets = candidateTextureAssets;
              texturePixels = candidateTexturePixels;
            } catch (error) {
              publishingProject = false;
              disposeSafely(() => sceneTransaction.dispose());
              disposeSafely(() => transaction.dispose());
              if (cameraRestoreAttempted && previousCameraState) {
                try {
                  viewport.restoreCameraState(previousCameraState);
                } catch {
                  // Continue reporting the original publication failure after best-effort rollback.
                }
              }
              if (previousMovementState) {
                restoringProjectMovement = true;
                try {
                  movementControls?.replaceState(previousMovementState);
                } catch {
                  // Continue reporting the original publication failure after best-effort rollback.
                } finally {
                  restoringProjectMovement = false;
                }
              }
              throw error;
            }
            try {
              options.onStatus?.("작업 파일을 불러왔습니다.");
            } catch {
              // Status reporting is not part of project publication and must not roll it back.
            }
          } catch (error) {
            if (!disposed && requestEpoch === projectRequestEpoch) options.onError?.(error);
          } finally {
            for (const bitmap of bitmaps) {
              try { bitmap.close(); } catch { /* best-effort decoded resource cleanup */ }
            }
          }
        }, (error: unknown) => {
          if (!disposed && requestEpoch === projectRequestEpoch) options.onError?.(error);
        });
      },
      onImport: (file) => {
        projectRequestEpoch += 1;
        void session?.importObj(file).catch((error: unknown) => options.onError?.(error));
      },
      onLoadPreset: (preset) => {
        projectRequestEpoch += 1;
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
        projectRequestEpoch += 1;
        const requestEpoch = ++textureRequestEpoch;
        const activeMesh = controller.workspace.meshes.find(
          (mesh) => mesh.id === controller.workspace.activeMeshId,
        )!;
        if (file.type !== "image/png" && file.type !== "image/jpeg") {
          options.onError?.(new Error("PNG 또는 JPEG 텍스처만 불러올 수 있습니다."));
          return;
        }
        if (!Number.isSafeInteger(file.size) || file.size <= 0
          || file.size > OCTOPOLY_ARCHIVE_LIMITS.textureBytes) {
          options.onError?.(new Error("텍스처 파일 크기 제한을 벗어났습니다."));
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
        let bytes: Promise<ArrayBuffer>;
        try {
          bytes = file.arrayBuffer();
        } catch (error) {
          void decoded.then((bitmap) => {
            try { bitmap.close(); } catch { /* best-effort decoded resource cleanup */ }
          }, () => undefined);
          if (!disposed && requestEpoch === textureRequestEpoch) options.onError?.(error);
          return;
        }
        const byteRead = bytes.then(
          (value) => ({ ok: true as const, value }),
          (reason: unknown) => ({ ok: false as const, reason }),
        );
        void decoded.then(async (bitmap) => {
          try {
            const currentMesh = controller.workspace.meshes.find((mesh) => mesh.id === meshId);
            if (disposed
              || requestEpoch !== textureRequestEpoch
              || controller.workspace.activeMeshId !== meshId
              || currentMesh?.geometry.indices !== indices
              || currentMesh.geometry.uvs !== uvs) return;
            const bytesResult = await byteRead;
            if (!bytesResult.ok) throw bytesResult.reason;
            const latestMesh = controller.workspace.meshes.find((mesh) => mesh.id === meshId);
            if (disposed
              || requestEpoch !== textureRequestEpoch
              || controller.workspace.activeMeshId !== meshId
              || latestMesh?.geometry.indices !== indices
              || latestMesh.geometry.uvs !== uvs) return;
            const sourceBytes = new Uint8Array(bytesResult.value).slice();
            const mimeType = file.type as "image/png" | "image/jpeg";
            validateOctopolyTextureBytes(sourceBytes, mimeType);
            if (!Number.isInteger(bitmap.width) || !Number.isInteger(bitmap.height)
              || bitmap.width <= 0 || bitmap.height <= 0
              || bitmap.width > OCTOPOLY_DECODED_TEXTURE_LIMITS.dimension
              || bitmap.height > OCTOPOLY_DECODED_TEXTURE_LIMITS.dimension) {
              throw new Error("텍스처 해상도는 4096×4096 이하여야 합니다.");
            }
            const pixels = bitmap.width * bitmap.height;
            let totalPixels = pixels;
            for (const [textureKey, count] of texturePixels) {
              if (textureKey !== meshId) totalPixels += count;
            }
            if (!Number.isSafeInteger(totalPixels)
              || totalPixels > OCTOPOLY_DECODED_TEXTURE_LIMITS.totalPixels) {
              throw new Error("텍스처의 전체 해상도가 너무 큽니다.");
            }
            const candidateTextureAssets = new Map(textureAssets);
            const candidateTexturePixels = new Map(texturePixels);
            candidateTextureAssets.set(meshId, {
              modelId: meshId,
              mimeType,
              originalFilename: file.name,
              bytes: sourceBytes,
            });
            candidateTexturePixels.set(meshId, pixels);
            viewport?.setTexture?.(meshId, bitmap);
            textureAssets = candidateTextureAssets;
            texturePixels = candidateTexturePixels;
          } catch (error) {
            if (!disposed && requestEpoch === textureRequestEpoch) options.onError?.(error);
          } finally {
            try { bitmap.close(); } catch { /* best-effort decoded resource cleanup */ }
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
        if (selectedVertex !== null) {
          runCommand(() => viewport?.focusVertex?.(selectedVertex));
        }
      },
    });
    const proportionalInfluenceForSelection = (): typeof activeProportionalInfluence => {
      const selectedVertex = controller.selectedVertex;
      const settings = proportionalControls?.state;
      const meshId = controller.workspace.activeMeshId;
      const activeMesh = controller.workspace.meshes.find((mesh) => mesh.id === meshId);
      if (selectedVertex === null || !settings?.enabled || !activeMesh) return null;
      const modelRadius = geometryRadius(activeMesh.geometry.positions);
      const radius = (modelRadius > 0 ? modelRadius : 1) * settings.radiusRatio;
      return {
        meshId,
        selectedVertex,
        weights: calculateProportionalWeights(
          activeMesh.geometry,
          selectedVertex,
          radius,
          settings.falloff,
          settings.connectedOnly,
        ),
      };
    };
    const moveSelectedByDelta = (delta: readonly [number, number, number]): void => {
      const selectedVertex = movementInteractionOpen
        ? activeMovementGesture?.selectedVertex ?? null
        : controller.selectedVertex;
      if (selectedVertex === null) return;
      const meshId = movementInteractionOpen
        ? activeMovementGesture?.meshId
        : controller.workspace.activeMeshId;
      if (!meshId) return;
      const sceneRevision = movementInteractionOpen
        ? activeMovementGesture?.sceneRevision
        : controller.sceneRevision;
      if (sceneRevision === undefined) return;
      const revisionBeforeMove = controller.sceneRevision;
      if (movementInteractionOpen && revisionBeforeMove !== sceneRevision) return;
      const influence = activeProportionalInfluence?.meshId === meshId
        && activeProportionalInfluence.selectedVertex === selectedVertex
        ? activeProportionalInfluence
        : movementInteractionOpen ? null : proportionalInfluenceForSelection();
      if (influence) {
        runCommand(() => session?.moveVerticesByDelta(
          meshId,
          sceneRevision,
          selectedVertex,
          influence.weights,
          delta,
        ));
        if (movementInteractionOpen
          && activeMovementGesture
          && controller.sceneRevision !== revisionBeforeMove) {
          activeMovementGesture.sceneRevision = controller.sceneRevision;
        }
        return;
      }
      runCommand(() => session?.moveVertexByDelta(meshId, sceneRevision, selectedVertex, delta));
      if (movementInteractionOpen
        && activeMovementGesture
        && controller.sceneRevision !== revisionBeforeMove) {
        activeMovementGesture.sceneRevision = controller.sceneRevision;
      }
    };
    gizmo = mountVertexGizmo(options.overlayContainer, {
      onInteractionStart: () => {
        movementInteractionOpen = true;
        const selectedVertex = controller.selectedVertex;
        activeMovementGesture = selectedVertex === null ? null : {
          meshId: controller.workspace.activeMeshId,
          selectedVertex,
          sceneRevision: controller.sceneRevision,
        };
        activeProportionalInfluence = proportionalInfluenceForSelection();
      },
      onInteractionEnd: () => {
        movementInteractionOpen = false;
        activeMovementGesture = null;
        activeProportionalInfluence = null;
      },
      onMove: (axis, delta) => {
        const vector: [number, number, number] = [0, 0, 0];
        vector[axis === "x" ? 0 : axis === "y" ? 1 : 2] = delta;
        moveSelectedByDelta(vector);
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
        moveSelectedByDelta(delta);
      },
    });
    movementControls = mountMovementControls(panel.element, options.overlayContainer, {
      onChange: (state) => {
        if (!restoringProjectMovement) projectRequestEpoch += 1;
        const plane: GizmoDragPlane | null = state.mode === "gizmo"
          ? null
          : state.mode === "view-plane" ? "view" : state.activeConstrainedPlane;
        gizmo?.setConstrainedPlaneScreenSpace(state.constrainedPlaneScreenSpace);
        gizmo?.setDragPlane(plane);
      },
    });
    const toolStrip = panel.element.querySelector<HTMLElement>(".facial-tool-strip");
    if (!toolStrip) throw new Error("페이셜 도구 모음을 찾지 못했습니다.");
    proportionalControls = mountProportionalControls(toolStrip, options.overlayContainer, {
      onChange: () => {
        projectRequestEpoch += 1;
        activeProportionalInfluence = null;
        if (movementInteractionOpen) activeMovementGesture = null;
        updateProportionalInfluence();
      },
    });
    updateProportionalInfluence();
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
        const selectedVertex = controller.selectedVertex;
        runCommand(() => viewport?.focusVertex?.(selectedVertex));
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
