// Mirrors src/features/encoders/webP/client/index.tsx
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  EncodeOptions,
} from '../../../src/features/encoders/webP/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import type { Values } from '../options.js';
import type { EncoderDef } from './types.js';

// Copied from the WebP Options component (client code can't be imported here
// because it depends on Preact). The lossless "Effort" slider picks one of
// these [method, quality] pairs.
const losslessPresets: [number, number][] = [
  [0, 0],
  [1, 20],
  [2, 25],
  [3, 30],
  [3, 50],
  [4, 50],
  [4, 75],
  [4, 90],
  [5, 90],
  [6, 100],
];
const losslessPresetDefault = 6;

function determineLosslessQuality(quality: number, method: number): number {
  const index = losslessPresets.findIndex(
    ([presetMethod, presetQuality]) =>
      presetMethod === method && presetQuality === quality,
  );
  if (index !== -1) return index;
  return losslessPresetDefault;
}

const WEBP_HINT_DEFAULT = 0;
const WEBP_HINT_GRAPH = 3;

const lossy = { describe: 'lossy mode (--no-lossless)', test: (v: Values) => !v.bool('lossless') };
const losslessOnly = { describe: '--lossless', test: (v: Values) => v.bool('lossless') };

export const webp: EncoderDef<EncodeOptions> = {
  id: 'webp',
  label,
  mimeType,
  extension,
  options: [
    { flag: 'lossless', uiLabel: 'Lossless', kind: 'boolean', default: !!d.lossless },
    {
      flag: 'effort', uiLabel: 'Effort', kind: 'number', step: 1,
      min: 0,
      max: (v) => (v.bool('lossless') ? losslessPresets.length - 1 : 6),
      default: (v) =>
        v.bool('lossless') ? determineLosslessQuality(d.quality, d.method) : d.method,
      rangeText: '0-6 lossy, 0-9 lossless',
      defaultText: `${d.method} lossy, ${determineLosslessQuality(d.quality, d.method)} lossless`,
    },
    { flag: 'quality', uiLabel: 'Quality', kind: 'number', min: 0, max: 100, step: 0.1, default: d.quality, when: lossy },
    { flag: 'slight-loss', uiLabel: 'Slight loss', kind: 'number', min: 0, max: 100, step: 1, default: 100 - d.near_lossless, when: losslessOnly },
    { flag: 'discrete-tone', uiLabel: 'Discrete tone image', kind: 'boolean', default: d.image_hint === WEBP_HINT_GRAPH, when: losslessOnly },
    { flag: 'compress-alpha', uiLabel: 'Compress alpha', kind: 'boolean', advanced: true, default: !!d.alpha_compression, when: lossy },
    { flag: 'alpha-quality', uiLabel: 'Alpha quality', kind: 'number', advanced: true, min: 0, max: 100, step: 1, default: d.alpha_quality, when: lossy },
    { flag: 'alpha-filter-quality', uiLabel: 'Alpha filter quality', kind: 'number', advanced: true, min: 0, max: 2, step: 1, default: d.alpha_filtering, when: lossy },
    { flag: 'auto-filter', uiLabel: 'Auto adjust filter strength', kind: 'boolean', advanced: true, default: !!d.autofilter, when: lossy },
    {
      flag: 'filter-strength', uiLabel: 'Filter strength', kind: 'number', advanced: true, min: 0, max: 100, step: 1, default: d.filter_strength,
      when: { describe: 'lossy mode and --no-auto-filter', test: (v) => lossy.test(v) && !v.bool('auto-filter') },
    },
    { flag: 'strong-filter', uiLabel: 'Strong filter', kind: 'boolean', advanced: true, default: !!d.filter_type, when: lossy },
    // The app's slider shows 7 - filter_sharpness.
    { flag: 'filter-sharpness', uiLabel: 'Filter sharpness', kind: 'number', advanced: true, min: 0, max: 7, step: 1, default: 7 - d.filter_sharpness, when: lossy },
    { flag: 'sharp-yuv', uiLabel: 'Sharp RGB→YUV conversion', kind: 'boolean', advanced: true, default: !!d.use_sharp_yuv, when: lossy },
    { flag: 'passes', uiLabel: 'Passes', kind: 'number', advanced: true, min: 1, max: 10, step: 1, default: d.pass, when: lossy },
    { flag: 'spatial-noise-shaping', uiLabel: 'Spatial noise shaping', kind: 'number', advanced: true, min: 0, max: 100, step: 1, default: d.sns_strength, when: lossy },
    {
      flag: 'preprocess', uiLabel: 'Preprocess', kind: 'enum', advanced: true, when: lossy,
      choices: [
        { token: 'none', uiLabel: 'None', value: 0 },
        { token: 'segment-smooth', uiLabel: 'Segment smooth', value: 1 },
        { token: 'pseudo-random-dithering', uiLabel: 'Pseudo-random dithering', value: 2 },
      ],
      defaultValue: d.preprocessing,
    },
    { flag: 'segments', uiLabel: 'Segments', kind: 'number', advanced: true, min: 1, max: 4, step: 1, default: d.segments, when: lossy },
    { flag: 'partitions', uiLabel: 'Partitions', kind: 'number', advanced: true, min: 0, max: 3, step: 1, default: d.partitions, when: lossy },
    { flag: 'preserve-transparent', uiLabel: 'Preserve transparent data', kind: 'boolean', default: !!d.exact },
  ],
  toEncodeOptions(v) {
    const lossless = v.bool('lossless') ? 1 : 0;
    const effort = v.num('effort');
    return {
      ...d,
      lossless,
      quality: lossless ? losslessPresets[effort][1] : v.num('quality'),
      method: lossless ? losslessPresets[effort][0] : effort,
      image_hint: v.bool('discrete-tone') ? WEBP_HINT_GRAPH : WEBP_HINT_DEFAULT,
      exact: v.bool('preserve-transparent') ? 1 : 0,
      alpha_compression: v.bool('compress-alpha') ? 1 : 0,
      autofilter: v.bool('auto-filter') ? 1 : 0,
      filter_type: v.bool('strong-filter') ? 1 : 0,
      use_sharp_yuv: v.bool('sharp-yuv') ? 1 : 0,
      near_lossless: 100 - v.num('slight-loss'),
      alpha_quality: v.num('alpha-quality'),
      alpha_filtering: v.num('alpha-filter-quality'),
      sns_strength: v.num('spatial-noise-shaping'),
      filter_strength: v.num('filter-strength'),
      filter_sharpness: 7 - v.num('filter-sharpness'),
      pass: v.num('passes'),
      preprocessing: v.enumValue<number>('preprocess'),
      segments: v.num('segments'),
      partitions: v.num('partitions'),
    };
  },
  async encode(image, options) {
    // The app uses the SIMD build whenever wasm SIMD is available, which it
    // always is in supported Node versions.
    const module = await loadEmscripten('webp/enc/webp_enc_simd');
    const result = module.encode(image.data, image.width, image.height, options);
    if (!result) throw new Error('Encoding error.');
    return result;
  },
};
