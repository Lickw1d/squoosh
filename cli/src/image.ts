/**
 * Node has no ImageData. This is the minimal shape the codecs read and
 * create: RGBA pixels, 4 bytes per pixel, row-major.
 */
export class RawImage {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

/** Wraps whatever pixel container a codec returned as a RawImage. */
export function toRawImage(img: {
  data: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset?: number; byteLength?: number };
  width: number;
  height: number;
}): RawImage {
  const src = img.data as Uint8Array;
  const data =
    src instanceof Uint8ClampedArray
      ? src
      : new Uint8ClampedArray(src.buffer, src.byteOffset, src.byteLength);
  return new RawImage(data, img.width, img.height);
}
