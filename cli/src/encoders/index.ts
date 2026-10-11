import { mozjpeg } from './mozjpeg.js';
import { webp } from './webp.js';
import { avif } from './avif.js';
import { jxl } from './jxl.js';
import { wp2 } from './wp2.js';
import { oxipng } from './oxipng.js';
import { qoi } from './qoi.js';
import type { EncoderDef } from './types.js';

/** In the order the app lists them. */
export const encoders: EncoderDef<any>[] = [avif, jxl, mozjpeg, oxipng, qoi, webp, wp2];

/** The app's right-hand panel starts on MozJPEG (see Compress/index.tsx). */
export const defaultEncoderId = mozjpeg.id;

export function findEncoder(id: string): EncoderDef<any> | undefined {
  return encoders.find((e) => e.id === id);
}

export type { EncoderDef };
