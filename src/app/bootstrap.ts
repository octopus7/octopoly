import {
  probeRuntimeCapabilities,
  type RuntimeCapabilities,
} from "./capabilities";
import type { Disposable, Mat4, RendererInitResult } from "@octopoly/contracts";
import {
  CoreWorkspace,
  createProductionCoreWorkspace,
} from "./composition";

export type CapabilityProbe = () => RuntimeCapabilities | Promise<RuntimeCapabilities>;

interface ShellElements {
  readonly status: HTMLElement;
  readonly detail: HTMLElement;
  readonly optional: HTMLElement;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tag);
  if (className !== undefined) {
    element.className = className;
  }
  return element;
}

function renderShell(root: HTMLElement): ShellElements {
  const documentRef = root.ownerDocument;
  const main = createElement(documentRef, "main", "shell");
  const brand = createElement(documentRef, "section", "brand");
  const eyebrow = createElement(documentRef, "p", "eyebrow");
  const title = createElement(documentRef, "h1");
  const summary = createElement(documentRef, "p", "summary");
  const capability = createElement(documentRef, "section", "capability");
  const capabilityTitle = createElement(documentRef, "h2");
  const status = createElement(documentRef, "p", "status status--checking");
  const detail = createElement(documentRef, "p", "detail");
  const optional = createElement(documentRef, "p", "optional");

  title.id = "octopoly-title";
  capabilityTitle.id = "capability-title";
  main.setAttribute("aria-labelledby", title.id);
  capability.setAttribute("aria-labelledby", capabilityTitle.id);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");

  eyebrow.textContent = "Static bootstrap";
  title.textContent = "OctoPoly";
  summary.textContent = "Feature-free shell for the retopology workspace.";
  capabilityTitle.textContent = "Core capability";
  status.textContent = "Checking WebGL2…";
  detail.textContent = "The interface remains available while the required GPU capability is checked.";
  optional.textContent = "WebGPU is optional and is not used by this bootstrap.";

  brand.append(eyebrow, title, summary);
  capability.append(capabilityTitle, status, detail, optional);
  main.append(brand, capability);
  root.replaceChildren(main);
  root.dataset.capability = "checking";

  return { status, detail, optional };
}

function renderCapability(root: HTMLElement, elements: ShellElements, result: RuntimeCapabilities): void {
  const capability = result.webgl2;
  root.dataset.capability = capability.status;
  elements.status.className = `status status--${capability.status}`;
  elements.optional.textContent = `WebGPU optional: ${result.webgpuOptional}.`;

  if (capability.status === "ready") {
    elements.status.textContent = "WebGL2 ready";
    elements.detail.textContent = `Required GPU baseline available · max texture ${capability.maxTextureSize}px.`;
    return;
  }

  if (capability.status === "unsupported") {
    elements.status.textContent = "WebGL2 unsupported";
    elements.detail.textContent = capability.reason;
    return;
  }

  elements.status.textContent = "Capability check failed";
  elements.detail.textContent = capability.reason;
}

function failedCapability(error: unknown): RuntimeCapabilities {
  const reason = error instanceof Error && error.message.trim() ? error.message : "Capability check failed.";
  return {
    webgl2: { status: "failed", reason },
    webgpuOptional: "unavailable",
  };
}

export async function mountBootstrap(
  root: HTMLElement,
  probe: CapabilityProbe = probeRuntimeCapabilities,
): Promise<RuntimeCapabilities> {
  const elements = renderShell(root);
  let result: RuntimeCapabilities;

  try {
    result = await probe();
  } catch (error: unknown) {
    result = failedCapability(error);
  }

  renderCapability(root, elements, result);
  return result;
}

export function renderEmergencyShell(root: HTMLElement, error: unknown): void {
  const elements = renderShell(root);
  renderCapability(root, elements, failedCapability(error));
}

export interface CoreWorkspaceMountOptions {
  readonly createWorkspace?: () => CoreWorkspace;
}

export interface MountedCoreWorkspace extends Disposable {
  readonly workspace: CoreWorkspace;
  readonly renderer: RendererInitResult;
}

const IDENTITY_MATRIX: Mat4 = Object.freeze({
  elements: Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
});

interface WorkspaceElements {
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly activeTool: HTMLElement;
  readonly toolbar: HTMLElement;
}

function renderWorkspace(root: HTMLElement): WorkspaceElements {
  const documentRef = root.ownerDocument;
  const main = createElement(documentRef, "main", "core-workspace");
  const header = createElement(documentRef, "header", "core-workspace__header");
  const title = createElement(documentRef, "h1", "core-workspace__title");
  const status = createElement(documentRef, "p", "core-workspace__status");
  const toolbar = createElement(documentRef, "div", "core-workspace__toolbar");
  const viewport = createElement(documentRef, "section", "core-workspace__viewport");
  const canvas = createElement(documentRef, "canvas", "core-workspace__canvas");
  const activeTool = createElement(documentRef, "p", "core-workspace__active-tool");

  title.id = "octopoly-title";
  title.textContent = "OctoPoly";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.textContent = "Initializing WebGL2 workspace…";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Modeling tools");
  canvas.setAttribute("aria-label", "OctoPoly modeling viewport");
  canvas.setAttribute("tabindex", "0");
  viewport.setAttribute("aria-label", "Retopology viewport");
  viewport.setAttribute("role", "region");
  activeTool.setAttribute("aria-live", "polite");
  activeTool.textContent = "Active tool: retopo.stroke";

  header.append(title, status);
  viewport.append(canvas);
  main.append(header, toolbar, viewport, activeTool);
  root.replaceChildren(main);
  root.dataset.renderer = "initializing";
  return { canvas, status, activeTool, toolbar };
}

function workspaceButton(
  toolbar: HTMLElement,
  label: string,
  action: () => void | Promise<void>,
): HTMLButtonElement {
  const button = toolbar.ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    void Promise.resolve(action()).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      const status = toolbar.parentElement?.querySelector<HTMLElement>('[role="status"]');
      if (status !== null && status !== undefined) {
        status.textContent = `Action failed: ${reason}`;
      }
    });
  });
  toolbar.append(button);
  return button;
}

function downloadArtifact(
  documentRef: Document,
  filename: string,
  content: BlobPart,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

function rendererStatus(
  root: HTMLElement,
  status: HTMLElement,
  result: RendererInitResult,
): void {
  root.dataset.renderer = result.status;
  status.className = `core-workspace__status core-workspace__status--${result.status}`;
  if (result.status === "ready") {
    status.textContent = `WebGL2 ready · max texture ${result.capabilities.maxTextureSize}px`;
  } else if (result.status === "unsupported") {
    status.textContent = `WebGL2 unsupported · ${result.reason}`;
  } else {
    status.textContent = `WebGL2 failed · ${result.reason}`;
  }
}

/** Mounts the production Core-only workspace. It never imports optional extensions. */
export async function mountCoreWorkspace(
  root: HTMLElement,
  options: CoreWorkspaceMountOptions = {},
): Promise<MountedCoreWorkspace> {
  const elements = renderWorkspace(root);
  const workspace = (options.createWorkspace ?? createProductionCoreWorkspace)();
  const activate = (id: string): void => {
    workspace.activateTool(id);
    elements.activeTool.textContent = `Active tool: ${id}`;
  };

  for (const [label, id] of [
    ["Retopo", "retopo.stroke"],
    ["Select", "basic.select"],
    ["Move", "basic.move-vertices"],
    ["Delete", "basic.delete-elements"],
    ["Create vertex", "vertex.create"],
    ["Split edge", "edge.split"],
    ["Extrude", "face.extrude"],
  ] as const) {
    const button = workspaceButton(elements.toolbar, label, () => activate(id));
    button.dataset.toolId = id;
  }
  workspaceButton(elements.toolbar, "Undo", () => workspace.history.undo());
  workspaceButton(elements.toolbar, "Redo", () => workspace.history.redo());
  workspaceButton(elements.toolbar, "Save", async () => {
    await workspace.saveProject("default");
  });
  workspaceButton(elements.toolbar, "Load", async () => {
    await workspace.loadProject("default");
  });
  const referenceInput = root.ownerDocument.createElement("input");
  referenceInput.type = "file";
  referenceInput.accept = ".obj,text/plain";
  referenceInput.hidden = true;
  referenceInput.setAttribute("aria-label", "Import OBJ reference");
  referenceInput.addEventListener("change", () => {
    const file = referenceInput.files?.item(0);
    if (file === null || file === undefined) {
      return;
    }
    elements.status.textContent = `Importing ${file.name}…`;
    void file.text()
      .then((source) => workspace.importReferenceObj(source, IDENTITY_MATRIX))
      .then(() => {
        elements.status.textContent = `Reference imported · ${file.name}`;
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        elements.status.textContent = `Reference import failed · ${reason}`;
      })
      .finally(() => {
        referenceInput.value = "";
      });
  });
  elements.toolbar.append(referenceInput);
  workspaceButton(elements.toolbar, "Import OBJ", () => referenceInput.click());
  workspaceButton(elements.toolbar, "Export OBJ", () => {
    downloadArtifact(root.ownerDocument, "octopoly.obj", workspace.exportObj(), "text/plain");
  });
  workspaceButton(elements.toolbar, "Export GLB", () => {
    downloadArtifact(
      root.ownerDocument,
      "octopoly.glb",
      workspace.exportGlb(),
      "model/gltf-binary",
    );
  });

  let result: RendererInitResult;
  try {
    result = await workspace.initialize(elements.canvas);
  } catch (error) {
    workspace.dispose();
    throw error;
  }
  rendererStatus(root, elements.status, result);

  let disposed = false;
  return Object.freeze({
    workspace,
    renderer: result,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      workspace.dispose();
      root.replaceChildren();
    },
  });
}
