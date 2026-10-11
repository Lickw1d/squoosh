import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encoders, findEncoder } from '../src/encoders/index.js';
import { processorOptions } from '../src/processors/index.js';
import { createValues, SHELL_SAFE_FLAG, SHELL_SAFE_TOKEN, OptionDef } from '../src/options.js';
import { parseArgs, UsageError, CompressArgs } from '../src/args.js';
import { resizeSettings } from '../src/processors/resize.js';
import { quantizeSettings } from '../src/processors/quantize.js';
import { rotateSettings } from '../src/processors/rotate.js';
import { applyExifOrientation } from '../src/exif.js';
import { RawImage } from '../src/image.js';

import * as avifMeta from '../../src/features/encoders/avif/shared/meta.js';
import * as jxlMeta from '../../src/features/encoders/jxl/shared/meta.js';
import * as mozjpegMeta from '../../src/features/encoders/mozJPEG/shared/meta.js';
import * as oxipngMeta from '../../src/features/encoders/oxiPNG/shared/meta.js';
import * as qoiMeta from '../../src/features/encoders/qoi/shared/meta.js';
import * as webpMeta from '../../src/features/encoders/webP/shared/meta.js';
import * as wp2Meta from '../../src/features/encoders/wp2/shared/meta.js';
import * as quantizeMeta from '../../src/features/processors/quantize/shared/meta.js';
import * as rotateMeta from '../../src/features/preprocessors/rotate/shared/meta.js';
import * as resizeMeta from '../../src/features/processors/resize/shared/meta.js';

const metas: Record<string, { defaultOptions: unknown; label: string; extension: string }> = {
  avif: avifMeta,
  jxl: jxlMeta,
  mozjpeg: mozjpegMeta,
  oxipng: oxipngMeta,
  qoi: qoiMeta,
  webp: webpMeta,
  wp2: wp2Meta,
};

function compressArgs(argv: string[]): CompressArgs {
  const parsed = parseArgs(['compress', 'in.png', ...argv]);
  assert.equal(parsed.kind, 'compress');
  return (parsed as { kind: 'compress'; args: CompressArgs }).args;
}

function encodeOptions(argv: string[]): any {
  const { encoder, values } = compressArgs(argv);
  return encoder.toEncodeOptions(values);
}

function usageErrors(argv: string[]): string[] {
  try {
    parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) return err.errors;
    throw err;
  }
  assert.fail(`Expected a usage error for: ${argv.join(' ')}`);
}

// ---- Defaults are exactly the app's ----------------------------------------

for (const encoder of encoders) {
  test(`${encoder.id}: untouched CLI settings produce the app's defaultOptions`, () => {
    const values = createValues(encoder.options, new Map());
    assert.deepEqual(encoder.toEncodeOptions(values), metas[encoder.id].defaultOptions);
    assert.equal(encoder.label, metas[encoder.id].label);
    assert.equal(encoder.extension, metas[encoder.id].extension);
  });
}

test('processors default to the app defaults and are off', () => {
  const args = compressArgs([]);
  assert.deepEqual(rotateSettings(args.values), rotateMeta.defaultOptions);
  assert.deepEqual(quantizeSettings(args.values), quantizeMeta.defaultOptions);
  const resize = resizeSettings(args.values, 640, 480);
  const d = resizeMeta.defaultOptions as any;
  assert.equal(resize.method, d.method);
  assert.equal(resize.fitMethod, d.fitMethod);
  assert.equal(resize.premultiply, d.premultiply);
  assert.equal(resize.linearRGB, d.linearRGB);
  assert.equal(args.values.bool('resize'), false);
  assert.equal(args.values.bool('reduce-palette'), false);
});

test('the default encoder is MozJPEG, like the app', () => {
  assert.equal(compressArgs([]).encoder.id, 'mozjpeg');
});

// ---- Shell-safe names and values -------------------------------------------

test('every flag and enum value is shell-safe and unique', () => {
  const general = ['output-dir', 'encoder', 'help'];
  for (const encoder of encoders) {
    assert.match(encoder.id, SHELL_SAFE_TOKEN);
    const all: OptionDef[] = [...processorOptions, ...encoder.options];
    const flags = all.map((o) => o.flag);
    assert.equal(new Set(flags).size, flags.length, `duplicate flag in ${encoder.id}`);
    for (const opt of all) {
      assert.match(opt.flag, SHELL_SAFE_FLAG);
      assert.ok(!general.includes(opt.flag));
      assert.ok(!opt.flag.startsWith('no-'), `--${opt.flag} would clash with negation`);
      if (opt.kind === 'enum') {
        for (const c of opt.choices) assert.match(c.token, SHELL_SAFE_TOKEN);
      }
    }
  }
});

// ---- UI mappings -------------------------------------------------------------

test('mozjpeg: settings map straight through', () => {
  const o = encodeOptions(['--quality', '60', '--channels', 'rgb', '--quantization=flat', '--trellis-multipass', '--optimize-zero-block-runs']);
  assert.equal(o.quality, 60);
  assert.equal(o.color_space, 2);
  assert.equal(o.quant_table, 1);
  assert.equal(o.trellis_multipass, true);
  assert.equal(o.trellis_opt_zero, true);
  assert.equal(o.arithmetic, mozjpegMeta.defaultOptions.arithmetic);
});

test('webp: lossless effort uses the app presets, sliders are inverted like the app', () => {
  const lossless = encodeOptions(['-e', 'webp', '--lossless', '--effort', '9', '--slight-loss', '40', '--discrete-tone']);
  assert.equal(lossless.lossless, 1);
  assert.equal(lossless.method, 6);
  assert.equal(lossless.quality, 100);
  assert.equal(lossless.near_lossless, 60);
  assert.equal(lossless.image_hint, 3);

  const losslessDefault = encodeOptions(['-e', 'webp', '--lossless']);
  assert.equal(losslessDefault.method, 4);
  assert.equal(losslessDefault.quality, 75);

  const lossy = encodeOptions(['-e', 'webp', '--quality', '82.5', '--effort', '6', '--filter-sharpness', '2', '--no-strong-filter']);
  assert.equal(lossy.quality, 82.5);
  assert.equal(lossy.method, 6);
  assert.equal(lossy.filter_sharpness, 5);
  assert.equal(lossy.filter_type, 0);
});

test('avif: lossless, effort and separate alpha follow the app component', () => {
  const lossless = encodeOptions(['-e', 'avif', '--lossless']);
  assert.equal(lossless.quality, 100);
  assert.equal(lossless.qualityAlpha, -1);
  assert.equal(lossless.subsample, 3);

  const o = encodeOptions(['-e', 'avif', '--quality', '40', '--effort', '8', '--separate-alpha', '--alpha-quality', '70', '--tuning', 'ssim']);
  assert.equal(o.quality, 40);
  assert.equal(o.speed, 2);
  assert.equal(o.qualityAlpha, 70);
  assert.equal(o.tune, 2);
});

test('jxl: low quality forces alternative lossy mode, lossless sets quality 100', () => {
  assert.equal(encodeOptions(['-e', 'jxl', '--quality', '5']).lossyModular, true);
  assert.equal(encodeOptions(['-e', 'jxl', '--quality', '50']).lossyModular, false);
  const lossless = encodeOptions(['-e', 'jxl', '--lossless', '--slight-loss']);
  assert.equal(lossless.quality, 100);
  assert.equal(lossless.lossyPalette, true);
  assert.equal(encodeOptions(['-e', 'jxl', '--no-auto-edge-filter', '--edge-preserving-filter', '1']).epf, 1);
});

test('wp2: lossless quality is 100 minus slight loss', () => {
  const o = encodeOptions(['-e', 'wp2', '--lossless', '--slight-loss', '2.5']);
  assert.equal(o.quality, 97.5);
  assert.equal(o.alpha_quality, 75);
  const sep = encodeOptions(['-e', 'wp2', '--quality', '60', '--separate-alpha', '--alpha-quality', '90', '--subsample-chroma', 'half']);
  assert.equal(sep.quality, 60);
  assert.equal(sep.alpha_quality, 90);
  assert.equal(sep.uv_mode, 1);
});

test('oxipng: effort maps to level', () => {
  assert.deepEqual(encodeOptions(['-e', 'oxipng', '--effort', '5', '--interlace']), { level: 5, interlace: true });
});

test('enum values are accepted case-insensitively', () => {
  assert.equal(encodeOptions(['--channels', 'YCbCr']).color_space, 3);
});

// ---- Resize sizing ------------------------------------------------------------

test('resize: aspect ratio, presets and explicit sizes', () => {
  assert.deepEqual(
    pick(resizeSettings(compressArgs(['--resize-width', '320']).values, 1000, 750)),
    { width: 320, height: 240 },
  );
  assert.deepEqual(
    pick(resizeSettings(compressArgs(['--resize-height', '100']).values, 1000, 750)),
    { width: 133, height: 100 },
  );
  assert.deepEqual(
    pick(resizeSettings(compressArgs(['--resize-preset', '33.33']).values, 1000, 750)),
    { width: 333, height: 250 },
  );
  const free = resizeSettings(
    compressArgs(['--no-maintain-aspect', '--resize-width', '50', '--fit-method', 'contain']).values,
    1000,
    750,
  );
  assert.deepEqual(pick(free), { width: 50, height: 750 });
  assert.equal(free.fitMethod, 'contain');
});

function pick(o: { width: number; height: number }) {
  return { width: o.width, height: o.height };
}

// ---- Usage errors -------------------------------------------------------------

test('help is shown for no args, help, -h and bare compress', () => {
  for (const argv of [[], ['help'], ['-h'], ['--help'], ['compress'], ['compress', 'x.png', '--help']]) {
    assert.equal(parseArgs(argv).kind, 'help', argv.join(' '));
  }
});

test('invalid input is rejected with specific messages', () => {
  const cases: [string[], RegExp][] = [
    [['shrink', 'a.png'], /Unknown command "shrink"/],
    [['compress', '--quality', '80'], /No input files/],
    [['compress', 'a.png', '--quality', '101'], /--quality must be between 0 and 100, got 101/],
    [['compress', 'a.png', '--quality', '7.5'], /--quality must be a whole number/],
    [['compress', 'a.png', '-e', 'webp', '--quality', '7.55'], /steps of 0.1/],
    [['compress', 'a.png', '--quality', 'high'], /must be a number/],
    [['compress', 'a.png', '--channels', 'cmyk'], /isn't a valid value for --channels. Choose one of: grayscale, rgb, ycbcr/],
    [['compress', 'a.png', '--qualty', '80'], /Did you mean --quality\?/],
    [['compress', 'a.png', '--strong-filter'], /is a setting for --encoder webp, not mozjpeg/],
    [['compress', 'a.png', '-e', 'bmp'], /Unknown encoder "bmp"/],
    [['compress', 'a.png', '--chroma-quality', '50'], /only applies with --channels ycbcr and --separate-chroma-quality/],
    [['compress', 'a.png', '-e', 'webp', '--lossless', '--quality', '50'], /--quality only applies with lossy mode/],
    [['compress', 'a.png', '-e', 'webp', '--effort', '9'], /--effort must be between 0 and 6/],
    [['compress', 'a.png', '-e', 'jxl', '--quality', '5', '--no-alternative-lossy'], /below 7/],
    [['compress', 'a.png', '--progressive=maybe'], /is a switch/],
    [['compress', 'a.png', '--quality', '80', '--quality', '70'], /given more than once/],
    [['compress', 'a.png', '--resize-preset', '50', '--resize-width', '10'], /either --resize-preset or/],
    [['compress', 'a.png', '--resize-width', '10', '--resize-height', '10'], /pass only one of/],
    [['compress', 'a.png', '--fit-method', 'contain'], /only applies with --no-maintain-aspect/],
    [['compress', 'a.png', '--colors', '8', '--palette-type', 'zx'], /--colors only applies with --palette-type standard/],
    [['compress', 'a.png', '--resize-width', '0'], /at least 1/],
    [['compress', 'a.png', '-e', 'qoi', '--quality', '80'], /--quality is a setting for --encoder avif/],
  ];
  for (const [argv, pattern] of cases) {
    const errors = usageErrors(argv);
    assert.ok(errors.some((e) => pattern.test(e)), `${argv.join(' ')}\n  got: ${errors.join(' | ')}`);
  }
});

test('all errors are reported together', () => {
  const errors = usageErrors(['compress', 'a.png', '--quality', '500', '--channels', 'nope', '--bogus']);
  assert.equal(errors.length, 3);
});

test('inputs, values and -- are separated correctly', () => {
  const args = compressArgs(['b.jpg', '--quality', '50', '-o', 'out', 'c.png', '--', '--weird-name.png']);
  assert.deepEqual(args.inputs, ['in.png', 'b.jpg', 'c.png', '--weird-name.png']);
  assert.equal(args.outputDir, 'out');
  assert.equal(args.values.num('quality'), 50);
});

// ---- EXIF orientation -----------------------------------------------------------

test('EXIF orientation 6 rotates 90° clockwise', () => {
  // 2x1 image: red, green
  const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const out = applyExifOrientation(new RawImage(px, 2, 1), 6);
  assert.equal(out.width, 1);
  assert.equal(out.height, 2);
  assert.deepEqual([...out.data], [255, 0, 0, 255, 0, 255, 0, 255]);
  const flipped = applyExifOrientation(new RawImage(px, 2, 1), 2);
  assert.deepEqual([...flipped.data], [0, 255, 0, 255, 255, 0, 0, 255]);
});

test('every encoder can be found by id', () => {
  for (const id of Object.keys(metas)) assert.ok(findEncoder(id));
});
