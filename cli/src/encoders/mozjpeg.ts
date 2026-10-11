// Mirrors src/features/encoders/mozJPEG/client/index.tsx
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  MozJpegColorSpace,
  EncodeOptions,
} from '../../../src/features/encoders/mozJPEG/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import type { Values } from '../options.js';
import type { EncoderDef } from './types.js';

const isYCbCr = {
  describe: '--channels ycbcr',
  test: (v: Values) => v.enumValue('channels') === MozJpegColorSpace.YCbCr,
};

export const mozjpeg: EncoderDef<EncodeOptions> = {
  id: 'mozjpeg',
  label,
  mimeType,
  extension,
  options: [
    { flag: 'quality', uiLabel: 'Quality', kind: 'number', min: 0, max: 100, step: 1, default: d.quality },
    {
      flag: 'channels', uiLabel: 'Channels', kind: 'enum', advanced: true,
      choices: [
        { token: 'grayscale', uiLabel: 'Grayscale', value: MozJpegColorSpace.GRAYSCALE },
        { token: 'rgb', uiLabel: 'RGB', value: MozJpegColorSpace.RGB },
        { token: 'ycbcr', uiLabel: 'YCbCr', value: MozJpegColorSpace.YCbCr },
      ],
      defaultValue: d.color_space,
    },
    { flag: 'auto-subsample', uiLabel: 'Auto subsample chroma', kind: 'boolean', advanced: true, default: d.auto_subsample, when: isYCbCr },
    {
      flag: 'chroma-subsample', uiLabel: 'Subsample chroma by', kind: 'number', advanced: true,
      min: 1, max: 4, step: 1, default: d.chroma_subsample,
      when: {
        describe: '--channels ycbcr and --no-auto-subsample',
        test: (v) => isYCbCr.test(v) && !v.bool('auto-subsample'),
      },
    },
    { flag: 'separate-chroma-quality', uiLabel: 'Separate chroma quality', kind: 'boolean', advanced: true, default: d.separate_chroma_quality, when: isYCbCr },
    {
      flag: 'chroma-quality', uiLabel: 'Chroma quality', kind: 'number', advanced: true,
      min: 0, max: 100, step: 1, default: d.chroma_quality,
      when: {
        describe: '--channels ycbcr and --separate-chroma-quality',
        test: (v) => isYCbCr.test(v) && v.bool('separate-chroma-quality'),
      },
    },
    { flag: 'baseline', uiLabel: 'Pointless spec compliance', kind: 'boolean', advanced: true, default: d.baseline, description: 'Baseline JPEG.' },
    {
      flag: 'progressive', uiLabel: 'Progressive rendering', kind: 'boolean', advanced: true, default: d.progressive,
      when: { describe: '--no-baseline', test: (v) => !v.bool('baseline') },
    },
    {
      flag: 'optimize-huffman', uiLabel: 'Optimize Huffman table', kind: 'boolean', advanced: true, default: d.optimize_coding,
      when: { describe: '--baseline', test: (v) => v.bool('baseline') },
    },
    { flag: 'smoothing', uiLabel: 'Smoothing', kind: 'number', advanced: true, min: 0, max: 100, step: 1, default: d.smoothing },
    {
      flag: 'quantization', uiLabel: 'Quantization', kind: 'enum', advanced: true,
      choices: [
        { token: 'jpeg-annex-k', uiLabel: 'JPEG Annex K', value: 0 },
        { token: 'flat', uiLabel: 'Flat', value: 1 },
        { token: 'mssim-kodak', uiLabel: 'MSSIM-tuned Kodak', value: 2 },
        { token: 'imagemagick', uiLabel: 'ImageMagick', value: 3 },
        { token: 'psnr-hvs-m-kodak', uiLabel: 'PSNR-HVS-M-tuned Kodak', value: 4 },
        { token: 'klein', uiLabel: 'Klein et al', value: 5 },
        { token: 'watson', uiLabel: 'Watson et al', value: 6 },
        { token: 'ahumada', uiLabel: 'Ahumada et al', value: 7 },
        { token: 'peterson', uiLabel: 'Peterson et al', value: 8 },
      ],
      defaultValue: d.quant_table,
    },
    { flag: 'trellis-multipass', uiLabel: 'Trellis multipass', kind: 'boolean', advanced: true, default: d.trellis_multipass },
    {
      flag: 'optimize-zero-block-runs', uiLabel: 'Optimize zero block runs', kind: 'boolean', advanced: true, default: d.trellis_opt_zero,
      when: { describe: '--trellis-multipass', test: (v) => v.bool('trellis-multipass') },
    },
    { flag: 'optimize-after-trellis', uiLabel: 'Optimize after trellis quantization', kind: 'boolean', advanced: true, default: d.trellis_opt_table },
    { flag: 'trellis-passes', uiLabel: 'Trellis quantization passes', kind: 'number', advanced: true, min: 1, max: 50, step: 1, default: d.trellis_loops },
  ],
  toEncodeOptions: (v) => ({
    // Fields with no UI control (e.g. arithmetic) keep their meta defaults,
    // exactly as the app's form handler does.
    ...d,
    quality: v.num('quality'),
    color_space: v.enumValue<MozJpegColorSpace>('channels'),
    auto_subsample: v.bool('auto-subsample'),
    chroma_subsample: v.num('chroma-subsample'),
    separate_chroma_quality: v.bool('separate-chroma-quality'),
    chroma_quality: v.num('chroma-quality'),
    baseline: v.bool('baseline'),
    progressive: v.bool('progressive'),
    optimize_coding: v.bool('optimize-huffman'),
    smoothing: v.num('smoothing'),
    quant_table: v.enumValue<number>('quantization'),
    trellis_multipass: v.bool('trellis-multipass'),
    trellis_opt_zero: v.bool('optimize-zero-block-runs'),
    trellis_opt_table: v.bool('optimize-after-trellis'),
    trellis_loops: v.num('trellis-passes'),
  }),
  async encode(image, options) {
    const module = await loadEmscripten('mozjpeg/enc/mozjpeg_enc');
    return module.encode(image.data, image.width, image.height, options);
  },
};
