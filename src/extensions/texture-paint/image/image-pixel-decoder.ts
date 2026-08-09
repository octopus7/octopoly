import type { ImageAssetRef } from "@octopoly/contracts";

export interface TextureImagePixelDecoder {
  /** Returns a tightly packed premultiplied RGBA8 buffer. */
  decode(bitmap: ImageBitmap, ref: ImageAssetRef): Promise<Uint8ClampedArray>;
}

function premultiply(source: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(source.length);
  for (let index = 0; index < source.length; index += 4) {
    const alpha = source[index + 3] ?? 0;
    result[index] = Math.round(((source[index] ?? 0) * alpha) / 255);
    result[index + 1] = Math.round(((source[index + 1] ?? 0) * alpha) / 255);
    result[index + 2] = Math.round(((source[index + 2] ?? 0) * alpha) / 255);
    result[index + 3] = alpha;
  }
  return result;
}

/** Browser decoder. Tests without Canvas must inject an explicit decoder. */
export class BrowserTextureImagePixelDecoder implements TextureImagePixelDecoder {
  async decode(bitmap: ImageBitmap, ref: ImageAssetRef): Promise<Uint8ClampedArray> {
    if (typeof ImageBitmap === "undefined") {
      throw new Error("ImageBitmap decoding is unavailable in this environment");
    }

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(ref.width, ref.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context !== null) {
        context.drawImage(bitmap, 0, 0, ref.width, ref.height);
        return premultiply(context.getImageData(0, 0, ref.width, ref.height).data);
      }
    }

    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = ref.width;
      canvas.height = ref.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context !== null) {
        context.drawImage(bitmap, 0, 0, ref.width, ref.height);
        return premultiply(context.getImageData(0, 0, ref.width, ref.height).data);
      }
    }

    throw new Error("A readable 2D canvas is required to decode texture paint pixels");
  }
}
