import { describe, expect, it, vi } from "vitest";

import { createDefaultFacialWorkspace, deleteMesh, duplicateBaseMesh, moveVertex, renameMesh, selectMesh } from "../src/facial/workspace";
import { mountFacialPanel } from "../src/facial/panel";

describe("facial workspace panel", () => {
  it("separates selection, top tools, and the right mesh drawer", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });

    panel.render(createDefaultFacialWorkspace(), null);

    const selection = container.querySelector<HTMLElement>('.facial-selection-card[aria-label="선택 및 보기"]');
    const toolbar = container.querySelector<HTMLElement>('.facial-tool-strip[aria-label="페이셜 도구"]');
    const drawer = container.querySelector<HTMLElement>('.facial-mesh-drawer[aria-label="메시 관리"]');
    const fileMenu = toolbar?.querySelector<HTMLElement>('.facial-file-menu[aria-label="파일"]');
    expect(selection?.querySelector("h2")?.textContent).toBe("선택 및 보기");
    expect(toolbar).not.toBeNull();
    expect(fileMenu).not.toBeNull();
    expect(drawer?.querySelector("h2")?.textContent).toBe("메시 관리");
    expect(drawer?.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.textContent).toContain("Base 복제");
    expect(drawer?.querySelector('section[aria-label="메시 목록"]')).not.toBeNull();
    expect(drawer?.querySelector('[data-mesh-id="base"]')?.textContent).toContain("Base Mask");
    expect(selection?.querySelector('input[type="file"], [data-action="duplicate"], .facial-mesh-list')).toBeNull();
  });

  it("keeps the mesh drawer closed until toggled and closes it on Escape with focus restoration", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(createDefaultFacialWorkspace(), null);
    const toggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-mesh-drawer"]')!;
    const drawer = container.querySelector<HTMLElement>(".facial-mesh-drawer")!;

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(drawer.id);
    expect(toggle.getAttribute("aria-label")).toContain("메시 관리");
    expect(toggle.title).toContain("메시 관리");
    expect(drawer.dataset.open).toBe("false");
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(drawer.hasAttribute("inert")).toBe(true);

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(drawer.dataset.open).toBe("true");
    expect(drawer.hasAttribute("inert")).toBe(false);

    const duplicate = drawer.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!;
    duplicate.focus();
    duplicate.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(drawer.dataset.open).toBe("false");
    expect(document.activeElement).toBe(toggle);

    panel.dispose();
    container.remove();
  });

  it("closes only the open mesh drawer when Escape bubbles from its focused trigger", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const drawerToggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-mesh-drawer"]')!;
    const drawer = container.querySelector<HTMLElement>(".facial-mesh-drawer")!;
    const fileToggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!;
    const fileMenu = container.querySelector<HTMLElement>(".facial-file-menu")!;
    const backgroundKeydown = vi.fn();
    document.addEventListener("keydown", backgroundKeydown);

    try {
      fileToggle.click();
      drawerToggle.focus();
      drawerToggle.click();
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });

      drawerToggle.dispatchEvent(escape);

      expect(drawer.dataset.open).toBe("false");
      expect(drawerToggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(drawerToggle);
      expect(fileMenu.hidden).toBe(false);
      expect(fileToggle.getAttribute("aria-expanded")).toBe("true");
      expect(escape.defaultPrevented).toBe(true);
      expect(backgroundKeydown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", backgroundKeydown);
      panel.dispose();
      container.remove();
    }
  });

  it("keeps the File menu collapsed, opens the OBJ picker, resets same-file selection, and restores focus on Escape", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onImport = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport,
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const toggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!;
    const menu = container.querySelector<HTMLElement>(".facial-file-menu")!;
    const input = menu.querySelector<HTMLInputElement>('input[type="file"]')!;
    const importAction = menu.querySelector<HTMLButtonElement>('[data-action="import-obj"]')!;

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(menu.id);
    expect(toggle.getAttribute("aria-label")).toBe("파일 메뉴");
    expect(toggle.title).toBe("파일 메뉴");
    expect(menu.hidden).toBe(true);
    expect(menu.querySelector("h2")?.textContent).toBe("파일");
    expect(importAction.textContent).toBe("OBJ 가져오기");
    expect(container.textContent).not.toMatch(/Export|내보내기/);

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);
    const pickerClick = vi.spyOn(input, "click");
    importAction.click();
    expect(pickerClick).toHaveBeenCalledOnce();

    const file = new File(["v 0 0 0"], "mask.obj", { type: "text/plain" });
    const setValue = vi.fn();
    Object.defineProperties(input, {
      files: { configurable: true, value: [file] },
      value: { configurable: true, get: () => "mask.obj", set: setValue },
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onImport).toHaveBeenCalledWith(file);
    expect(setValue).toHaveBeenCalledWith("");

    importAction.focus();
    importAction.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);

    panel.dispose();
    container.remove();
  });

  it("loads the Luna preset once and closes the File menu with focus restored", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onLoadPreset = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onLoadPreset,
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const toggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!;
    const menu = container.querySelector<HTMLElement>(".facial-file-menu")!;

    try {
      const presetGroup = menu.querySelector<HTMLElement>('[aria-labelledby^="facial-preset-heading-"]')!;
      const heading = presetGroup.querySelector<HTMLElement>("h3")!;
      const presetButtons = [...presetGroup.querySelectorAll<HTMLButtonElement>("button")];
      expect(presetGroup.getAttribute("role")).toBe("group");
      expect(heading.textContent).toBe("프리셋");
      expect(presetButtons.map((button) => button.textContent)).toEqual(["Luna"]);
      expect(container.textContent).not.toMatch(/Export|내보내기/);

      toggle.click();
      presetButtons[0]!.focus();
      presetButtons[0]!.click();

      expect(onLoadPreset).toHaveBeenCalledOnce();
      expect(onLoadPreset).toHaveBeenCalledWith("luna");
      expect(menu.hidden).toBe(true);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(toggle);
    } finally {
      panel.dispose();
      container.remove();
    }
  });

  it("closes only the open File menu when Escape bubbles from its focused trigger", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const fileToggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-file-menu"]')!;
    const fileMenu = container.querySelector<HTMLElement>(".facial-file-menu")!;
    const drawerToggle = container.querySelector<HTMLButtonElement>('[data-action="toggle-mesh-drawer"]')!;
    const drawer = container.querySelector<HTMLElement>(".facial-mesh-drawer")!;
    const backgroundKeydown = vi.fn();
    document.addEventListener("keydown", backgroundKeydown);

    try {
      drawerToggle.click();
      fileToggle.focus();
      fileToggle.click();
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });

      fileToggle.dispatchEvent(escape);

      expect(fileMenu.hidden).toBe(true);
      expect(fileToggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(fileToggle);
      expect(drawer.dataset.open).toBe("true");
      expect(drawerToggle.getAttribute("aria-expanded")).toBe("true");
      expect(escape.defaultPrevented).toBe(true);
      expect(backgroundKeydown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", backgroundKeydown);
      panel.dispose();
      container.remove();
    }
  });

  it("announces the selected vertex through a polite live region", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });

    panel.render(createDefaultFacialWorkspace(), 4);

    const announcement = container.querySelector<HTMLElement>('.facial-selection-status[aria-live="polite"]');
    expect(announcement?.textContent).toMatch(/^정점 5 선택됨\. 좌표 X -?\d+\.\d{6}, Y -?\d+\.\d{6}, Z -?\d+\.\d{6}$/);
  });

  it("shows compact selection status and enables Focus only for a selected vertex", () => {
    const container = document.createElement("div");
    const onFocusSelected = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
      onFocusSelected,
    });
    const card = container.querySelector<HTMLElement>(".facial-selection-card")!;
    const visibleStatus = card.querySelector<HTMLElement>(".facial-selection-summary")!;
    const focusButton = card.querySelector<HTMLButtonElement>('[data-action="focus-selected"]')!;

    panel.render(createDefaultFacialWorkspace(), null);
    expect(visibleStatus.textContent).toBe("선택 정점 없음");
    expect(focusButton.disabled).toBe(true);

    panel.render(createDefaultFacialWorkspace(), 2);
    expect(visibleStatus.textContent).toMatch(/^정점 3 · X -?\d+\.\d{6} · Y -?\d+\.\d{6} · Z -?\d+\.\d{6}$/);
    expect(focusButton.disabled).toBe(false);
    focusButton.click();
    expect(onFocusSelected).toHaveBeenCalledOnce();
  });

  it("announces small model-scale coordinate changes without rounding them away", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const workspace = createDefaultFacialWorkspace();
    panel.render(workspace, 0);
    const announcement = container.querySelector<HTMLElement>(".facial-selection-status")!;
    const before = announcement.textContent;

    panel.render(moveVertex(workspace, "base", 0, "x", 0.000_02), 0);

    expect(announcement.textContent).not.toBe(before);
  });

  it("requests a base duplication from the duplicate control", () => {
    const container = document.createElement("div");
    const onDuplicate = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate,
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(createDefaultFacialWorkspace(), null);

    container.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.click();

    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it("enables selected-vertex Focus only when a vertex is selected", () => {
    const container = document.createElement("div");
    const onFocusSelected = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
      onFocusSelected,
    });
    const focusButton = container.querySelector<HTMLButtonElement>('[data-action="focus-selected"]')!;

    panel.render(createDefaultFacialWorkspace(), null);
    expect(focusButton.disabled).toBe(true);

    panel.render(createDefaultFacialWorkspace(), 2);
    focusButton.click();
    expect(focusButton.disabled).toBe(false);
    expect(onFocusSelected).toHaveBeenCalledOnce();
  });

  it("requests activation of the clicked mesh", () => {
    const container = document.createElement("div");
    const onSelectMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh,
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);

    container.querySelector<HTMLButtonElement>('[data-mesh-id="base"]')?.click();

    expect(onSelectMesh).toHaveBeenCalledOnce();
    expect(onSelectMesh).toHaveBeenCalledWith("base");
  });

  it("focuses the logical replacement after a focused inactive mesh is selected synchronously", () => {
    const container = document.createElement("div");
    const focusSentinel = document.createElement("button");
    document.body.append(container, focusSentinel);
    let workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    let panel: ReturnType<typeof mountFacialPanel>;
    panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: (meshId) => {
        workspace = selectMesh(workspace, meshId);
        panel.render(workspace, null);
      },
      onRenameMesh: vi.fn(),
    });
    panel.render(workspace, null);
    const staleBase = container.querySelector<HTMLButtonElement>('[data-mesh-id="base"]')!;
    staleBase.focus();

    staleBase.click();

    const replacementBase = [...container.querySelectorAll<HTMLButtonElement>(".facial-mesh-row__select")]
      .find((button) => button.dataset.meshId === "base")!;
    expect(replacementBase).not.toBe(staleBase);
    expect(replacementBase.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(replacementBase);

    focusSentinel.focus();
    const inactiveCopy = [...container.querySelectorAll<HTMLButtonElement>(".facial-mesh-row__select")]
      .find((button) => button.dataset.meshId === "copy-1")!;
    inactiveCopy.click();
    expect(document.activeElement).toBe(focusSentinel);

    panel.dispose();
    container.remove();
    focusSentinel.remove();
  });

  it("reveals actions only after a selected copy row is clicked again", () => {
    const container = document.createElement("div");
    let workspace = duplicateBaseMesh(
      duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"),
      "copy-2",
    );
    let panel: ReturnType<typeof mountFacialPanel>;
    const onSelectMesh = vi.fn((meshId: string) => {
      workspace = selectMesh(workspace, meshId);
      panel.render(workspace, null);
    });
    panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh,
      onRenameMesh: vi.fn(),
    });
    panel.render(workspace, null);

    const rows = container.querySelectorAll(".facial-mesh-row");
    const baseRow = rows[0]!;
    expect(rows).toHaveLength(3);
    expect(baseRow.querySelector('[data-mesh-id="base"]')?.textContent).toBe("Base Mask");
    expect(baseRow.querySelector(".facial-mesh-row__actions")).toBeNull();
    expect([...container.querySelectorAll<HTMLElement>(".facial-mesh-row__actions")]
      .every((actions) => actions.hidden)).toBe(true);

    const initialCopy = container.querySelector<HTMLButtonElement>('[data-mesh-id="copy-2"]')!;
    const initialActions = initialCopy.closest(".facial-mesh-row")!
      .querySelector<HTMLElement>(".facial-mesh-row__actions")!;
    expect(initialCopy.getAttribute("aria-expanded")).toBe("false");
    expect(initialCopy.getAttribute("aria-controls")).toBe(initialActions.id);

    initialCopy.click();
    expect(onSelectMesh).not.toHaveBeenCalled();
    let visibleActions = [...container.querySelectorAll<HTMLElement>(".facial-mesh-row__actions")]
      .filter((actions) => !actions.hidden);
    expect(visibleActions).toHaveLength(1);
    expect(container.querySelector('[data-mesh-id="copy-2"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(visibleActions[0]?.closest(".facial-mesh-row")?.querySelector("[data-mesh-id]")?.getAttribute("data-mesh-id"))
      .toBe("copy-2");
    expect(visibleActions[0]?.querySelector('[aria-label="Base Mask Copy 2 이름 변경"] svg[aria-hidden="true"]')).not.toBeNull();

    container.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    expect(onSelectMesh).toHaveBeenCalledOnce();
    expect(onSelectMesh).toHaveBeenLastCalledWith("copy-1");
    expect([...container.querySelectorAll<HTMLElement>(".facial-mesh-row__actions")]
      .every((actions) => actions.hidden)).toBe(true);

    container.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    expect(onSelectMesh).toHaveBeenCalledOnce();
    visibleActions = [...container.querySelectorAll<HTMLElement>(".facial-mesh-row__actions")]
      .filter((actions) => !actions.hidden);
    expect(visibleActions).toHaveLength(1);
    expect(container.querySelector('[data-mesh-id="copy-1"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(visibleActions[0]?.querySelector('[aria-label="Base Mask Copy 1 삭제"]')).not.toBeNull();

    container.querySelector<HTMLButtonElement>('[data-mesh-id="copy-1"]')?.click();
    expect(onSelectMesh).toHaveBeenCalledOnce();
    expect([...container.querySelectorAll<HTMLElement>(".facial-mesh-row__actions")]
      .every((actions) => actions.hidden)).toBe(true);
  });

  it("uses one opaque ARIA action-group ID for a persisted mesh ID containing whitespace", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "persisted copy id"), null);
    const copyButton = [...container.querySelectorAll<HTMLButtonElement>(".facial-mesh-row__select")]
      .find((button) => button.dataset.meshId === "persisted copy id")!;
    const controls = copyButton.getAttribute("aria-controls")!;

    expect(copyButton.dataset.meshId).toBe("persisted copy id");
    expect(controls).not.toMatch(/\s/);
    expect(document.getElementById(controls)).toBe(
      copyButton.closest(".facial-mesh-row")?.querySelector(".facial-mesh-row__actions"),
    );
    expect(container.querySelectorAll(`#${controls}`)).toHaveLength(1);

    panel.dispose();
    container.remove();
  });

  it("opens an accessible rename dialog with the current name focused", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);

    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][data-mesh-dialog="rename"]:not([hidden])');
    const input = dialog?.querySelector<HTMLInputElement>('[data-mesh-dialog-input]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Base Mask Copy 1 이름 변경");
    expect(input?.value).toBe("Base Mask Copy 1");
    expect(input?.required).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(dialog?.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')?.textContent).toBe("취소");
    expect(dialog?.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')?.textContent).toBe("저장");
    panel.dispose();
    container.remove();
  });

  it("contains Tab and Shift+Tab focus inside the open dialog", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();
    const input = container.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
    const save = container.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')!;

    save.focus();
    save.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(input);

    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(save);

    panel.dispose();
    container.remove();
  });

  it("hosts the modal at the viewport root and restores background inert state", () => {
    const viewport = document.createElement("section");
    viewport.className = "viewport";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("inert", "");
    const overlay = document.createElement("div");
    const container = document.createElement("div");
    container.className = "facial-panel-layer";
    const viewportButton = document.createElement("button");
    viewport.append(canvas, overlay, container, viewportButton);
    document.body.append(viewport);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);

    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();

    const backdrop = viewport.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")!;
    expect(backdrop.parentElement).toBe(viewport);
    expect([...viewport.children]
      .filter((child) => child !== backdrop)
      .every((child) => child.hasAttribute("inert"))).toBe(true);

    backdrop.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')?.click();
    expect(canvas.hasAttribute("inert")).toBe(true);
    expect(overlay.hasAttribute("inert")).toBe(false);
    expect(container.hasAttribute("inert")).toBe(false);
    expect(viewportButton.hasAttribute("inert")).toBe(false);

    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();
    panel.dispose();
    expect(canvas.hasAttribute("inert")).toBe(true);
    expect(overlay.hasAttribute("inert")).toBe(false);
    expect(container.hasAttribute("inert")).toBe(false);
    expect(viewportButton.hasAttribute("inert")).toBe(false);
    viewport.remove();
  });

  it("saves a trimmed copy name through the rename callback and closes", () => {
    const container = document.createElement("div");
    const onRenameMesh = vi.fn(() => true);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();
    const input = container.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
    input.value = "  Smile  ";

    container.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')?.click();

    expect(onRenameMesh).toHaveBeenCalledOnce();
    expect(onRenameMesh).toHaveBeenCalledWith("copy-1", "Smile");
    expect(container.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
  });

  it("focuses the replacement rename action after a successful synchronous rename", () => {
    const container = document.createElement("div");
    document.body.append(container);
    let workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    let panel: ReturnType<typeof mountFacialPanel>;
    panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: (meshId, name) => {
        workspace = renameMesh(workspace, meshId, name);
        panel.render(workspace, null);
        return true;
      },
    });
    panel.render(workspace, null);
    const staleTrigger = container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')!;
    staleTrigger.click();
    const input = container.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
    input.value = "Smile";

    container.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')?.click();

    const replacement = container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')!;
    expect(replacement).not.toBe(staleTrigger);
    expect(replacement.getAttribute("aria-label")).toBe("Smile 이름 변경");
    expect(document.activeElement).toBe(replacement);
    panel.dispose();
    container.remove();
  });

  it("keeps the rename dialog open and invalid without calling back for a blank name", () => {
    const container = document.createElement("div");
    const onRenameMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();
    const input = container.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
    input.value = "   ";

    container.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')?.click();

    expect(onRenameMesh).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.validationMessage).not.toBe("");
    expect(container.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(false);
  });

  it("opens an accessible confirmation dialog that names the copy and exposes a destructive action", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
      onDeleteMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);

    container.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]')?.click();

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][data-mesh-dialog="delete"]:not([hidden])');
    expect(dialog?.getAttribute("aria-label")).toBe("Base Mask Copy 1 삭제");
    expect(dialog?.textContent).toContain("Base Mask Copy 1");
    expect(dialog?.querySelector('[data-mesh-dialog-input]')).toBeNull();
    expect(dialog?.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')?.textContent).toBe("취소");
    const deleteButton = dialog?.querySelector<HTMLButtonElement>('[data-dialog-action="delete"]');
    expect(deleteButton?.textContent).toBe("삭제");
    expect(deleteButton?.classList.contains("facial-mesh-dialog__delete")).toBe(true);
  });

  it("confirms copy deletion through the optional callback and closes", () => {
    const container = document.createElement("div");
    const onDeleteMesh = vi.fn(() => true);
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
      onDeleteMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    container.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]')?.click();

    container.querySelector<HTMLButtonElement>('[data-dialog-action="delete"]')?.click();

    expect(onDeleteMesh).toHaveBeenCalledOnce();
    expect(onDeleteMesh).toHaveBeenCalledWith("copy-1");
    expect(container.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
  });

  it("focuses the existing active mesh after a successful synchronous deletion", () => {
    const container = document.createElement("div");
    document.body.append(container);
    let workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    let panel: ReturnType<typeof mountFacialPanel>;
    panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
      onDeleteMesh: (meshId) => {
        workspace = deleteMesh(workspace, meshId);
        panel.render(workspace, null);
        return true;
      },
    });
    panel.render(workspace, null);
    container.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]')?.click();

    container.querySelector<HTMLButtonElement>('[data-dialog-action="delete"]')?.click();

    const activeMesh = container.querySelector<HTMLButtonElement>('[data-mesh-id="base"]')!;
    expect(activeMesh.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(activeMesh);
    panel.dispose();
    container.remove();
  });

  it("cancels a rename without callback and restores focus to its trigger", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onRenameMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    const trigger = container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')!;
    trigger.click();

    container.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')?.click();

    expect(onRenameMesh).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    panel.dispose();
    container.remove();
  });

  it("closes the confirmation on Escape without deleting and restores focus", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onDeleteMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
      onDeleteMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    const trigger = container.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]')!;
    trigger.click();
    const cancelButton = container.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')!;
    const backgroundKeydown = vi.fn();
    document.addEventListener("keydown", backgroundKeydown);

    cancelButton.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));

    expect(onDeleteMesh).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(backgroundKeydown).not.toHaveBeenCalled();
    document.removeEventListener("keydown", backgroundKeydown);
    panel.dispose();
    container.remove();
  });

  it("reuses one dialog across renders and closes stale dialog state", () => {
    const container = document.createElement("div");
    const onRenameMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh,
    });
    const workspace = duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1");
    panel.render(workspace, null);
    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();

    panel.render(workspace, null);

    expect(container.querySelector<HTMLElement>(".facial-mesh-dialog-backdrop")?.hidden).toBe(true);
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    container.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]')?.click();
    const input = container.querySelector<HTMLInputElement>('[data-mesh-dialog-input]')!;
    input.value = "Smile";
    container.querySelector<HTMLButtonElement>('[data-dialog-action="save"]')?.click();
    expect(onRenameMesh).toHaveBeenCalledOnce();
  });

  it("passes the selected OBJ file to the import callback", () => {
    const container = document.createElement("div");
    const onImport = vi.fn();
    mountFacialPanel(container, {
      onImport,
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["v 0 0 0"], "mask.obj", { type: "text/plain" });

    if (!input) throw new Error("OBJ input missing");
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onImport).toHaveBeenCalledWith(file);
  });

  it("clears the file input after import so the same OBJ can be selected again", () => {
    const container = document.createElement("div");
    mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("OBJ input missing");
    const file = new File(["v 0 0 0"], "mask.obj", { type: "text/plain" });
    const setValue = vi.fn();
    Object.defineProperties(input, {
      files: { configurable: true, value: [file] },
      value: { configurable: true, get: () => "mask.obj", set: setValue },
    });

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(setValue).toHaveBeenCalledWith("");
  });
});
