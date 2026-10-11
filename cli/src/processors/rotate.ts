// Mirrors src/features/preprocessors/rotate (the app's rotate button).
import {
  defaultOptions as d,
  Options,
} from '../../../src/features/preprocessors/rotate/shared/meta.js';
import { loadRawWasm } from '../codecs.js';
import { RawImage } from '../image.js';
import type { OptionDef, Values } from '../options.js';

export const rotateOptions: OptionDef[] = [
  {
    flag: 'rotate', uiLabel: 'Rotate', kind: 'enum',
    description: 'Degrees clockwise.',
    choices: [0, 90, 180, 270].map((deg) => ({ token: String(deg), uiLabel: `${deg}`, value: deg })),
    defaultValue: d.rotate,
  },
];

export function rotateSettings(v: Values): Options {
  return { rotate: v.enumValue<Options['rotate']>('rotate') };
}

interface RotateExports {
  memory: WebAssembly.Memory;
  rotate(width: number, height: number, rotate: 0 | 90 | 180 | 270): void;
}

// Same steps as features/preprocessors/rotate/worker/rotate.ts.
export async function rotate(data: RawImage, opts: Options): Promise<RawImage> {
  if (opts.rotate === 0) return data;
  const instance = await loadRawWasm('rotate/rotate.wasm');
  const exports = instance.exports as unknown as RotateExports;

  const bytesPerImage = data.width * data.height * 4;
  const numPagesNeeded = Math.ceil((bytesPerImage * 2 + 8) / (64 * 1024));
  const numPagesAvailable = Math.floor(exports.memory.buffer.byteLength / (64 * 1024));
  const additionalPagesToAllocate = numPagesNeeded - numPagesAvailable;
  if (additionalPagesToAllocate > 0) exports.memory.grow(additionalPagesToAllocate);

  const view = new Uint8ClampedArray(exports.memory.buffer);
  view.set(data.data, 8);
  exports.rotate(data.width, data.height, opts.rotate);

  const flipDimensions = opts.rotate % 180 !== 0;
  return new RawImage(
    view.slice(bytesPerImage + 8, bytesPerImage * 2 + 8),
    flipDimensions ? data.height : data.width,
    flipDimensions ? data.width : data.height,
  );
}
