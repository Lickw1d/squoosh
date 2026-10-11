// Copies the codec builds the CLI needs from the repo's codecs/ folder into
// dist/codecs/. These are the same prebuilt files the web app ships (the
// browser "web" builds), so the CLI's output matches the app's.
//
// The exception is decoding JPEG and PNG input: the app hands those to the
// browser's built-in decoder, so the CLI uses MozJPEG's Node decoder and the
// Rust PNG crate instead.
import { copyFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const codecsSrc = join(cliRoot, '..', 'codecs');
const codecsDest = join(cliRoot, 'dist', 'codecs');

const emscripten = (base) => [`${base}.js`, `${base}.wasm`];
const wasmBindgen = (dir, name) => [
  `${dir}/${name}.js`,
  `${dir}/${name}_bg.wasm`,
];

export const codecFiles = [
  // Encoders
  ...emscripten('mozjpeg/enc/mozjpeg_enc'),
  ...emscripten('webp/enc/webp_enc'),
  ...emscripten('webp/enc/webp_enc_simd'),
  ...emscripten('avif/enc/avif_enc'),
  ...emscripten('jxl/enc/jxl_enc'),
  ...emscripten('wp2/enc/wp2_enc'),
  ...emscripten('qoi/enc/qoi_enc'),
  ...wasmBindgen('oxipng/pkg', 'squoosh_oxipng'),
  // Decoders
  ...emscripten('mozjpeg/dec/mozjpeg_node_dec'),
  ...wasmBindgen('png/pkg', 'squoosh_png'),
  ...emscripten('webp/dec/webp_dec'),
  ...emscripten('avif/dec/avif_dec'),
  ...emscripten('jxl/dec/jxl_dec'),
  ...emscripten('wp2/dec/wp2_dec'),
  ...emscripten('qoi/dec/qoi_dec'),
  // Processors
  ...wasmBindgen('resize/pkg', 'squoosh_resize'),
  ...wasmBindgen('hqx/pkg', 'squooshhqx'),
  ...emscripten('imagequant/imagequant'),
  'rotate/rotate.wasm',
];

const missing = [];
for (const file of codecFiles) {
  try {
    await access(join(codecsSrc, file));
  } catch {
    missing.push(file);
  }
}
if (missing.length) {
  console.error(
    `Missing codec build files in ${codecsSrc}:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}

for (const file of codecFiles) {
  const dest = join(codecsDest, file);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(codecsSrc, file), dest);
}

console.log(`Copied ${codecFiles.length} codec files to dist/codecs`);
