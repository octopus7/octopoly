export interface WorkspaceElements {
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
  readonly fullscreenToggle: HTMLButtonElement;
}

function attachFullscreenToggle(button: HTMLButtonElement, document: Document): void {
  const target = document.documentElement;
  const supported = typeof target.requestFullscreen === "function"
    && typeof document.exitFullscreen === "function";

  if (!supported) {
    button.hidden = true;
    return;
  }

  const synchronize = (): void => {
    const active = document.fullscreenElement !== null;
    const label = active ? "전체 화면 종료" : "전체 화면으로 전환";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(active));
    button.title = label;
  };

  button.addEventListener("click", () => {
    const operation = document.fullscreenElement
      ? document.exitFullscreen()
      : target.requestFullscreen();
    void operation.catch(synchronize);
  });
  document.addEventListener("fullscreenchange", synchronize);
  synchronize();
}

export function mountShell(root: HTMLElement): WorkspaceElements {
  root.innerHTML = `
    <main class="workspace" aria-labelledby="octopoly-title">
      <h1 id="octopoly-title" class="visually-hidden">OctoPoly</h1>
      <section class="viewport" aria-label="3D viewport">
        <canvas aria-label="기본 큐브가 있는 3D 뷰포트"></canvas>
        <img class="wordmark" src="/assets/octopoly-wordmark.png" alt="" draggable="false" />
        <p class="controls">드래그: 회전 · 휠/핀치: 줌</p>
        <div class="viewport-actions">
          <p class="status" role="status" aria-live="polite">3D 뷰포트 준비 중…</p>
          <button class="fullscreen-toggle" type="button" aria-label="전체 화면으로 전환" aria-pressed="false" title="전체 화면으로 전환">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
            </svg>
          </button>
        </div>
      </section>
    </main>
  `;

  const canvas = root.querySelector("canvas");
  const status = root.querySelector<HTMLElement>(".status");
  const fullscreenToggle = root.querySelector<HTMLButtonElement>(".fullscreen-toggle");
  if (!(canvas instanceof HTMLCanvasElement) || !status || !fullscreenToggle) {
    throw new Error("OctoPoly workspace could not be created.");
  }

  attachFullscreenToggle(fullscreenToggle, root.ownerDocument);
  return { canvas, status, fullscreenToggle };
}
