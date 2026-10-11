// Mirrors src/features/processors/quantize ("Reduce palette" in the app).
import {
  defaultOptions as d,
  Options,
} from '../../../src/features/processors/quantize/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import { RawImage } from '../image.js';
import type { OptionDef, Values } from '../options.js';

export const quantizeOptions: OptionDef[] = [
  {
    flag: 'reduce-palette', uiLabel: 'Reduce palette', kind: 'boolean', default: false,
    description: 'Turned on automatically by any other palette option.',
  },
  {
    flag: 'palette-type', uiLabel: 'Type', kind: 'enum',
    description: 'Hidden in the app until unlocked with the Konami code.',
    choices: [
      { token: 'standard', uiLabel: 'Standard', value: 0 },
      { token: 'zx', uiLabel: 'ZX', value: 1 },
    ],
    defaultValue: d.zx,
  },
  {
    flag: 'colors', uiLabel: 'Colors', kind: 'number', min: 2, max: 256, step: 1, default: d.maxNumColors,
    when: { describe: '--palette-type standard', test: (v) => v.enumValue('palette-type') === 0 },
  },
  { flag: 'dithering', uiLabel: 'Dithering', kind: 'number', min: 0, max: 1, step: 0.01, default: d.dither },
];

const quantizeFlags = quantizeOptions.map((o) => o.flag);

export function quantizeEnabled(v: Values): boolean {
  return v.bool('reduce-palette') || quantizeFlags.some((f) => f !== 'reduce-palette' && v.provided(f));
}

export function validateQuantize(v: Values): string[] {
  if (
    v.provided('reduce-palette') &&
    !v.bool('reduce-palette') &&
    quantizeFlags.some((f) => f !== 'reduce-palette' && v.provided(f))
  ) {
    return ['--no-reduce-palette conflicts with the other palette options you passed.'];
  }
  return [];
}

export function quantizeSettings(v: Values): Options {
  return {
    zx: v.enumValue<number>('palette-type'),
    maxNumColors: v.num('colors'),
    dither: v.num('dithering'),
  };
}

// Same as features/processors/quantize/worker/quantize.ts.
export async function quantize(data: RawImage, opts: Options): Promise<RawImage> {
  const module = await loadEmscripten('imagequant/imagequant');
  const result: Uint8ClampedArray = opts.zx
    ? module.zx_quantize(data.data, data.width, data.height, opts.dither)
    : module.quantize(data.data, data.width, data.height, opts.maxNumColors, opts.dither);
  // Copy out of the wasm heap; the next call may reuse that memory.
  return new RawImage(new Uint8ClampedArray(result), data.width, data.height);
}
