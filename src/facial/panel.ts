import type { FacialWorkspace } from "./workspace";

function formatCoordinate(value: number): string {
  const absolute = Math.abs(value);
  return absolute !== 0 && (absolute < 0.000_001 || absolute >= 1_000_000_000)
    ? value.toExponential(6)
    : value.toFixed(6);
}

export interface FacialPanelCallbacks {
  readonly onImport: (file: File) => void;
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
  const modalRoot = container.closest<HTMLElement>(".viewport") ?? container;
  const element = document.createElement("aside");
  element.className = "facial-panel";
  element.setAttribute("aria-label", "페이셜 작업");

  const heading = document.createElement("h2");
  heading.textContent = "페이셜 작업";

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".obj,model/obj,text/plain";
  importInput.setAttribute("aria-label", "OBJ 가져오기");
  const handleImport = (): void => {
    const file = importInput.files?.[0];
    try {
      if (file) callbacks.onImport(file);
    } finally {
      importInput.value = "";
    }
  };
  importInput.addEventListener("change", handleImport);

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

  element.append(
    heading,
    importInput,
    duplicateButton,
    focusButton,
    meshList,
    selectionAnnouncement,
  );
  container.append(element);
  modalRoot.append(dialogBackdrop);

  return {
    element,
    render: (workspace, selectedVertex) => {
      if (!dialogBackdrop.hidden && !dialogSubmitting) closeDialog(false);
      renameButtonsByMeshId.clear();
      activeMeshButton = null;
      const activeMesh = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId);
      focusButton.disabled = selectedVertex === null;
      const positionOffset = selectedVertex === null ? -1 : selectedVertex * 3;
      selectionAnnouncement.textContent = selectedVertex === null || !activeMesh
        ? "선택된 정점 없음"
        : `정점 ${selectedVertex + 1} 선택됨. 좌표 X ${formatCoordinate(activeMesh.geometry.positions[positionOffset]!)}, Y ${formatCoordinate(activeMesh.geometry.positions[positionOffset + 1]!)}, Z ${formatCoordinate(activeMesh.geometry.positions[positionOffset + 2]!)}`;
      meshList.replaceChildren(...workspace.meshes.map((mesh) => {
        const meshRow = document.createElement("div");
        meshRow.className = "facial-mesh-row";
        const meshButton = document.createElement("button");
        meshButton.type = "button";
        meshButton.dataset.meshId = mesh.id;
        meshButton.textContent = mesh.name;
        meshButton.className = "facial-mesh-row__select";
        meshButton.setAttribute("aria-pressed", String(mesh.id === workspace.activeMeshId));
        if (mesh.id === workspace.activeMeshId) activeMeshButton = meshButton;
        meshButton.addEventListener("click", () => callbacks.onSelectMesh(mesh.id));
        meshRow.append(meshButton);
        if (mesh.kind === "copy") {
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
          meshRow.append(renameButton, deleteButton);
        }
        return meshRow;
      }));
    },
    dispose: () => {
      importInput.removeEventListener("change", handleImport);
      duplicateButton.removeEventListener("click", callbacks.onDuplicate);
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
