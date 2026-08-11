export interface WorkspaceElements {
  readonly canvas: HTMLCanvasElement;
  readonly status: HTMLElement;
}

export function mountShell(root: HTMLElement): WorkspaceElements {
  root.innerHTML = `
    <main class="workspace" aria-labelledby="octopoly-title">
      <h1 id="octopoly-title" class="visually-hidden">OctoPoly</h1>
      <section class="viewport" aria-label="3D viewport">
        <canvas aria-label="기본 큐브가 있는 3D 뷰포트"></canvas>
        <img class="wordmark" src="/assets/octopoly-wordmark.png" alt="" draggable="false" />
        <p class="controls">드래그: 회전 · 휠/핀치: 줌</p>
        <p class="status" role="status" aria-live="polite">3D 뷰포트 준비 중…</p>
      </section>
    </main>
  `;

  const canvas = root.querySelector("canvas");
  const status = root.querySelector<HTMLElement>(".status");
  if (!(canvas instanceof HTMLCanvasElement) || !status) {
    throw new Error("OctoPoly workspace could not be created.");
  }

  return { canvas, status };
}
