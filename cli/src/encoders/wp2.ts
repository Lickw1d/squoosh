// Mirrors src/features/encoders/wp2/client/index.tsx
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  UVMode,
  Csp,
  EncodeOptions,
} from '../../../src/features/encoders/wp2/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import type { Values } from '../options.js';
import type { EncoderDef } from './types.js';

// From the component's getDerivedStateFromProps: quality above 95 is shown
// as "Lossless" with "Slight loss" = 100 - quality.
const defaultLossless = d.quality > 95;

const lossy = { describe: 'lossy mode (--no-lossless)', test: (v: Values) => !v.bool('lossless') };

export const wp2: EncoderDef<EncodeOptions> = {
  id: 'wp2',
  label,
  mimeType,
  extension,
  options: [
    { flag: 'lossless', uiLabel: 'Lossless', kind: 'boolean', default: defaultLossless },
    {
      flag: 'slight-loss', uiLabel: 'Slight loss', kind: 'number', min: 0, max: 5, step: 0.1,
      default: defaultLossless ? 100 - d.quality : 0,
      when: { describe: '--lossless', test: (v) => v.bool('lossless') },
    },
    // While lossless, the app keeps this slider's last value (75 by default).
    { flag: 'quality', uiLabel: 'Quality', kind: 'number', min: 0, max: 95, step: 0.1, default: defaultLossless ? 75 : d.quality, when: lossy },
    { flag: 'separate-alpha', uiLabel: 'Separate alpha quality', kind: 'boolean', default: d.quality !== d.alpha_quality, when: lossy },
    {
      flag: 'alpha-quality', uiLabel: 'Alpha Quality', kind: 'number', min: 0, max: 100, step: 1, default: d.alpha_quality,
      when: { describe: 'lossy mode and --separate-alpha', test: (v) => lossy.test(v) && v.bool('separate-alpha') },
    },
    { flag: 'passes', uiLabel: 'Passes', kind: 'number', advanced: true, min: 1, max: 10, step: 1, default: d.pass, when: lossy },
    { flag: 'spatial-noise-shaping', uiLabel: 'Spatial noise shaping', kind: 'number', advanced: true, min: 0, max: 100, step: 1, default: d.sns, when: lossy },
    { flag: 'error-diffusion', uiLabel: 'Error diffusion', kind: 'number', advanced: true, min: 0, max: 100, step: 1, default: d.error_diffusion, when: lossy },
    {
      flag: 'subsample-chroma', uiLabel: 'Subsample chroma', kind: 'enum', advanced: true, when: lossy,
      choices: [
        { token: 'auto', uiLabel: 'Auto', value: UVMode.UVModeAuto },
        { token: 'vary', uiLabel: 'Vary', value: UVMode.UVModeAdapt },
        { token: 'half', uiLabel: 'Half', value: UVMode.UVMode420 },
        { token: 'off', uiLabel: 'Off', value: UVMode.UVMode444 },
      ],
      defaultValue: d.uv_mode,
    },
    {
      flag: 'color-space', uiLabel: 'Color space', kind: 'enum', advanced: true, when: lossy,
      choices: [
        { token: 'ycocg', uiLabel: 'YCoCg', value: Csp.kYCoCg },
        { token: 'ycbcr', uiLabel: 'YCbCr', value: Csp.kYCbCr },
        { token: 'yiq', uiLabel: 'YIQ', value: Csp.kYIQ },
      ],
      defaultValue: d.csp_type,
    },
    { flag: 'random-matrix', uiLabel: 'Random matrix', kind: 'boolean', advanced: true, default: d.use_random_matrix, when: lossy },
    { flag: 'effort', uiLabel: 'Effort', kind: 'number', min: 0, max: 9, step: 1, default: d.effort },
  ],
  toEncodeOptions(v) {
    const lossless = v.bool('lossless');
    const quality = v.num('quality');
    return {
      effort: v.num('effort'),
      quality: lossless ? 100 - v.num('slight-loss') : quality,
      alpha_quality: v.bool('separate-alpha') ? v.num('alpha-quality') : quality,
      pass: v.num('passes'),
      sns: v.num('spatial-noise-shaping'),
      uv_mode: v.enumValue<UVMode>('subsample-chroma'),
      csp_type: v.enumValue<Csp>('color-space'),
      error_diffusion: v.num('error-diffusion'),
      use_random_matrix: v.bool('random-matrix'),
    };
  },
  async encode(image, options) {
    const module = await loadEmscripten('wp2/enc/wp2_enc');
    const result = module.encode(image.data, image.width, image.height, options);
    if (!result) throw new Error('Encoding error.');
    return result;
  },
};
