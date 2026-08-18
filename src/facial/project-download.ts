export type ProjectDownload = (archive: Uint8Array, filename: string) => void;

export function createProjectDownloader(
  document: Document,
  createObjectURL: (blob: Blob) => string,
  revokeObjectURL: (url: string) => void,
): ProjectDownload {
  return (archive, filename) => {
    const bytes = new Uint8Array(archive).buffer as ArrayBuffer;
    const blob = new Blob([bytes], { type: "application/x-octopoly" });
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      url = createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
    } finally {
      try { anchor?.remove(); } catch { /* preserve the download operation result */ }
      if (url !== undefined) {
        const ownedUrl = url;
        const revoke = (): void => {
          try { revokeObjectURL(ownedUrl); } catch { /* best-effort browser resource cleanup */ }
        };
        try {
          queueMicrotask(revoke);
        } catch {
          revoke();
        }
      }
    }
  };
}
