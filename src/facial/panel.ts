import type { FacialWorkspace } from "./workspace";

let facialPanelSequence = 0;

function formatCoordinate(value: number): string {
  const absolute = Math.abs(value);
  return absolute !== 0 && (absolute < 0.000_001 || absolute >= 1_000_000_000)
    ? value.toExponential(6)
    : value.toFixed(6);
}

export type FacialPresetId = "luna";

export interface FacialPanelCallbacks {
  readonly onImport: (file: File) => void;
  readonly onLoadTexture?: (file: File) => void;
  readonly onLoadPreset?: (preset: FacialPresetId) => void;
  readonly onDuplicate: () => void;
  readonly onSelectMesh: (meshId: string) => void;
  readonly onRenameMesh: (meshId: string, name: string) => boolean;
  readonly onDeleteMesh?: (meshId: string) => boolean;
  readonly onFocusSelected?: () => void;
}

export interface FacialPanel {
  readonly element: HTMLElement;
  render(workspace: FacialWorkspace, selectedVertex: number | null): void;
  dispose(): void;
}

export function mountFacialPanel(
  container: HTMLElement,
  callbacks: FacialPanelCallbacks,
): FacialPanel {
  const document = container.ownerDocument;
  const panelId = ++facialPanelSequence;
  const modalRoot = container.closest<HTMLElement>(".viewport") ?? container;
  const element = document.createElement("aside");
  element.className = "facial-panel";
  element.setAttribute("aria-label", "페이셜 작업");

  const toolStrip = document.createElement("div");
  toolStrip.className = "facial-tool-strip";
  toolStrip.setAttribute("role", "toolbar");
  toolStrip.setAttribute("aria-label", "페이셜 도구");
  const fileMenu = document.createElement("section");
  fileMenu.className = "facial-file-menu";
  fileMenu.setAttribute("aria-label", "파일");
  fileMenu.id = `facial-file-menu-${panelId}`;
  fileMenu.hidden = true;
  const fileHeading = document.createElement("h2");
  fileHeading.textContent = "파일";
  const fileMenuToggle = document.createElement("button");
  fileMenuToggle.type = "button";
  fileMenuToggle.className = "facial-tool-button facial-file-menu-toggle";
  fileMenuToggle.dataset.action = "toggle-file-menu";
  fileMenuToggle.setAttribute("aria-label", "파일 메뉴");
  fileMenuToggle.title = "파일 메뉴";
  fileMenuToggle.setAttribute("aria-expanded", "false");
  fileMenuToggle.setAttribute("aria-controls", fileMenu.id);
  fileMenuToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 3h10l6 6v12H4V3Zm9 1v6h6M8 15h8M8 18h6" /></svg>';

  const selectionCard = document.createElement("section");
  selectionCard.className = "facial-selection-card";
  selectionCard.setAttribute("aria-label", "선택 및 보기");
  const heading = document.createElement("h2");
  heading.textContent = "선택 및 보기";

  const meshDrawer = document.createElement("aside");
  meshDrawer.className = "facial-mesh-drawer";
  meshDrawer.setAttribute("aria-label", "메시 관리");
  meshDrawer.id = `facial-mesh-drawer-${panelId}`;
  meshDrawer.dataset.open = "false";
  meshDrawer.setAttribute("aria-hidden", "true");
  meshDrawer.setAttribute("inert", "");
  const meshHeading = document.createElement("h2");
  meshHeading.textContent = "메시 관리";
  const meshDrawerToggle = document.createElement("button");
  meshDrawerToggle.type = "button";
  meshDrawerToggle.className = "facial-tool-button facial-mesh-drawer-toggle";
  meshDrawerToggle.dataset.action = "toggle-mesh-drawer";
  meshDrawerToggle.setAttribute("aria-label", "메시 관리 열기");
  meshDrawerToggle.title = "메시 관리 열기";
  meshDrawerToggle.setAttribute("aria-expanded", "false");
  meshDrawerToggle.setAttribute("aria-controls", meshDrawer.id);
  meshDrawerToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16M4 12h16M4 19h16M16 5v14" /></svg>';
  const setMeshDrawerOpen = (open: boolean, restoreFocus = false): void => {
    meshDrawerToggle.setAttribute("aria-expanded", String(open));
    meshDrawerToggle.setAttribute("aria-label", open ? "메시 관리 닫기" : "메시 관리 열기");
    meshDrawerToggle.title = open ? "메시 관리 닫기" : "메시 관리 열기";
    meshDrawer.dataset.open = String(open);
    meshDrawer.setAttribute("aria-hidden", String(!open));
    meshDrawer.toggleAttribute("inert", !open);
    if (restoreFocus) meshDrawerToggle.focus();
  };
  const handleMeshDrawerToggle = (): void => {
    setMeshDrawerOpen(meshDrawer.dataset.open !== "true");
  };
  const handleMeshDrawerKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || meshDrawer.dataset.open !== "true") return;
    event.preventDefault();
    event.stopPropagation();
    setMeshDrawerOpen(false, true);
  };
  meshDrawerToggle.addEventListener("click", handleMeshDrawerToggle);
  meshDrawerToggle.addEventListener("keydown", handleMeshDrawerKeydown);
  meshDrawer.addEventListener("keydown", handleMeshDrawerKeydown);

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".obj,model/obj,text/plain";
  importInput.setAttribute("aria-label", "OBJ 가져오기");
  importInput.hidden = true;
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.dataset.action = "import-obj";
  importButton.textContent = "OBJ 가져오기";
  const handleImportButton = (): void => importInput.click();
  importButton.addEventListener("click", handleImportButton);
  const handleImport = (): void => {
    const file = importInput.files?.[0];
    try {
      if (file) callbacks.onImport(file);
    } finally {
      importInput.value = "";
    }
  };
  importInput.addEventListener("change", handleImport);
  const setFileMenuOpen = (open: boolean, restoreFocus = false): void => {
    fileMenuToggle.setAttribute("aria-expanded", String(open));
    fileMenu.hidden = !open;
    if (restoreFocus) fileMenuToggle.focus();
  };
  const textureInput = document.createElement("input");
  textureInput.type = "file";
  textureInput.accept = ".png,.jpg,.jpeg,image/png,image/jpeg";
  textureInput.dataset.textureInput = "";
  textureInput.setAttribute("aria-label", "현재 모델 텍스처 불러오기");
  textureInput.hidden = true;
  const textureButton = document.createElement("button");
  textureButton.type = "button";
  textureButton.dataset.action = "load-texture";
  textureButton.textContent = "텍스처 불러오기";
  const handleTextureButton = (): void => textureInput.click();
  const handleTexture = (): void => {
    const file = textureInput.files?.[0];
    try {
      if (file) {
        callbacks.onLoadTexture?.(file);
        setFileMenuOpen(false, true);
      }
    } finally {
      textureInput.value = "";
    }
  };
  textureButton.addEventListener("click", handleTextureButton);
  textureInput.addEventListener("change", handleTexture);
  const presetSection = document.createElement("section");
  presetSection.setAttribute("role", "group");
  const presetHeading = document.createElement("h3");
  presetHeading.id = `facial-preset-heading-${panelId}`;
  presetHeading.textContent = "프리셋";
  presetSection.setAttribute("aria-labelledby", presetHeading.id);
  const lunaButton = document.createElement("button");
  lunaButton.type = "button";
  lunaButton.dataset.action = "load-preset";
  lunaButton.dataset.presetId = "luna";
  lunaButton.textContent = "Luna";
  const handleLunaPreset = (): void => {
    callbacks.onLoadPreset?.("luna");
    setFileMenuOpen(false, true);
  };
  lunaButton.addEventListener("click", handleLunaPreset);
  presetSection.append(presetHeading, lunaButton);
  const handleFileMenuToggle = (): void => {
    const open = fileMenu.hidden !== false;
    setFileMenuOpen(open);
    if (open) {
      const CustomEventConstructor = document.defaultView?.CustomEvent ?? CustomEvent;
      document.dispatchEvent(new CustomEventConstructor("facial:tool-popover-open", {
        detail: fileMenu,
      }));
    }
  };
  const handleFileMenuKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || fileMenu.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    setFileMenuOpen(false, true);
  };
  const handleOtherToolPopover = (event: Event): void => {
    if ((event as CustomEvent<HTMLElement>).detail !== fileMenu) setFileMenuOpen(false);
  };
  fileMenuToggle.addEventListener("click", handleFileMenuToggle);
  fileMenuToggle.addEventListener("keydown", handleFileMenuKeydown);
  fileMenu.addEventListener("keydown", handleFileMenuKeydown);
  document.addEventListener("facial:tool-popover-open", handleOtherToolPopover);

  const duplicateButton = document.createElement("button");
  duplicateButton.type = "button";
  duplicateButton.dataset.action = "duplicate";
  duplicateButton.textContent = "Base 복제";
  duplicateButton.addEventListener("click", callbacks.onDuplicate);

  const focusButton = document.createElement("button");
  focusButton.type = "button";
  focusButton.dataset.action = "focus-selected";
  focusButton.textContent = "선택 정점 Focus";
  const handleFocusSelected = (): void => callbacks.onFocusSelected?.();
  focusButton.addEventListener("click", handleFocusSelected);

  const meshList = document.createElement("section");
  meshList.className = "facial-mesh-list";
  meshList.setAttribute("aria-label", "메시 목록");

  const selectionSummary = document.createElement("p");
  selectionSummary.className = "facial-selection-summary";
  const selectionAnnouncement = document.createElement("p");
  selectionAnnouncement.className = "visually-hidden facial-selection-status";
  selectionAnnouncement.setAttribute("aria-live", "polite");

  const dialogBackdrop = document.createElement("div");
  dialogBackdrop.className = "facial-mesh-dialog-backdrop";
  dialogBackdrop.hidden = true;
  const dialog = document.createElement("section");
  dialog.className = "facial-mesh-dialog";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const dialogTitle = document.createElement("h3");
  const renameLabel = document.createElement("label");
  renameLabel.textContent = "새 이름";
  const renameInput = document.createElement("input");
  renameInput.type = "text";
  renameInput.required = true;
  renameInput.dataset.meshDialogInput = "";
  renameLabel.append(renameInput);
  const deleteMessage = document.createElement("p");
  const dialogActions = document.createElement("div");
  dialogActions.className = "facial-mesh-dialog__actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.dialogAction = "cancel";
  cancelButton.textContent = "취소";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.dataset.dialogAction = "save";
  saveButton.textContent = "저장";
  dialogActions.append(cancelButton, saveButton);
  dialog.append(dialogTitle, renameLabel, dialogActions);
  dialogBackdrop.append(dialog);

  let dialogMeshId: string | null = null;
  let dialogTrigger: HTMLButtonElement | null = null;
  let dialogSubmitting = false;
  const renameButtonsByMeshId = new Map<string, HTMLButtonElement>();
  let activeMeshButton: HTMLButtonElement | null = null;
  let revealedMeshId: string | null = null;
  let meshActionSequence = 0;
  const syncRevealedActions = (): void => {
    for (const actions of meshList.querySelectorAll<HTMLElement>(".facial-mesh-row__actions")) {
      const revealed = actions.dataset.meshId === revealedMeshId;
      actions.hidden = !revealed;
      actions.closest(".facial-mesh-row")
        ?.querySelector<HTMLButtonElement>(".facial-mesh-row__select")
        ?.setAttribute("aria-expanded", String(revealed));
    }
  };
  const priorInertAttributes = new Map<HTMLElement, string | null>();
  const makeBackgroundInert = (): void => {
    if (priorInertAttributes.size > 0) return;
    for (const sibling of modalRoot.children) {
      if (!(sibling instanceof HTMLElement) || sibling === dialogBackdrop) continue;
      priorInertAttributes.set(sibling, sibling.getAttribute("inert"));
      sibling.setAttribute("inert", "");
    }
  };
  const restoreBackgroundInert = (): void => {
    for (const [sibling, previousValue] of priorInertAttributes) {
      if (previousValue === null) sibling.removeAttribute("inert");
      else sibling.setAttribute("inert", previousValue);
    }
    priorInertAttributes.clear();
  };
  const closeDialog = (restoreFocus = true): void => {
    dialogBackdrop.hidden = true;
    dialog.hidden = true;
    restoreBackgroundInert();
    if (restoreFocus) dialogTrigger?.focus();
    dialogMeshId = null;
    dialogTrigger = null;
  };
  const openRenameDialog = (
    meshId: string,
    meshName: string,
    trigger: HTMLButtonElement,
  ): void => {
    dialogMeshId = meshId;
    dialogTrigger = trigger;
    dialog.dataset.meshDialog = "rename";
    dialog.setAttribute("aria-label", `${meshName} 이름 변경`);
    dialogTitle.textContent = `${meshName} 이름 변경`;
    renameInput.value = meshName;
    renameInput.setCustomValidity("");
    renameInput.removeAttribute("aria-invalid");
    saveButton.dataset.dialogAction = "save";
    saveButton.textContent = "저장";
    saveButton.classList.remove("facial-mesh-dialog__delete");
    dialog.replaceChildren(dialogTitle, renameLabel, dialogActions);
    dialogBackdrop.hidden = false;
    dialog.hidden = false;
    makeBackgroundInert();
    renameInput.focus();
    renameInput.select();
  };
  const openDeleteDialog = (
    meshId: string,
    meshName: string,
    trigger: HTMLButtonElement,
  ): void => {
    dialogMeshId = meshId;
    dialogTrigger = trigger;
    dialog.dataset.meshDialog = "delete";
    dialog.setAttribute("aria-label", `${meshName} 삭제`);
    dialogTitle.textContent = `${meshName} 삭제`;
    deleteMessage.textContent = `${meshName} 메시를 삭제하시겠습니까?`;
    saveButton.dataset.dialogAction = "delete";
    saveButton.textContent = "삭제";
    saveButton.classList.add("facial-mesh-dialog__delete");
    dialog.replaceChildren(dialogTitle, deleteMessage, dialogActions);
    dialogBackdrop.hidden = false;
    dialog.hidden = false;
    makeBackgroundInert();
    cancelButton.focus();
  };
  const handleSave = (): void => {
    if (!dialogMeshId) return;
    if (dialog.dataset.meshDialog === "delete") {
      const meshId = dialogMeshId;
      let succeeded: boolean;
      dialogSubmitting = true;
      try {
        succeeded = callbacks.onDeleteMesh?.(meshId) ?? true;
      } finally {
        dialogSubmitting = false;
      }
      if (!succeeded) {
        saveButton.focus();
        return;
      }
      closeDialog(false);
      activeMeshButton?.focus();
      return;
    }
    const name = renameInput.value.trim();
    if (!name) {
      renameInput.setCustomValidity("이름을 입력하세요.");
      renameInput.setAttribute("aria-invalid", "true");
      renameInput.reportValidity();
      return;
    }
    const meshId = dialogMeshId;
    let succeeded: boolean;
    dialogSubmitting = true;
    try {
      succeeded = callbacks.onRenameMesh(meshId, name);
    } finally {
      dialogSubmitting = false;
    }
    if (!succeeded) {
      renameInput.focus();
      return;
    }
    closeDialog(false);
    renameButtonsByMeshId.get(meshId)?.focus();
  };
  const handleRenameInput = (): void => {
    renameInput.setCustomValidity("");
    renameInput.removeAttribute("aria-invalid");
  };
  const handleCancel = (): void => closeDialog();
  const handleDialogKeydown = (event: KeyboardEvent): void => {
    if (dialogBackdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) => !node.closest("[hidden]") && node.tabIndex >= 0);
    event.preventDefault();
    if (focusable.length === 0) {
      dialog.focus();
      return;
    }
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
      : currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
    focusable[nextIndex]?.focus();
  };
  saveButton.addEventListener("click", handleSave);
  cancelButton.addEventListener("click", handleCancel);
  renameInput.addEventListener("input", handleRenameInput);
  dialogBackdrop.addEventListener("keydown", handleDialogKeydown);

  fileMenu.append(fileHeading, importButton, importInput, textureButton, textureInput, presetSection);
  toolStrip.append(fileMenuToggle, fileMenu, meshDrawerToggle);
  selectionCard.append(heading, selectionSummary, focusButton, selectionAnnouncement);
  meshDrawer.append(meshHeading, duplicateButton, meshList);
  element.append(toolStrip, selectionCard, meshDrawer);
  container.append(element);
  modalRoot.append(dialogBackdrop);

  return {
    element,
    render: (workspace, selectedVertex) => {
      if (!dialogBackdrop.hidden && !dialogSubmitting) closeDialog(false);
      if (revealedMeshId !== workspace.activeMeshId
        || !workspace.meshes.some((mesh) => mesh.id === revealedMeshId && mesh.kind === "copy")) {
        revealedMeshId = null;
      }
      renameButtonsByMeshId.clear();
      activeMeshButton = null;
      const activeMesh = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId);
      focusButton.disabled = selectedVertex === null;
      const positionOffset = selectedVertex === null ? -1 : selectedVertex * 3;
      const coordinates = selectedVertex === null || !activeMesh
        ? null
        : [
            formatCoordinate(activeMesh.geometry.positions[positionOffset]!),
            formatCoordinate(activeMesh.geometry.positions[positionOffset + 1]!),
            formatCoordinate(activeMesh.geometry.positions[positionOffset + 2]!),
          ] as const;
      selectionSummary.textContent = selectedVertex === null || !coordinates
        ? "선택 정점 없음"
        : `정점 ${selectedVertex + 1} · X ${coordinates[0]} · Y ${coordinates[1]} · Z ${coordinates[2]}`;
      selectionAnnouncement.textContent = selectedVertex === null || !activeMesh
        ? "선택된 정점 없음"
        : `정점 ${selectedVertex + 1} 선택됨. 좌표 X ${coordinates![0]}, Y ${coordinates![1]}, Z ${coordinates![2]}`;
      meshList.replaceChildren(...workspace.meshes.map((mesh) => {
        const meshRow = document.createElement("div");
        meshRow.className = "facial-mesh-row";
        const meshButton = document.createElement("button");
        meshButton.type = "button";
        meshButton.dataset.meshId = mesh.id;
        meshButton.textContent = mesh.name;
        meshButton.className = "facial-mesh-row__select";
        const selected = mesh.id === workspace.activeMeshId;
        meshButton.setAttribute("aria-pressed", String(selected));
        if (selected) activeMeshButton = meshButton;
        meshButton.addEventListener("click", () => {
          const restoreLogicalFocus = document.activeElement === meshButton;
          revealedMeshId = selected && mesh.kind === "copy"
            ? revealedMeshId === mesh.id ? null : mesh.id
            : null;
          if (!selected) callbacks.onSelectMesh(mesh.id);
          syncRevealedActions();
          if (restoreLogicalFocus) {
            [...meshList.querySelectorAll<HTMLButtonElement>(".facial-mesh-row__select")]
              .find((candidate) => candidate.dataset.meshId === mesh.id)
              ?.focus();
          }
        });
        meshRow.append(meshButton);
        if (mesh.kind === "copy") {
          const actionGroup = document.createElement("div");
          actionGroup.className = "facial-mesh-row__actions";
          actionGroup.dataset.meshId = mesh.id;
          actionGroup.id = `facial-mesh-actions-${panelId}-${++meshActionSequence}`;
          actionGroup.hidden = revealedMeshId !== mesh.id;
          meshButton.setAttribute("aria-controls", actionGroup.id);
          meshButton.setAttribute("aria-expanded", String(!actionGroup.hidden));
          const createActionButton = (action: string, label: string, path: string): HTMLButtonElement => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "facial-mesh-row__action";
            button.dataset.action = action;
            button.setAttribute("aria-label", label);
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("aria-hidden", "true");
            icon.setAttribute("focusable", "false");
            const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            iconPath.setAttribute("d", path);
            icon.append(iconPath);
            button.append(icon);
            return button;
          };
          const renameButton = createActionButton(
            "rename-mesh",
            `${mesh.name} 이름 변경`,
            "M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Zm16.7-9.7a1 1 0 0 0 0-1.4l-2.1-2.1a1 1 0 0 0-1.4 0L15.5 5l3.5 3.5 1.7-1.7Z",
          );
          renameButton.addEventListener("click", () => {
            openRenameDialog(mesh.id, mesh.name, renameButton);
          });
          renameButtonsByMeshId.set(mesh.id, renameButton);
          const deleteButton = createActionButton(
            "delete-mesh",
            `${mesh.name} 삭제`,
            "M8 19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7H8v12Zm3-9h2v8h-2v-8Zm2.5-6-1-1h-1l-1 1H7v2h10V4h-3.5Z",
          );
          deleteButton.addEventListener("click", () => {
            openDeleteDialog(mesh.id, mesh.name, deleteButton);
          });
          actionGroup.append(renameButton, deleteButton);
          meshRow.append(actionGroup);
        }
        return meshRow;
      }));
    },
    dispose: () => {
      importInput.removeEventListener("change", handleImport);
      importButton.removeEventListener("click", handleImportButton);
      textureInput.removeEventListener("change", handleTexture);
      textureButton.removeEventListener("click", handleTextureButton);
      lunaButton.removeEventListener("click", handleLunaPreset);
      fileMenuToggle.removeEventListener("click", handleFileMenuToggle);
      fileMenuToggle.removeEventListener("keydown", handleFileMenuKeydown);
      fileMenu.removeEventListener("keydown", handleFileMenuKeydown);
      document.removeEventListener("facial:tool-popover-open", handleOtherToolPopover);
      duplicateButton.removeEventListener("click", callbacks.onDuplicate);
      meshDrawerToggle.removeEventListener("click", handleMeshDrawerToggle);
      meshDrawerToggle.removeEventListener("keydown", handleMeshDrawerKeydown);
      meshDrawer.removeEventListener("keydown", handleMeshDrawerKeydown);
      focusButton.removeEventListener("click", handleFocusSelected);
      saveButton.removeEventListener("click", handleSave);
      cancelButton.removeEventListener("click", handleCancel);
      renameInput.removeEventListener("input", handleRenameInput);
      dialogBackdrop.removeEventListener("keydown", handleDialogKeydown);
      restoreBackgroundInert();
      dialogBackdrop.remove();
      element.remove();
    },
  };
}
