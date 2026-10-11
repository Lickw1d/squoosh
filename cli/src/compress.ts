/**
 * The compress pipeline, in the same order as the app's updateImage():
 * decode -> rotate (preprocess) -> resize -> reduce palette -> encode.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import type { CompressArgs } from './args.js';
import { UsageError } from './args.js';
import { decodeImage } from './decode.js';
import { rotate, rotateSettings } from './processors/rotate.js';
import { resize, resizeEnabled, resizeSettings } from './processors/resize.js';
import { quantize, quantizeEnabled, quantizeSettings } from './processors/quantize.js';

export interface CompressResult {
  input: string;
  output?: string;
  inputBytes?: number;
  outputBytes?: number;
  error?: string;
}

export function defaultOutputDirName(startedAt: Date): string {
  return `squoosh_out_${Math.floor(startedAt.getTime() / 1000)}`;
}

function outputName(input: string, extension: string): string {
  const base = basename(input);
  const ext = extname(base);
  return `${ext ? base.slice(0, -ext.length) : base}.${extension}`;
}

/** Checks inputs and output paths before any work is done. */
async function planOutputs(args: CompressArgs, outputDir: string): Promise<Map<string, string>> {
  const errors: string[] = [];
  const plan = new Map<string, string>();
  const claimed = new Map<string, string>();

  for (const input of args.inputs) {
    const inputPath = resolve(input);
    try {
      const info = await stat(inputPath);
      if (info.isDirectory()) {
        errors.push(`${input} is a directory. Pass files (a shell glob like ${join(input, '*.png')} works).`);
        continue;
      }
    } catch {
      errors.push(`${input} doesn't exist.`);
      continue;
    }

    const outputPath = join(outputDir, outputName(input, args.encoder.extension));
    if (outputPath === inputPath) {
      errors.push(`${input} would be overwritten by its own output. Choose a different --output-dir.`);
      continue;
    }
    const other = claimed.get(outputPath);
    if (other !== undefined) {
      if (other !== inputPath) {
        errors.push(`${displayPath(inputPath)} and ${displayPath(other)} would both be written to ${displayPath(outputPath)}.`);
      }
      continue; // Same file listed twice: process it once.
    }
    claimed.set(outputPath, inputPath);
    plan.set(inputPath, outputPath);
  }

  try {
    const info = await stat(outputDir);
    if (!info.isDirectory()) errors.push(`--output-dir ${outputDir} exists and is not a directory.`);
  } catch {
    // Doesn't exist yet; created below.
  }

  if (errors.length) throw new UsageError(errors);
  return plan;
}

async function compressOne(args: CompressArgs, inputPath: string): Promise<Uint8Array> {
  const { values, encoder } = args;
  const bytes = new Uint8Array(await readFile(inputPath));

  let image = await decodeImage(bytes);
  image = await rotate(image, rotateSettings(values));
  if (resizeEnabled(values)) {
    image = await resize(image, resizeSettings(values, image.width, image.height));
  }
  if (quantizeEnabled(values)) {
    image = await quantize(image, quantizeSettings(values));
  }
  const encoded = await encoder.encode(image, encoder.toEncodeOptions(values));
  // Copy out of the wasm heap before the next encode reuses it.
  return encoded.slice();
}

export async function compress(
  args: CompressArgs,
  startedAt: Date,
  log: (line: string) => void,
): Promise<CompressResult[]> {
  const outputDir = resolve(args.outputDir ?? defaultOutputDirName(startedAt));
  const plan = await planOutputs(args, outputDir);
  await mkdir(outputDir, { recursive: true });

  const count = plan.size;
  log(`Encoding ${count} image${count === 1 ? '' : 's'} as ${args.encoder.label} into ${displayPath(outputDir)}`);

  const results: CompressResult[] = [];
  for (const [inputPath, outputPath] of plan) {
    const input = displayPath(inputPath);
    try {
      const inputBytes = (await stat(inputPath)).size;
      const encoded = await compressOne(args, inputPath);
      await writeFile(outputPath, encoded);
      const result = { input, output: displayPath(outputPath), inputBytes, outputBytes: encoded.byteLength };
      results.push(result);
      log(`  ✓ ${input} → ${result.output}  ${formatBytes(inputBytes)} → ${formatBytes(encoded.byteLength)} (${percentChange(inputBytes, encoded.byteLength)})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ input, error: message });
      log(`  ✗ ${input}: ${message}`);
    }
  }
  return results;
}

function displayPath(p: string): string {
  const rel = relative(process.cwd(), p);
  return rel && !rel.startsWith('..') ? rel : p;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

function percentChange(before: number, after: number): string {
  const change = ((after - before) / before) * 100;
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
}
