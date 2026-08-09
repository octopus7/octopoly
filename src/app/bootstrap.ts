import {
  probeRuntimeCapabilities,
  type RuntimeCapabilities,
} from "./capabilities";

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
