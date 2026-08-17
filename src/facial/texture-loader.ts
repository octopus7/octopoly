export type CreateImageBitmapLike = (source: ImageBitmapSource) => Promise<ImageBitmap>;

export function createTextureImageDecoder(
  createImageBitmap: CreateImageBitmapLike,
): (file: File) => Promise<ImageBitmap> {
  return (file) => createImageBitmap(file);
}
