import "./styles.css";
import { startCubeViewport } from "./viewport/renderer";
import { mountShell } from "./shell";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("OctoPoly app root was not found.");
}

const { canvas, status } = mountShell(root);

try {
  startCubeViewport(canvas);
  status.textContent = "기본 큐브";
  status.classList.add("status--ready");
} catch (error) {
  status.textContent = error instanceof Error ? error.message : "3D 뷰포트를 시작하지 못했습니다.";
  status.classList.add("status--error");
}
