import { describe, expect, it, vi } from "vitest";

import { createDefaultFacialWorkspace, duplicateBaseMesh, moveVertex } from "../src/facial/workspace";
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

  it("exposes a name field for copies but keeps the base name immutable", () => {
    const container = document.createElement("div");
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh: vi.fn(),
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);

    expect(container.querySelector('[data-mesh-id="base"] input')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('[data-rename-mesh-id="copy-1"]')?.value)
      .toBe("Base Mask Copy 1");
  });

  it("requests a copy rename when its name field changes", () => {
    const container = document.createElement("div");
    const onRenameMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    const input = container.querySelector<HTMLInputElement>('[data-rename-mesh-id="copy-1"]');

    if (!input) throw new Error("copy name input missing");
    input.value = "Smile";
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onRenameMesh).toHaveBeenCalledWith("copy-1", "Smile");
  });

  it("restores the copy name instead of requesting a blank rename", () => {
    const container = document.createElement("div");
    const onRenameMesh = vi.fn();
    const panel = mountFacialPanel(container, {
      onImport: vi.fn(),
      onDuplicate: vi.fn(),
      onSelectMesh: vi.fn(),
      onRenameMesh,
    });
    panel.render(duplicateBaseMesh(createDefaultFacialWorkspace(), "copy-1"), null);
    const input = container.querySelector<HTMLInputElement>('[data-rename-mesh-id="copy-1"]');
    if (!input) throw new Error("copy name input missing");

    input.value = "   ";
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(input.value).toBe("Base Mask Copy 1");
    expect(onRenameMesh).not.toHaveBeenCalled();
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
