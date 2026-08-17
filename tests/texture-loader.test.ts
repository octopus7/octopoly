import { describe, expect, it, vi } from "vitest";

import { createTextureImageDecoder } from "../src/facial/texture-loader";

describe("texture image decoder", () => {
  it("decodes the selected File directly without creating an object URL", async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmap = vi.fn(async () => bitmap);
    const decode = createTextureImageDecoder(createImageBitmap);
    const file = new File([new Uint8Array([1, 2, 3])], "surface.png", { type: "image/png" });

    await expect(decode(file)).resolves.toBe(bitmap);
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(file);
  });
});
