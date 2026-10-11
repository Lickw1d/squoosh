import type { OptionDef, Values } from '../options.js';
import { rotateOptions } from './rotate.js';
import { resizeOptions, validateResize } from './resize.js';
import { quantizeOptions, validateQuantize } from './quantize.js';

export const processorGroups: { title: string; note?: string; options: OptionDef[] }[] = [
  { title: 'Rotate', note: "The app's rotate button. Applied first.", options: rotateOptions },
  { title: 'Resize', note: 'Off unless one of these is given.', options: resizeOptions },
  { title: 'Reduce palette', note: 'Off unless one of these is given.', options: quantizeOptions },
];

export const processorOptions: OptionDef[] = processorGroups.flatMap((g) => g.options);

export function validateProcessors(v: Values): string[] {
  return [...validateResize(v), ...validateQuantize(v)];
}
