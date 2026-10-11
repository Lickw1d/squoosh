/**
 * Loads the codec builds copied into dist/codecs by scripts/copy-codecs.mjs.
 *
 * Most of these are the web builds the app runs in its Web Worker. They expect
 * a few browser globals, so this module installs minimal shims once, before
 * the first codec loads. Nothing else in the CLI depends on the shims.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { RawImage } from './image.js';

// dist/cli/src/codecs.js -> dist/codecs/
const codecDir = new URL('../../codecs/', import.meta.url);

let shimsInstalled = false;

function installShims(): void {
  if (shimsInstalled) return;
  shimsInstalled = true;
  const g = globalThis as any;
  // Codecs construct ImageData for their results.
  if (typeof g.ImageData === 'undefined') g.ImageData = RawImage;
  // Web builds compiled for a Worker read self.location at startup. The wasm
  // bytes are passed in directly, so the location is never fetched.
  if (typeof g.self === 'undefined') g.self = { location: { href: codecDir.href } };
  // MozJPEG's Node decoder is an ES module that still calls require() and
  // reads __dirname.
  if (typeof g.require === 'undefined') g.require = createRequire(codecDir);
  if (typeof g.__dirname === 'undefined') g.__dirname = fileURLToPath(codecDir);
}

function readCodecFile(path: string): Promise<Buffer> {
  return readFile(new URL(path, codecDir));
}

const cache = new Map<string, Promise<any>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key)!;
}

/**
 * Loads an Emscripten module, e.g. `mozjpeg/enc/mozjpeg_enc` (no extension).
 * Mirrors features/worker-utils initEmscriptenModule: `noInitialRun: true`.
 */
export function loadEmscripten<T = any>(base: string): Promise<T> {
  return cached(base, async () => {
    installShims();
    const [mod, wasmBinary] = await Promise.all([
      import(new URL(`${base}.js`, codecDir).href),
      readCodecFile(`${base}.wasm`),
    ]);
    return mod.default({ noInitialRun: true, wasmBinary });
  });
}

/**
 * Loads a wasm-bindgen package, e.g. ('resize/pkg', 'squoosh_resize'),
 * and returns its exports once initialised.
 */
export function loadWasmBindgen<T = any>(dir: string, name: string): Promise<T> {
  const key = `${dir}/${name}`;
  return cached(key, async () => {
    installShims();
    const [mod, wasm] = await Promise.all([
      import(new URL(`${dir}/${name}.js`, codecDir).href),
      readCodecFile(`${dir}/${name}_bg.wasm`),
    ]);
    await mod.default(wasm);
    return mod as T;
  });
}

/** Loads a raw wasm module with no JS glue (used by rotate). */
export function loadRawWasm(path: string): Promise<WebAssembly.Instance> {
  return cached(path, async () => {
    const bytes = await readCodecFile(path);
    const { instance } = await WebAssembly.instantiate(bytes);
    return instance;
  });
}
