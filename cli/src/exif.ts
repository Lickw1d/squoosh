/**
 * Browsers rotate/flip JPEGs according to their EXIF Orientation tag when
 * decoding (createImageBitmap / <img>), so images the app compresses come out
 * upright. MozJPEG's decoder ignores EXIF, so the CLI applies it here.
 */
import { RawImage } from './image.js';

/** Returns the EXIF Orientation (1-8) of a JPEG, or 1 if absent. */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    // Start of scan: no more metadata segments.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return 1;
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= view.byteLength) {
      // "Exif\0\0"
      if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
        return readTiffOrientation(view, offset + 10, offset + 2 + length);
      }
    }
    offset += 2 + length;
  }
  return 1;
}

function readTiffOrientation(view: DataView, tiffStart: number, end: number): number {
  try {
    const byteOrder = view.getUint16(tiffStart);
    const little = byteOrder === 0x4949;
    if (!little && byteOrder !== 0x4d4d) return 1;
    const ifdOffset = view.getUint32(tiffStart + 4, little);
    const ifdStart = tiffStart + ifdOffset;
    const entries = view.getUint16(ifdStart, little);
    for (let i = 0; i < entries; i++) {
      const entry = ifdStart + 2 + i * 12;
      if (entry + 12 > end) break;
      if (view.getUint16(entry, little) === 0x0112) {
        const value = view.getUint16(entry + 8, little);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
  } catch {
    // Malformed EXIF: treat as no orientation.
  }
  return 1;
}

/** Applies an EXIF orientation so the result is displayed upright. */
export function applyExifOrientation(image: RawImage, orientation: number): RawImage {
  if (orientation <= 1 || orientation > 8) return image;

  const { width: w, height: h } = image;
  const swap = orientation >= 5;
  const outW = swap ? h : w;
  const outH = swap ? w : h;
  const src = new Uint32Array(image.data.buffer, image.data.byteOffset, w * h);
  const dst = new Uint32Array(outW * outH);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx: number;
      let dy: number;
      switch (orientation) {
        case 2: dx = w - 1 - x; dy = y; break; // mirror horizontal
        case 3: dx = w - 1 - x; dy = h - 1 - y; break; // rotate 180
        case 4: dx = x; dy = h - 1 - y; break; // mirror vertical
        case 5: dx = y; dy = x; break; // transpose
        case 6: dx = h - 1 - y; dy = x; break; // rotate 90 CW
        case 7: dx = h - 1 - y; dy = w - 1 - x; break; // transverse
        case 8: dx = y; dy = w - 1 - x; break; // rotate 90 CCW
        default: dx = x; dy = y;
      }
      dst[dy * outW + dx] = src[y * w + x];
    }
  }
  return new RawImage(new Uint8ClampedArray(dst.buffer), outW, outH);
}
