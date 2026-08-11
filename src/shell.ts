export function mountShell(root: HTMLElement): void {
  root.innerHTML = `
    <main class="shell" aria-labelledby="octopoly-title">
      <p class="eyebrow">REBUILD BASELINE</p>
      <h1 id="octopoly-title">OctoPoly</h1>
      <p class="summary">하나씩 다시 쌓아 올리는 리토폴로지 워크스페이스.</p>
    </main>
  `;
}

