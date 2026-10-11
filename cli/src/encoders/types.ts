import type { OptionDef, Values } from '../options.js';
import type { RawImage } from '../image.js';

export interface EncoderDef<EncodeOptions = unknown> {
  /** Value for --encoder. Shell-safe. */
  id: string;
  /** Name shown in the app (meta.label). */
  label: string;
  extension: string;
  mimeType: string;
  options: OptionDef[];
  /**
   * Turns the CLI settings into the codec's EncodeOptions the same way the
   * app's Options component does in its onChange handler.
   */
  toEncodeOptions(values: Values): EncodeOptions;
  /** Cross-field checks the app enforces in its UI. Returns error messages. */
  validate?(values: Values): string[];
  encode(image: RawImage, options: EncodeOptions): Promise<Uint8Array>;
}
