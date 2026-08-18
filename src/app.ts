import { mountShell } from "./shell";
import {
  startFacialRuntime,
  type FacialRuntime,
  type FacialRuntimeOptions,
  type FacialViewportPort,
} from "./facial/runtime";
import { FACIAL_WORKSPACE_STORAGE_KEY } from "./facial/storage";
import type { MeshGeometry } from "./facial/workspace";

interface AppStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface OctoPolyAppDependencies {
  readonly storage: AppStorage;
  readonly nextCopyId: () => string;
  readonly parseObjText: (source: string) => MeshGeometry;
  readonly loadPresetText: NonNullable<FacialRuntimeOptions["loadPresetText"]>;
  readonly decodeTextureImage?: NonNullable<FacialRuntimeOptions["decodeTextureImage"]>;
  readonly downloadProject?: NonNullable<FacialRuntimeOptions["downloadProject"]>;
  readonly startCube: (canvas: HTMLCanvasElement) => () => void;
  readonly startFacial?: (options: FacialRuntimeOptions) => FacialRuntime;
  readonly startViewport: (
    canvas: HTMLCanvasElement,
    initialScene: Parameters<FacialRuntimeOptions["startViewport"]>[1],
  ) => FacialViewportPort;
}

export interface OctoPolyApp {
  dispose(): void;
}

export function mountOctoPolyApp(
  root: HTMLElement,
  dependencies: OctoPolyAppDependencies,
): OctoPolyApp {
  const shell = mountShell(root);
  const { canvas, status, panelContainer, overlayContainer } = shell;
  const document = root.ownerDocument;
  let disposed = false;
  let activeDispose: (() => void) | undefined;
  const setStatus = (message: string, state: "ready" | "error"): void => {
    status.textContent = message;
    status.classList.toggle("status--ready", state === "ready");
    status.classList.toggle("status--error", state === "error");
  };
  const reportError = (error: unknown): void => {
    setStatus(error instanceof Error ? error.message : "페이셜 모드를 시작하지 못했습니다.", "error");
  };
  const startFacialMode = (): (() => void) => {
    const runtime = (dependencies.startFacial ?? startFacialRuntime)({
      canvas,
      panelContainer,
      overlayContainer,
      storage: dependencies.storage,
      nextCopyId: dependencies.nextCopyId,
      parseObjText: dependencies.parseObjText,
      loadPresetText: dependencies.loadPresetText,
      ...(dependencies.decodeTextureImage
        ? { decodeTextureImage: dependencies.decodeTextureImage }
        : {}),
      ...(dependencies.downloadProject
        ? { downloadProject: dependencies.downloadProject }
        : {}),
      onNewProject: resetToNewProject,
      startViewport: dependencies.startViewport,
      onError: reportError,
      onStatus: (message) => setStatus(message, "ready"),
    });
    canvas.setAttribute("aria-label", "편집 가능한 페이셜 메시 3D 뷰포트");
    setStatus("페이셜 모드", "ready");
    return () => runtime.dispose();
  };
  const restoreFacialAfterResetFailure = (error: unknown, disposeCube?: () => void): void => {
    const errors = [error];
    if (disposeCube) {
      try { disposeCube(); } catch (cleanupError) { errors.push(cleanupError); }
    }
    try {
      activeDispose = startFacialMode();
    } catch (rollbackError) {
      errors.push(rollbackError);
    }
    reportError(errors.length === 1
      ? error
      : new AggregateError(errors, "새 작업 rollback에 실패했습니다."));
  };
  function resetToNewProject(): void {
    if (disposed || !activeDispose) return;
    const disposeCurrent = activeDispose;
    try {
      disposeCurrent();
    } catch (error) {
      reportError(error);
      return;
    }
    activeDispose = undefined;

    let disposeCube: () => void;
    try {
      disposeCube = dependencies.startCube(canvas);
    } catch (error) {
      restoreFacialAfterResetFailure(error);
      return;
    }
    try {
      if (!dependencies.storage.removeItem) {
        throw new Error("새 작업을 위해 저장된 Facial 작업을 제거할 수 없습니다.");
      }
      dependencies.storage.removeItem(FACIAL_WORKSPACE_STORAGE_KEY);
    } catch (error) {
      restoreFacialAfterResetFailure(error, disposeCube);
      return;
    }

    activeDispose = disposeCube;
    shell.resetMode();
    canvas.setAttribute("aria-label", "기본 큐브가 있는 3D 뷰포트");
    setStatus("새 작업", "ready");
  }

  const onModeChange = (event: Event): void => {
    if (disposed || (event as CustomEvent<{ mode?: string }>).detail?.mode !== "facial") return;
    const disposeCurrent = activeDispose;
    if (disposeCurrent) {
      try {
        disposeCurrent();
      } catch (error) {
        event.preventDefault();
        reportError(error);
        return;
      }
      activeDispose = undefined;
    }
    try {
      activeDispose = startFacialMode();
    } catch (error) {
      event.preventDefault();
      try {
        activeDispose = dependencies.startCube(canvas);
        canvas.setAttribute("aria-label", "기본 큐브가 있는 3D 뷰포트");
      } catch (cubeError) {
        reportError(cubeError);
        return;
      }
      reportError(error);
    }
  };
  document.addEventListener("octopoly:mode-change", onModeChange);
  shell.activateMode("facial");

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("octopoly:mode-change", onModeChange);
      const disposeActive = activeDispose;
      activeDispose = undefined;
      try {
        disposeActive?.();
      } finally {
        shell.dispose();
      }
    },
  };
}
