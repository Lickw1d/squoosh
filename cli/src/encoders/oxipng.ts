// Mirrors src/features/encoders/oxiPNG/client/index.tsx
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  EncodeOptions,
} from '../../../src/features/encoders/oxiPNG/shared/meta.js';
import { loadWasmBindgen } from '../codecs.js';
import type { EncoderDef } from './types.js';

export const oxipng: EncoderDef<EncodeOptions> = {
  id: 'oxipng',
  label,
  mimeType,
  extension,
  options: [
    { flag: 'interlace', uiLabel: 'Interlace', kind: 'boolean', default: d.interlace },
    { flag: 'effort', uiLabel: 'Effort', kind: 'number', min: 0, max: 6, step: 1, default: d.level },
  ],
  toEncodeOptions: (v) => ({
    level: v.num('effort'),
    interlace: v.bool('interlace'),
  }),
  async encode(image, options) {
    // The app uses the threaded build when available; output is the same.
    const { optimise } = await loadWasmBindgen('oxipng/pkg', 'squoosh_oxipng');
    return optimise(
      new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
      image.width,
      image.height,
      options.level,
      options.interlace,
    );
  },
};
