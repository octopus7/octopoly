import type { GuidedDiagnosticSeverity } from "../analysis/topology-diagnostics.ts";
import {
  statusPresentation,
  type GuidedInputAvailability,
  type GuidedMotionPreference,
} from "../accessibility/guidance.ts";
import type { GuidedSessionState } from "../core/session.ts";

export type GuidedPanelSessionState = GuidedSessionState;

export interface GuidedPanelViewModel {
  readonly title: string;
  readonly step: { readonly id: string; readonly title: string; readonly position: number; readonly total: number };
  readonly session: GuidedPanelSessionState;
  readonly canSkip: boolean;
  readonly glossaryTerm: string;
  readonly status: { readonly severity: GuidedDiagnosticSeverity; readonly message: string } | null;
  readonly motion: GuidedMotionPreference;
  readonly input: GuidedInputAvailability;
}

export type GuidedPanelEvent =
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "skip" }
  | { readonly type: "abandon" }
  | { readonly type: "restart" }
  | { readonly type: "glossary"; readonly term: string };

export interface GuidedPanelController {
  update(view: GuidedPanelViewModel): void;
  dispose(): void;
}

type SimpleAction = Exclude<GuidedPanelEvent["type"], "glossary">;
const controlOrder: ReadonlyArray<GuidedPanelEvent["type"]> = Object.freeze([
  "pause", "resume", "skip", "abandon", "restart", "glossary",
]);
const labels: Readonly<Record<SimpleAction, string>> = Object.freeze({
  pause: "Pause lesson",
  resume: "Resume lesson",
  skip: "Skip optional step",
  abandon: "Abandon lesson",
  restart: "Restart lesson progress",
});

function eventFor(action: GuidedPanelEvent["type"], view: GuidedPanelViewModel): GuidedPanelEvent {
  return Object.freeze(action === "glossary" ? { type: "glossary", term: view.glossaryTerm } : { type: action });
}

function enabled(action: GuidedPanelEvent["type"], view: GuidedPanelViewModel): boolean {
  if (action === "pause") return view.session === "active";
  if (action === "resume") return view.session === "paused";
  if (action === "skip") return view.session === "active" && view.canSkip;
  if (action === "abandon") return view.session === "active" || view.session === "paused";
  return true;
}

function liveRegion(politeness: "polite" | "assertive"): HTMLDivElement {
  const region = document.createElement("div");
  region.dataset.guidedLive = politeness;
  region.dataset.announcementRevision = "0";
  Object.assign(region.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
  });
  region.setAttribute("aria-live", politeness);
  region.setAttribute("aria-atomic", "true");
  return region;
}

export function mountGuidedPanel(
  container: HTMLElement,
  initialView: GuidedPanelViewModel,
  onEvent: (event: GuidedPanelEvent) => void,
): GuidedPanelController {
  let disposed = false;
  let view = initialView;
  let lastAnnouncementKey = "";
  let announcementRevision = 0;

  const root = document.createElement("section");
  root.dataset.guidedPanel = "";
  const content = document.createElement("div");
  content.dataset.guidedContent = "";
  const visibleStatus = document.createElement("div");
  const controlsHost = document.createElement("div");
  controlsHost.dataset.guidedControlsHost = "";
  const polite = liveRegion("polite");
  const assertive = liveRegion("assertive");
  root.append(content, visibleStatus, controlsHost, polite, assertive);
  container.replaceChildren(root);

  const publishAnnouncement = (): void => {
    if (disposed) return;
    const announcementKey = view.status === null ? "" : `${view.status.severity}:${view.status.message}`;
    if (announcementKey === lastAnnouncementKey) return;
    lastAnnouncementKey = announcementKey;
    announcementRevision += 1;
    polite.textContent = "";
    assertive.textContent = "";
    if (view.status !== null) {
      const presentation = statusPresentation(view.status.severity);
      const target = presentation.live === "assertive" ? assertive : polite;
      target.textContent = `${presentation.label}: ${view.status.message}`;
    }
    polite.dataset.announcementRevision = String(announcementRevision);
    assertive.dataset.announcementRevision = String(announcementRevision);
  };

  const render = (): void => {
    if (disposed) return;
    const focusedAction = container.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.guidedAction
      : undefined;
    root.setAttribute("aria-label", view.title);

    const heading = document.createElement("h2");
    heading.textContent = view.title;
    const stepHeading = document.createElement("h3");
    stepHeading.textContent = view.step.title;
    const progress = document.createElement("progress");
    progress.value = view.step.position;
    progress.max = view.step.total;
    progress.setAttribute("aria-label", `Lesson progress: step ${view.step.position} of ${view.step.total}`);
    const input = document.createElement("p");
    input.dataset.guidedInput = "";
    input.textContent = `Available input: ${view.input.available.join(", ")}. Current input: ${view.input.lastUsed ?? "not selected"}.`;
    content.replaceChildren(heading, stepHeading, progress, input);

    delete visibleStatus.dataset.guidedStatus;
    delete visibleStatus.dataset.severity;
    delete visibleStatus.dataset.pattern;
    visibleStatus.textContent = "";
    visibleStatus.hidden = view.status === null;
    if (view.status !== null) {
      const presentation = statusPresentation(view.status.severity);
      visibleStatus.dataset.guidedStatus = "";
      visibleStatus.dataset.severity = view.status.severity;
      visibleStatus.dataset.pattern = presentation.pattern;
      visibleStatus.textContent = `${presentation.icon} ${presentation.label}: ${view.status.message}`;
    }

    const controls = document.createElement("div");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Guided lesson controls");
    for (const action of controlOrder) {
      const control = document.createElement("button");
      control.type = "button";
      control.dataset.guidedAction = action;
      control.disabled = !enabled(action, view);
      if (action === "glossary") {
        control.textContent = "Glossary";
        control.setAttribute("aria-label", `Open glossary definition for ${view.glossaryTerm}`);
      } else {
        control.textContent = labels[action];
      }
      if (action === "pause") control.setAttribute("aria-pressed", String(view.session === "paused"));
      control.addEventListener("click", () => {
        if (!control.disabled && !disposed) onEvent(eventFor(action, view));
      });
      controls.append(control);
    }
    controlsHost.replaceChildren(controls);
    if (focusedAction !== undefined) {
      const previousAction = controlsHost.querySelector<HTMLButtonElement>(`[data-guided-action="${focusedAction}"]`);
      const focusTarget = previousAction !== null && !previousAction.disabled
        ? previousAction
        : controlsHost.querySelector<HTMLButtonElement>("button:not(:disabled)");
      focusTarget?.focus();
    }
  };

  render();
  queueMicrotask(publishAnnouncement);
  return Object.freeze({
    update(nextView: GuidedPanelViewModel) {
      if (disposed) return;
      view = nextView;
      render();
      publishAnnouncement();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      container.replaceChildren();
    },
  });
}
