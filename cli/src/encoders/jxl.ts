// Mirrors src/features/encoders/jxl/client/index.tsx
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  EncodeOptions,
} from '../../../src/features/encoders/jxl/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import type { Values } from '../options.js';
import type { EncoderDef } from './types.js';

const lossy = { describe: 'lossy mode (--no-lossless)', test: (v: Values) => !v.bool('lossless') };

// Below this quality the app forces "Alternative lossy mode" on.
const FORCE_ALTERNATIVE_LOSSY_BELOW = 7;

export const jxl: EncoderDef<EncodeOptions> = {
  id: 'jxl',
  label,
  mimeType,
  extension,
  options: [
    { flag: 'lossless', uiLabel: 'Lossless', kind: 'boolean', default: d.quality === 100 },
    {
      flag: 'slight-loss', uiLabel: 'Slight loss', kind: 'boolean', default: d.lossyPalette,
      when: { describe: '--lossless', test: (v) => v.bool('lossless') },
    },
    { flag: 'quality', uiLabel: 'Quality', kind: 'number', min: 0, max: 99.9, step: 0.1, default: d.quality, when: lossy },
    {
      flag: 'alternative-lossy', uiLabel: 'Alternative lossy mode', kind: 'boolean', default: d.lossyModular, when: lossy,
      description: `Always on when quality is below ${FORCE_ALTERNATIVE_LOSSY_BELOW}.`,
    },
    { flag: 'auto-edge-filter', uiLabel: 'Auto edge filter', kind: 'boolean', default: d.epf === -1, when: lossy },
    {
      flag: 'edge-preserving-filter', uiLabel: 'Edge preserving filter', kind: 'number', min: 0, max: 3, step: 1,
      default: d.epf === -1 ? 2 : d.epf,
      when: { describe: 'lossy mode and --no-auto-edge-filter', test: (v) => lossy.test(v) && !v.bool('auto-edge-filter') },
    },
    {
      flag: 'decoding-speed', uiLabel: 'Optimise for decoding speed (worse compression)', kind: 'number',
      min: 0, max: 4, step: 1, default: d.decodingSpeedTier, when: lossy,
    },
    { flag: 'noise-iso', uiLabel: 'Noise equivalent to ISO', kind: 'number', min: 0, max: 50000, step: 100, default: d.photonNoiseIso, when: lossy },
    { flag: 'progressive', uiLabel: 'Progressive rendering', kind: 'boolean', default: d.progressive },
    { flag: 'effort', uiLabel: 'Effort', kind: 'number', min: 1, max: 9, step: 1, default: d.effort },
  ],
  validate(v) {
    if (
      !v.bool('lossless') &&
      v.provided('alternative-lossy') &&
      !v.bool('alternative-lossy') &&
      v.num('quality') < FORCE_ALTERNATIVE_LOSSY_BELOW
    ) {
      return [
        `--no-alternative-lossy can't be used with --quality below ${FORCE_ALTERNATIVE_LOSSY_BELOW}; the app always enables it there.`,
      ];
    }
    return [];
  },
  toEncodeOptions(v) {
    const lossless = v.bool('lossless');
    // In lossless mode the app tests its hidden quality slider (the meta
    // default, since --quality can't be combined with --lossless) against the
    // threshold, which is always >= 7, so testing 100 gives the same result.
    const quality = lossless ? 100 : v.num('quality');
    return {
      effort: v.num('effort'),
      quality,
      progressive: v.bool('progressive'),
      epf: v.bool('auto-edge-filter') ? -1 : v.num('edge-preserving-filter'),
      lossyPalette: lossless ? v.bool('slight-loss') : false,
      decodingSpeedTier: v.num('decoding-speed'),
      photonNoiseIso: v.num('noise-iso'),
      lossyModular:
        quality < FORCE_ALTERNATIVE_LOSSY_BELOW ? true : v.bool('alternative-lossy'),
    };
  },
  async encode(image, options) {
    const module = await loadEmscripten('jxl/enc/jxl_enc');
    const result = module.encode(image.data, image.width, image.height, options);
    if (!result) throw new Error('Encoding error.');
    return result;
  },
};
