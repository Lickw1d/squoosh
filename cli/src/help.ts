import { defaultEncoderId, encoders } from './encoders/index.js';
import { browserOnlyInputs, supportedInputs } from './decode.js';
import {
  createValues,
  defaultToken,
  describeRange,
  OptionDef,
  Values,
} from './options.js';
import { processorGroups, processorOptions } from './processors/index.js';

const WIDTH = 100;
const LEFT = 34;

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Two-column row: left is the flag, right is wrapped help text. */
function row(left: string, right: string, indent = 2): string {
  const pad = ' '.repeat(indent);
  const rightLines = wrap(right, WIDTH - LEFT);
  const out: string[] = [];
  if (pad.length + left.length + 1 > LEFT) {
    out.push(pad + left);
  } else {
    out.push((pad + left).padEnd(LEFT) + (rightLines.shift() ?? ''));
  }
  for (const l of rightLines) out.push(' '.repeat(LEFT) + l);
  return out.join('\n');
}

function flagSyntax(opt: OptionDef): string {
  switch (opt.kind) {
    case 'boolean':
      return `--[no-]${opt.flag}`;
    case 'enum':
      return `--${opt.flag} <${opt.choices.map((c) => c.token).join('|')}>`;
    case 'number':
      return `--${opt.flag} <${describeRange(opt)}>`;
  }
}

function defaultText(opt: OptionDef, defaults: Values): string {
  if (opt.defaultText) return opt.defaultText;
  switch (opt.kind) {
    case 'boolean':
      return opt.default ? 'on' : 'off';
    case 'enum':
      return defaultToken(opt);
    case 'number':
      return String(defaults.num(opt.flag));
  }
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function optionRow(opt: OptionDef, defaults: Values, indent: number): string {
  const parts = [`${opt.uiLabel}.`];
  if (opt.description) parts.push(opt.description);
  // Spell out tokens that don't obviously match the app's labels.
  if (opt.kind === 'enum' && opt.choices.some((c) => alnum(c.uiLabel) !== alnum(c.token))) {
    parts.push(`(${opt.choices.map((c) => `${c.token} = ${c.uiLabel}`).join(', ')})`);
  }
  parts.push(`Default: ${defaultText(opt, defaults)}.`);
  if (opt.when) parts.push(`Only with ${opt.when.describe}.`);
  return row(flagSyntax(opt), parts.join(' '), indent);
}

export function helpText(): string {
  const out: string[] = [];
  const p = (s = '') => out.push(s);

  p('Squoosh CLI: compress images with the same codecs and settings as the Squoosh web app.');
  p();
  p('Usage');
  p('  squoosh compress <input...> [options]');
  p('  squoosh help');
  p();
  p('Commands');
  p(row('compress', 'Decode each input, apply any rotate/resize/palette edits, then encode it with one encoder. Inputs can be listed or passed as a shell glob.'));
  p(row('help', 'Show this help. Also shown for "squoosh", "squoosh compress" with no arguments, -h and --help.'));
  p();
  p('General options');
  p(row('-e, --encoder <name>', `Output format: ${encoders.map((e) => e.id).join(' | ')}. Default: ${defaultEncoderId}.`));
  p(row('-o, --output-dir <dir>', 'Where to write results. Default: a new folder named squoosh_out_<unix timestamp> in the current directory. Existing files with the same name are overwritten.'));
  p(row('-h, --help', 'Show this help.'));
  p();
  p('Switches are turned on with --name and off with --no-name. Values can be given as');
  p('"--name value" or "--name=value". Settings the app only shows in some states (e.g.');
  p('chroma quality only after "Separate chroma quality") are rejected unless that state is set.');

  const processorDefaults = createValues(processorOptions, new Map());
  for (const group of processorGroups) {
    p();
    p(group.note ? `${group.title}  (${group.note})` : group.title);
    for (const opt of group.options) p(optionRow(opt, processorDefaults, 2));
  }

  p();
  p('Encoders');
  p('  Choose one with --encoder. Each encoder only accepts its own settings.');
  for (const encoder of encoders) {
    p();
    const isDefault = encoder.id === defaultEncoderId ? ', the default' : '';
    p(`  ${encoder.label}  (--encoder ${encoder.id}, writes .${encoder.extension}${isDefault})`);
    if (encoder.options.length === 0) {
      p('    No settings.');
      continue;
    }
    const defaults = createValues(encoder.options, new Map());
    const basic = encoder.options.filter((o) => !o.advanced);
    const advanced = encoder.options.filter((o) => o.advanced);
    for (const opt of basic) p(optionRow(opt, defaults, 4));
    if (advanced.length) {
      p('    Advanced settings:');
      for (const opt of advanced) p(optionRow(opt, defaults, 4));
    }
  }

  p();
  p('Input formats');
  p(row('Supported', supportedInputs.join(', ') + '. JPEG EXIF orientation is applied, as in the browser.'));
  p(row('Web app only', `${browserOnlyInputs.join(', ')} input, the Browser JPEG/PNG/GIF encoders, and the Browser and Vector resize methods. These rely on the browser's own image handling.`));
  p();
  p('Examples');
  p('  squoosh compress photo.png');
  p('  squoosh compress *.png --encoder webp --quality 80 --output-dir dist');
  p('  squoosh compress photo.jpg -e avif --effort 6 --resize-width 1200');
  p('  squoosh compress logo.png -e oxipng --reduce-palette --colors 64 --effort 3');
  return out.join('\n');
}
