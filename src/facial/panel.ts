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
  readonly onRenameMesh: (meshId: string, name: string) => void;
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

  const meshList = document.createElement("section");
  meshList.className = "facial-mesh-list";
  meshList.setAttribute("aria-label", "메시 목록");

  const selectionAnnouncement = document.createElement("p");
  selectionAnnouncement.className = "visually-hidden facial-selection-status";
  selectionAnnouncement.setAttribute("aria-live", "polite");

  element.append(heading, importInput, duplicateButton, meshList, selectionAnnouncement);
  container.append(element);

  return {
    element,
    render: (workspace, selectedVertex) => {
      const activeMesh = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId);
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
        meshButton.setAttribute("aria-pressed", String(mesh.id === workspace.activeMeshId));
        meshButton.addEventListener("click", () => callbacks.onSelectMesh(mesh.id));
        meshRow.append(meshButton);
        if (mesh.kind === "copy") {
          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.value = mesh.name;
          nameInput.dataset.renameMeshId = mesh.id;
          nameInput.setAttribute("aria-label", `${mesh.name} 이름`);
          nameInput.addEventListener("change", () => {
            if (!nameInput.value.trim()) {
              nameInput.value = mesh.name;
              return;
            }
            callbacks.onRenameMesh(mesh.id, nameInput.value);
          });
          meshRow.append(nameInput);
        }
        return meshRow;
      }));
    },
    dispose: () => {
      importInput.removeEventListener("change", handleImport);
      duplicateButton.removeEventListener("click", callbacks.onDuplicate);
      element.remove();
    },
  };
}
