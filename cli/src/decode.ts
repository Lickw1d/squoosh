/**
 * Input decoding. The app sniffs the file's magic bytes, then uses the
 * browser's decoder when it can and a wasm decoder otherwise
 * (Compress/index.tsx decodeImage). Node has no built-in image decoding, so:
 *
 *   JPEG -> MozJPEG decoder (+ EXIF orientation, which browsers apply)
 *   PNG  -> Rust png crate
 *   WebP, AVIF, JPEG XL, WebP2, QOI -> the same wasm decoders the app uses
 *
 * GIF, BMP, TIFF and SVG decode only in the browser.
 */
import { loadEmscripten, loadWasmBindgen } from './codecs.js';
import { RawImage, toRawImage } from './image.js';
import { applyExifOrientation, readJpegOrientation } from './exif.js';

// Same table as sniffMimeType in src/client/lazy-app/util/index.ts.
const magicNumberMap: [RegExp, string][] = [
  [/^%PDF-/, 'application/pdf'],
  [/^GIF87a/, 'image/gif'],
  [/^GIF89a/, 'image/gif'],
  [/^\x89PNG\x0D\x0A\x1A\x0A/, 'image/png'],
  [/^\xFF\xD8\xFF/, 'image/jpeg'],
  [/^BM/, 'image/bmp'],
  [/^I I/, 'image/tiff'],
  [/^II*/, 'image/tiff'],
  [/^MM\x00*/, 'image/tiff'],
  [/^RIFF....WEBPVP8[LX ]/s, 'image/webp'],
  [/^\xF4\xFF\x6F/, 'image/webp2'],
  [/^\x00\x00\x00 ftypavif\x00\x00\x00\x00/, 'image/avif'],
  [/^\xff\x0a/, 'image/jxl'],
  [/^\x00\x00\x00\x0cJXL \x0d\x0a\x87\x0a/, 'image/jxl'],
  [/^qoif/, 'image/qoi'],
];

export function sniffMimeType(bytes: Uint8Array): string {
  const firstChars = String.fromCharCode(...bytes.subarray(0, 16));
  for (const [detector, mimeType] of magicNumberMap) {
    if (detector.test(firstChars)) return mimeType;
  }
  // SVG has no magic number; the app routes it by the file's MIME type.
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml';
  }
  return '';
}

export const supportedInputs = ['JPEG', 'PNG', 'WebP', 'AVIF', 'JPEG XL', 'WebP2', 'QOI'];
export const browserOnlyInputs = ['GIF', 'BMP', 'TIFF', 'SVG'];

const browserOnlyNames: Record<string, string> = {
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/tiff': 'TIFF',
  'image/svg+xml': 'SVG',
};

export class DecodeError extends Error {}

async function emscriptenDecode(base: string, bytes: Uint8Array): Promise<RawImage> {
  const module = await loadEmscripten(base);
  const result = module.decode(bytes);
  if (!result) throw new DecodeError('Decoding error');
  // Copy out of the wasm heap.
  return new RawImage(new Uint8ClampedArray(result.data), result.width, result.height);
}

export async function decodeImage(bytes: Uint8Array): Promise<RawImage> {
  const mimeType = sniffMimeType(bytes);

  switch (mimeType) {
    case 'image/jpeg': {
      const image = await emscriptenDecode('mozjpeg/dec/mozjpeg_node_dec', bytes);
      return applyExifOrientation(image, readJpegOrientation(bytes));
    }
    case 'image/png': {
      const { decode } = await loadWasmBindgen('png/pkg', 'squoosh_png');
      return toRawImage(decode(bytes));
    }
    case 'image/webp':
      return emscriptenDecode('webp/dec/webp_dec', bytes);
    case 'image/avif':
      return emscriptenDecode('avif/dec/avif_dec', bytes);
    case 'image/jxl':
      return emscriptenDecode('jxl/dec/jxl_dec', bytes);
    case 'image/webp2':
      return emscriptenDecode('wp2/dec/wp2_dec', bytes);
    case 'image/qoi':
      return emscriptenDecode('qoi/dec/qoi_dec', bytes);
  }

  if (browserOnlyNames[mimeType]) {
    throw new DecodeError(
      `${browserOnlyNames[mimeType]} input is only supported in the web app (it uses the browser's decoder).`,
    );
  }
  throw new DecodeError(
    `Unrecognised image format. Supported inputs: ${supportedInputs.join(', ')}.`,
  );
}
