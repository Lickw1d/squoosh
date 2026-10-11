// Mirrors src/features/encoders/avif/client/index.tsx
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  AVIFTune,
  EncodeOptions,
} from '../../../src/features/encoders/avif/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import type { Values } from '../options.js';
import type { EncoderDef } from './types.js';

// From the AVIF Options component: quality 100 means lossless (a separate
// checkbox), and the UI shows "effort" where effort = 10 - speed.
const MAX_QUALITY = 100;
const MAX_EFFORT = 10;

// Same derivation as the component's getDerivedStateFromProps, applied to
// the meta defaults.
const defaultLossless =
  d.quality === MAX_QUALITY &&
  (d.qualityAlpha == -1 || d.qualityAlpha == MAX_QUALITY) &&
  d.subsample == 3;
const defaultSeparateAlpha = d.qualityAlpha !== -1;

const lossy = { describe: 'lossy mode (--no-lossless)', test: (v: Values) => !v.bool('lossless') };

export const avif: EncoderDef<EncodeOptions> = {
  id: 'avif',
  label,
  mimeType,
  extension,
  options: [
    { flag: 'lossless', uiLabel: 'Lossless', kind: 'boolean', default: defaultLossless },
    { flag: 'quality', uiLabel: 'Quality', kind: 'number', min: 0, max: MAX_QUALITY - 1, step: 1, default: d.quality, when: lossy },
    {
      flag: 'subsample-chroma', uiLabel: 'Subsample chroma', kind: 'enum', advanced: true, when: lossy,
      choices: [
        { token: '400', uiLabel: '4:0:0', value: 0 },
        { token: '420', uiLabel: '4:2:0', value: 1 },
        { token: '422', uiLabel: '4:2:2', value: 2 },
        { token: '444', uiLabel: '4:4:4', value: 3 },
      ],
      defaultValue: d.subsample,
    },
    {
      flag: 'sharp-yuv', uiLabel: 'Sharp YUV Downsampling', kind: 'boolean', advanced: true, default: d.enableSharpYUV,
      when: { describe: 'lossy mode and --subsample-chroma 420', test: (v) => lossy.test(v) && v.enumValue('subsample-chroma') === 1 },
    },
    { flag: 'separate-alpha', uiLabel: 'Separate alpha quality', kind: 'boolean', advanced: true, default: defaultSeparateAlpha, when: lossy },
    {
      flag: 'alpha-quality', uiLabel: 'Alpha quality', kind: 'number', advanced: true, min: 0, max: MAX_QUALITY - 1, step: 1,
      default: defaultSeparateAlpha ? d.qualityAlpha : d.quality,
      when: { describe: 'lossy mode and --separate-alpha', test: (v) => lossy.test(v) && v.bool('separate-alpha') },
    },
    { flag: 'extra-chroma-compression', uiLabel: 'Extra chroma compression', kind: 'boolean', advanced: true, default: d.chromaDeltaQ, when: lossy },
    { flag: 'sharpness', uiLabel: 'Sharpness', kind: 'number', advanced: true, min: 0, max: 7, step: 1, default: d.sharpness, when: lossy },
    { flag: 'noise-synthesis', uiLabel: 'Noise synthesis', kind: 'number', advanced: true, min: 0, max: 50, step: 1, default: d.denoiseLevel, when: lossy },
    {
      flag: 'tuning', uiLabel: 'Tuning', kind: 'enum', advanced: true, when: lossy,
      choices: [
        { token: 'auto', uiLabel: 'Auto', value: AVIFTune.auto },
        { token: 'psnr', uiLabel: 'PSNR', value: AVIFTune.psnr },
        { token: 'ssim', uiLabel: 'SSIM', value: AVIFTune.ssim },
      ],
      defaultValue: d.tune,
    },
    { flag: 'tile-rows-log2', uiLabel: 'Log2 of tile rows', kind: 'number', advanced: true, min: 0, max: 6, step: 1, default: d.tileRowsLog2 },
    { flag: 'tile-cols-log2', uiLabel: 'Log2 of tile cols', kind: 'number', advanced: true, min: 0, max: 6, step: 1, default: d.tileColsLog2 },
    { flag: 'effort', uiLabel: 'Effort', kind: 'number', min: 0, max: MAX_EFFORT, step: 1, default: MAX_EFFORT - d.speed },
  ],
  toEncodeOptions(v) {
    const lossless = v.bool('lossless');
    return {
      quality: lossless ? MAX_QUALITY : v.num('quality'),
      qualityAlpha: lossless || !v.bool('separate-alpha') ? -1 : v.num('alpha-quality'),
      subsample: lossless ? 3 : v.enumValue<number>('subsample-chroma'),
      tileColsLog2: v.num('tile-cols-log2'),
      tileRowsLog2: v.num('tile-rows-log2'),
      speed: MAX_EFFORT - v.num('effort'),
      chromaDeltaQ: v.bool('extra-chroma-compression'),
      sharpness: v.num('sharpness'),
      denoiseLevel: v.num('noise-synthesis'),
      tune: v.enumValue<AVIFTune>('tuning'),
      enableSharpYUV: v.bool('sharp-yuv'),
    };
  },
  async encode(image, options) {
    // The app uses the multithreaded build when the page is cross-origin
    // isolated; the single-threaded build is the same encoder.
    const module = await loadEmscripten('avif/enc/avif_enc');
    const result = module.encode(image.data, image.width, image.height, options);
    if (!result) throw new Error('Encoding error');
    return result;
  },
};
