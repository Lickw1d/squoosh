// Mirrors src/features/processors/resize (client Options + worker).
import {
  defaultOptions as metaDefaults,
  workerResizeMethods,
  WorkerResizeOptions,
} from '../../../src/features/processors/resize/shared/meta.js';
import { getContainOffsets } from '../../../src/features/processors/resize/shared/util.js';
import { loadWasmBindgen } from '../codecs.js';
import { RawImage } from '../image.js';
import type { OptionDef, Values } from '../options.js';

const d = metaDefaults as WorkerResizeOptions;

// The app's size presets (Resize Options component).
const sizePresets = [0.25, 0.3333, 0.5, 1, 2, 3, 4];

const methodLabels: Record<string, string> = {
  lanczos3: 'Lanczos3',
  mitchell: 'Mitchell',
  catrom: 'Catmull-Rom',
  triangle: 'Triangle (bilinear)',
  hqx: 'hqx (pixel art)',
};
// Listed in the same order as the app's Method select.
const methodOrder = ['lanczos3', 'mitchell', 'catrom', 'triangle', 'hqx'];

export const resizeOptions: OptionDef[] = [
  {
    flag: 'resize', uiLabel: 'Resize', kind: 'boolean', default: false,
    description: 'Turned on automatically by any other resize option.',
  },
  {
    flag: 'resize-method', uiLabel: 'Method', kind: 'enum',
    choices: methodOrder
      .filter((m) => (workerResizeMethods as string[]).includes(m))
      .map((m) => ({ token: m, uiLabel: methodLabels[m], value: m })),
    defaultValue: d.method,
  },
  {
    flag: 'resize-preset', uiLabel: 'Preset', kind: 'enum',
    description: 'Percentage of the source size. Use instead of width/height.',
    choices: sizePresets.map((p) => ({
      token: String(Math.round(p * 10000) / 100),
      uiLabel: `${p * 100}%`,
      value: p,
    })),
    // No preset is applied unless asked for; the app starts at 100%.
    defaultValue: 1,
    defaultText: 'none (source size)',
  },
  {
    flag: 'resize-width', uiLabel: 'Width', kind: 'number', min: 1, max: Infinity, step: 1,
    rangeText: 'pixels', description: 'Whole number, 1 or more.', defaultText: 'source width',
  },
  {
    flag: 'resize-height', uiLabel: 'Height', kind: 'number', min: 1, max: Infinity, step: 1,
    rangeText: 'pixels', description: 'Whole number, 1 or more.', defaultText: 'source height',
  },
  { flag: 'premultiply', uiLabel: 'Premultiply alpha channel', kind: 'boolean', default: d.premultiply },
  { flag: 'linear-rgb', uiLabel: 'Linear RGB', kind: 'boolean', default: d.linearRGB },
  {
    flag: 'maintain-aspect', uiLabel: 'Maintain aspect ratio', kind: 'boolean', default: true,
    description: 'With one of width/height, the other is calculated.',
  },
  {
    flag: 'fit-method', uiLabel: 'Fit method', kind: 'enum',
    choices: [
      { token: 'stretch', uiLabel: 'Stretch', value: 'stretch' },
      { token: 'contain', uiLabel: 'Contain', value: 'contain' },
    ],
    defaultValue: d.fitMethod,
    when: { describe: '--no-maintain-aspect', test: (v) => !v.bool('maintain-aspect') },
  },
];

const resizeFlags = resizeOptions.map((o) => o.flag);

export function resizeEnabled(v: Values): boolean {
  return v.bool('resize') || resizeFlags.some((f) => f !== 'resize' && v.provided(f));
}

export function validateResize(v: Values): string[] {
  const errors: string[] = [];
  if (v.provided('resize') && !v.bool('resize') && resizeFlags.some((f) => f !== 'resize' && v.provided(f))) {
    errors.push('--no-resize conflicts with the other resize options you passed.');
  }
  const hasW = v.provided('resize-width');
  const hasH = v.provided('resize-height');
  if (v.provided('resize-preset') && (hasW || hasH)) {
    errors.push('Use either --resize-preset or --resize-width/--resize-height, not both.');
  }
  if (v.bool('maintain-aspect') && hasW && hasH) {
    errors.push(
      'With aspect ratio maintained, pass only one of --resize-width/--resize-height (or add --no-maintain-aspect).',
    );
  }
  return errors;
}

/**
 * Works out the target size the way the app's Resize panel does, for an
 * image of the given (post-rotation) size.
 */
export function resizeSettings(v: Values, srcWidth: number, srcHeight: number): WorkerResizeOptions {
  const aspect = srcWidth / srcHeight;
  let width = srcWidth;
  let height = srcHeight;

  if (v.provided('resize-preset')) {
    const p = v.enumValue<number>('resize-preset');
    width = Math.round(srcWidth * p);
    height = Math.round(srcHeight * p);
  } else if (v.bool('maintain-aspect')) {
    const w = v.optNum('resize-width');
    const h = v.optNum('resize-height');
    if (w !== undefined) {
      width = w;
      height = Math.round(w / aspect);
    } else if (h !== undefined) {
      height = h;
      width = Math.round(h * aspect);
    }
  } else {
    width = v.optNum('resize-width') ?? srcWidth;
    height = v.optNum('resize-height') ?? srcHeight;
  }

  if (width < 1 || height < 1) {
    throw new Error(
      `Resizing ${srcWidth}x${srcHeight} gives ${width}x${height}, which is too small.`,
    );
  }

  return {
    width,
    height,
    method: v.enumValue('resize-method'),
    fitMethod: v.bool('maintain-aspect') ? d.fitMethod : v.enumValue('fit-method'),
    premultiply: v.bool('premultiply'),
    linearRGB: v.bool('linear-rgb'),
  };
}

// ---- Worker logic: same steps as features/processors/resize/worker/resize.ts

function crop(data: RawImage, sx: number, sy: number, sw: number, sh: number): RawImage {
  const inputPixels = new Uint32Array(data.data.slice().buffer);
  for (let y = 0; y < sh; y += 1) {
    const start = (y + sy) * data.width + sx;
    inputPixels.copyWithin(y * sw, start, start + sw);
  }
  return new RawImage(new Uint8ClampedArray(inputPixels.buffer.slice(0, sw * sh * 4)), sw, sh);
}

const resizeMethods: WorkerResizeOptions['method'][] = ['triangle', 'catrom', 'mitchell', 'lanczos3'];

async function hqx(input: RawImage, opts: WorkerResizeOptions): Promise<RawImage> {
  const { resize: wasmHqx } = await loadWasmBindgen('hqx/pkg', 'squooshhqx');
  const ratio = Math.max(opts.width / input.width, opts.height / input.height);
  const factor = Math.min(Math.max(Math.ceil(ratio), 1), 4);
  if (factor === 1) return input;
  const result: Uint32Array = wasmHqx(
    new Uint32Array(input.data.slice().buffer),
    input.width,
    input.height,
    factor,
  );
  return new RawImage(
    new Uint8ClampedArray(result.buffer, result.byteOffset, result.byteLength),
    input.width * factor,
    input.height * factor,
  );
}

export async function resize(data: RawImage, opts: WorkerResizeOptions): Promise<RawImage> {
  let input = data;

  if (opts.method === 'hqx') {
    input = await hqx(input, opts);
    // Regular resize to make up the difference.
    opts = { ...opts, method: 'catrom' };
  }

  const { resize: wasmResize } = await loadWasmBindgen('resize/pkg', 'squoosh_resize');

  if (opts.fitMethod === 'contain') {
    // Like the app, offsets are computed from the original image size.
    const { sx, sy, sw, sh } = getContainOffsets(data.width, data.height, opts.width, opts.height);
    input = crop(input, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh));
  }

  const result: Uint8Array = wasmResize(
    new Uint8Array(input.data.buffer, input.data.byteOffset, input.data.byteLength),
    input.width,
    input.height,
    opts.width,
    opts.height,
    resizeMethods.indexOf(opts.method),
    opts.premultiply,
    opts.linearRGB,
  );

  return new RawImage(
    new Uint8ClampedArray(result.buffer, result.byteOffset, result.byteLength),
    opts.width,
    opts.height,
  );
}
