import { describe, expect, it, vi } from "vitest";

import { createObjDownloader, createProjectDownloader } from "../src/facial/project-download";

describe("OBJ browser download", () => {
  it("downloads UTF-8 OBJ text with the standard MIME type", async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:octopoly-obj");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const download = createObjDownloader(document, createObjectURL, revokeObjectURL);

    download("# OctoPoly\no Base\n", "octopoly-all.obj");

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    expect(await blob.text()).toBe("# OctoPoly\no Base\n");
    expect(click).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:octopoly-obj");
    click.mockRestore();
  });
});

describe(".octopoly browser download", () => {
  it("downloads one ZIP Blob through a temporary anchor and revokes the object URL", async () => {
    const createObjectURL = vi.fn(() => "blob:octopoly-project");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const download = createProjectDownloader(document, createObjectURL, revokeObjectURL);

    download(new Uint8Array([80, 75, 3, 4]), "octopoly-project.octopoly");

    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({
      type: "application/x-octopoly",
    }));
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="octopoly-project.octopoly"]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:octopoly-project");
    click.mockRestore();
  });

  it("revokes immediately without failing when microtask scheduling throws", () => {
    const createObjectURL = vi.fn(() => "blob:octopoly-project");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("queueMicrotask", () => { throw new Error("scheduler failed"); });
    const download = createProjectDownloader(document, createObjectURL, revokeObjectURL);

    try {
      expect(() => download(new Uint8Array([80, 75, 3, 4]), "project.octopoly")).not.toThrow();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:octopoly-project");
    } finally {
      vi.unstubAllGlobals();
      click.mockRestore();
    }
  });

  it("preserves the download error when temporary anchor removal also throws", async () => {
    const clickFailure = new Error("anchor click failed");
    const anchor = {
      href: "", download: "", hidden: false,
      click: () => { throw clickFailure; },
      remove: () => { throw new Error("anchor removal failed"); },
    } as unknown as HTMLAnchorElement;
    const brokenDocument = {
      createElement: vi.fn(() => anchor),
      body: { append: vi.fn() },
    } as unknown as Document;
    const revokeObjectURL = vi.fn();
    const download = createProjectDownloader(brokenDocument, () => "blob:octopoly-project", revokeObjectURL);

    expect(() => download(new Uint8Array([80, 75, 3, 4]), "project.octopoly"))
      .toThrow(clickFailure);
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:octopoly-project");
  });

  it("revokes the object URL when anchor creation fails before append", async () => {
    const createObjectURL = vi.fn(() => "blob:octopoly-project");
    const revokeObjectURL = vi.fn();
    const brokenDocument = {
      createElement: vi.fn(() => { throw new Error("anchor creation failed"); }),
      body: document.body,
    } as unknown as Document;
    const download = createProjectDownloader(brokenDocument, createObjectURL, revokeObjectURL);

    expect(() => download(new Uint8Array([80, 75, 3, 4]), "project.octopoly"))
      .toThrow(/anchor creation failed/);
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:octopoly-project");
  });
});
