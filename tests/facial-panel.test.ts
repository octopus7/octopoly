import { describe, expect, it, vi } from "vitest";

import { createDefaultFacialWorkspace, deleteMesh, duplicateBaseMesh, moveVertex, renameMesh } from "../src/facial/workspace";
import { mountFacialPanel } from "../src/facial/panel";

describe("facial workspace panel", () => {
  it("renders import, duplication, and mesh controls without export", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });

    panel.render(createDefaultFacialWorkspace(), null);

    expect(container.querySelector(".facial-panel")?.getAttribute("aria-label")).toBe("페이셜 작업");
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.accept).toContain(".obj");
    expect(container.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.textContent).toContain("Base 복제");
    expect(container.querySelector('section[aria-label="메시 목록"]')).not.toBeNull();
    expect(container.querySelector('[data-mesh-id="base"]')?.textContent).toContain("Base Mask");
    expect(container.textContent).not.toContain("내보내기");
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

  it("renders each copy as one compact row with accessible icon actions while the base has none", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);

    const rows = container.querySelectorAll(".facial-mesh-row");
    const baseRow = rows[0]!;
    const copyRow = rows[1]!;
    expect(rows).toHaveLength(2);
    expect(baseRow.querySelector('[data-mesh-id="base"]')?.textContent).toBe("Base Mask");
    expect(baseRow.querySelectorAll('[data-action="rename-mesh"], [data-action="delete-mesh"]')).toHaveLength(0);
    expect(copyRow.querySelector('[data-mesh-id="copy-1"]')?.textContent).toBe("Base Mask Copy 1");
    expect(copyRow.querySelector("input")).toBeNull();

    const renameButton = copyRow.querySelector<HTMLButtonElement>('[data-action="rename-mesh"]');
    const deleteButton = copyRow.querySelector<HTMLButtonElement>('[data-action="delete-mesh"]');
    expect(renameButton?.getAttribute("aria-label")).toBe("Base Mask Copy 1 이름 변경");
    expect(deleteButton?.getAttribute("aria-label")).toBe("Base Mask Copy 1 삭제");
    expect(renameButton?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(deleteButton?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
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
