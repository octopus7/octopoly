export interface DecodedImagePixels {
  readonly width: number;
  readonly height: number;
  readonly rgba8Premultiplied: Uint8ClampedArray;
}

export interface ImagePixelCodec {
  decode(source: Blob): Promise<DecodedImagePixels>;
  createBitmap(image: DecodedImagePixels): Promise<ImageBitmap>;
}

function premultiply(source: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(source);
  for (let index = 0; index < result.length; index += 4) {
    const alpha = result[index + 3]! / 255;
    result[index] = Math.round(result[index]! * alpha);
    result[index + 1] = Math.round(result[index + 1]! * alpha);
    result[index + 2] = Math.round(result[index + 2]! * alpha);
  }
  return result;
}

function unpremultiply(source: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(source);
  for (let index = 0; index < result.length; index += 4) {
    const alpha = result[index + 3]!;
    if (alpha === 0) {
      result[index] = 0;
      result[index + 1] = 0;
      result[index + 2] = 0;
    } else {
      result[index] = Math.round(result[index]! * 255 / alpha);
      result[index + 1] = Math.round(result[index + 1]! * 255 / alpha);
      result[index + 2] = Math.round(result[index + 2]! * 255 / alpha);
    }
  }
  return result;
}

function canvas2d(width: number, height: number): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    if (context) return context;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) return context;
  }
  throw new Error("A 2D canvas is required to decode editable images");
}

export const browserImagePixelCodec: ImagePixelCodec = Object.freeze({
  async decode(source: Blob): Promise<DecodedImagePixels> {
    if (typeof createImageBitmap !== "function") throw new Error("createImageBitmap is not available");
    const bitmap = await createImageBitmap(source);
    try {
      if (bitmap.width <= 0 || bitmap.height <= 0) throw new TypeError("Image dimensions must be positive");
      const context = canvas2d(bitmap.width, bitmap.height);
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: bitmap.width, height: bitmap.height, rgba8Premultiplied: premultiply(image.data) };
    } finally {
      bitmap.close();
    }
  },

  async createBitmap(image: DecodedImagePixels): Promise<ImageBitmap> {
    if (typeof createImageBitmap !== "function" || typeof ImageData === "undefined") {
      throw new Error("ImageBitmap creation is not available");
    }
    const unpacked = unpremultiply(image.rgba8Premultiplied);
    const pixels = new Uint8ClampedArray(new ArrayBuffer(unpacked.byteLength));
    pixels.set(unpacked);
    return createImageBitmap(new ImageData(pixels, image.width, image.height));
  },
});
