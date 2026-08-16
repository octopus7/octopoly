import { mountShell } from "./shell";
import {
  startFacialRuntime,
  type FacialRuntime,
  type FacialRuntimeOptions,
  type FacialViewportPort,
} from "./facial/runtime";
import type { MeshGeometry } from "./facial/workspace";

interface AppStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OctoPolyAppDependencies {
  readonly storage: AppStorage;
  readonly nextCopyId: () => string;
  readonly parseObjText: (source: string) => MeshGeometry;
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

  try {
    activeDispose = dependencies.startCube(canvas);
    setStatus("기본 큐브", "ready");
  } catch (error) {
    reportError(error);
  }

  const onModeChange = (event: Event): void => {
    if (disposed || (event as CustomEvent<{ mode?: string }>).detail?.mode !== "facial") return;
    try {
      const disposeCurrent = activeDispose;
      activeDispose = undefined;
      disposeCurrent?.();
      const runtime = (dependencies.startFacial ?? startFacialRuntime)({
        canvas,
        panelContainer,
        overlayContainer,
        storage: dependencies.storage,
        nextCopyId: dependencies.nextCopyId,
        parseObjText: dependencies.parseObjText,
        startViewport: dependencies.startViewport,
        onError: reportError,
      });
      activeDispose = () => runtime.dispose();
      canvas.setAttribute("aria-label", "편집 가능한 페이셜 메시 3D 뷰포트");
      setStatus("페이셜 모드", "ready");
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
