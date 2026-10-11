// Mirrors src/features/encoders/qoi/client/index.tsx (no options).
import {
  defaultOptions as d,
  label,
  mimeType,
  extension,
  EncodeOptions,
} from '../../../src/features/encoders/qoi/shared/meta.js';
import { loadEmscripten } from '../codecs.js';
import type { EncoderDef } from './types.js';

export const qoi: EncoderDef<EncodeOptions> = {
  id: 'qoi',
  label,
  mimeType,
  extension,
  options: [],
  toEncodeOptions: () => ({ ...d }),
  async encode(image, options) {
    const module = await loadEmscripten('qoi/enc/qoi_enc');
    return module.encode(image.data, image.width, image.height, options);
  },
};
