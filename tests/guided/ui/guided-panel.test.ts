import { afterEach, describe, expect, it } from "vitest";

import {
  mountGuidedPanel,
  type GuidedPanelEvent,
  type GuidedPanelViewModel,
} from "../../../src/guided/ui/guided-panel.ts";

export const activeView = (): GuidedPanelViewModel => ({
  title: "Guided Retopology",
  step: { id: "eye-loop", title: "Wrap the eye", position: 2, total: 5 },
  session: "active",
  canSkip: true,
  glossaryTerm: "edge loop",
  status: null,
  motion: "full",
  input: { available: ["pen", "touch", "mouse", "keyboard"], lastUsed: null },
});

const button = (container: HTMLElement, action: GuidedPanelEvent["type"]): HTMLButtonElement => {
  const result = container.querySelector<HTMLButtonElement>(`button[data-guided-action="${action}"]`);
  if (result === null) throw new Error(`Missing ${action} button`);
  return result;
};

describe("mountGuidedPanel", () => {
  afterEach(() => document.body.replaceChildren());

  it("mounts semantic progress and controls in deterministic keyboard order", () => {
    const container = document.createElement("section");
    document.body.append(container);
    const events: GuidedPanelEvent[] = [];

    const panel = mountGuidedPanel(container, activeView(), (event) => events.push(event));

    expect(container.querySelector("h2")?.textContent).toBe("Guided Retopology");
    expect(container.querySelector("h3")?.textContent).toBe("Wrap the eye");
    const progress = container.querySelector("progress");
    expect(progress?.getAttribute("aria-label")).toBe("Lesson progress: step 2 of 5");
    expect(progress?.value).toBe(2);
    expect(progress?.max).toBe(5);

    const actions = [...container.querySelectorAll<HTMLButtonElement>("button")].map(
      (control) => control.dataset.guidedAction,
    );
    expect(actions).toEqual(["pause", "resume", "skip", "abandon", "restart", "glossary"]);
    expect(button(container, "pause").getAttribute("aria-pressed")).toBe("false");
    expect(button(container, "resume").disabled).toBe(true);
    expect(button(container, "glossary").getAttribute("aria-label")).toBe(
      "Open glossary definition for edge loop",
    );

    button(container, "pause").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(events).toEqual([]);
    button(container, "pause").click();
    button(container, "glossary").click();

    expect(events).toEqual([{ type: "pause" }, { type: "glossary", term: "edge loop" }]);
    expect(Object.isFrozen(events[0])).toBe(true);
    panel.dispose();
    expect(container.childElementCount).toBe(0);
  });

  it("moves focus to an enabled control when a state transition disables the focused action", () => {
    const container = document.createElement("section");
    document.body.append(container);
    const panel = mountGuidedPanel(container, activeView(), () => undefined);
    button(container, "pause").focus();

    panel.update({ ...activeView(), session: "paused" });
    expect(document.activeElement).toBe(button(container, "resume"));

    panel.update(activeView());
    expect(document.activeElement).toBe(button(container, "pause"));
    panel.dispose();
  });

  it("uses icon, text, pattern and semantic severity instead of color alone", async () => {
    const container = document.createElement("section");
    const panel = mountGuidedPanel(container, {
      ...activeView(),
      status: { severity: "completion-blocker", message: "This edge is shared by three faces." },
    }, () => undefined);

    const status = container.querySelector<HTMLElement>("[data-guided-status]");
    expect(status?.dataset.severity).toBe("completion-blocker");
    expect(status?.dataset.pattern).toBe("crosshatch");
    expect(status?.getAttribute("role")).toBeNull();
    expect(status?.textContent).toContain("Blocked");
    expect(status?.textContent).toContain("This edge is shared by three faces.");
    expect(status?.matches("[data-guided-live]")).toBe(false);
    const assertive = container.querySelector<HTMLElement>("[data-guided-live=\"assertive\"]");
    expect(assertive?.getAttribute("aria-live")).toBe("assertive");
    expect(assertive?.style.position).toBe("absolute");
    expect(assertive?.textContent).toBe("");
    await Promise.resolve();
    expect(assertive?.textContent).toBe("Blocked: This edge is shared by three faces.");
    panel.dispose();
  });

  it("deduplicates polite announcements and restores focus across updates", () => {
    const container = document.createElement("section");
    document.body.append(container);
    const panel = mountGuidedPanel(container, activeView(), () => undefined);
    const persistentLiveRegion = container.querySelector<HTMLElement>("[data-guided-live=\"polite\"]");
    const glossary = button(container, "glossary");
    glossary.focus();

    const warning: GuidedPanelViewModel = {
      ...activeView(),
      status: { severity: "warning", message: "Spacing varies in this region." },
    };
    panel.update(warning);
    const live = container.querySelector<HTMLElement>("[data-guided-live=\"polite\"]");
    expect(live).toBe(persistentLiveRegion);
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.textContent).toBe("Warning: Spacing varies in this region.");
    expect(live?.dataset.announcementRevision).toBe("1");
    expect(document.activeElement).toBe(button(container, "glossary"));

    panel.update(warning);
    const duplicate = container.querySelector<HTMLElement>("[data-guided-live=\"polite\"]");
    expect(duplicate).toBe(persistentLiveRegion);
    expect(duplicate?.dataset.announcementRevision).toBe("1");
    expect(duplicate?.getAttribute("aria-live")).toBe("polite");
    expect(duplicate?.textContent).toBe("Warning: Spacing varies in this region.");
    expect(container.querySelectorAll("[data-guided-live]")).toHaveLength(2);
    panel.dispose();
  });
});
