import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../src/main.js';
import { encoders } from '../src/encoders/index.js';
import { decodeImage, sniffMimeType } from '../src/decode.js';
import { loadWasmBindgen } from '../src/codecs.js';

let dir: string;
let png: string;
const W = 96;
const H = 64;

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'squoosh-cli-test-'));
  // Gradient with a partly transparent area, encoded with the PNG codec.
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = (x * 255) / W;
      px[i + 1] = (y * 255) / H;
      px[i + 2] = 128;
      px[i + 3] = x < 10 ? 128 : 255;
    }
  }
  const { encode } = await loadWasmBindgen<any>('png/pkg', 'squoosh_png');
  png = join(dir, 'fixture.png');
  await writeFile(png, encode(new Uint8Array(px.buffer), W, H));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

for (const encoder of encoders) {
  test(`encodes with ${encoder.id} at default settings`, async () => {
    const out = join(dir, `out-${encoder.id}`);
    const code = await quiet(() => main(['compress', png, '-e', encoder.id, '-o', out]));
    assert.equal(code, 0);
    const bytes = new Uint8Array(await readFile(join(out, `fixture.${encoder.extension}`)));
    assert.equal(sniffMimeType(bytes), encoder.mimeType);
    const decoded = await decodeImage(bytes);
    assert.equal(decoded.width, W);
    assert.equal(decoded.height, H);
  });
}

test('rotate, resize and reduce palette are applied before encoding', async () => {
  const out = join(dir, 'out-processed');
  const code = await quiet(() =>
    main(['compress', png, '-e', 'oxipng', '-o', out, '--rotate', '90', '--resize-width', '32', '--reduce-palette', '--colors', '8']),
  );
  assert.equal(code, 0);
  const decoded = await decodeImage(new Uint8Array(await readFile(join(out, 'fixture.png'))));
  // 96x64 rotated -> 64x96, then width 32 keeps aspect -> 32x48.
  assert.equal(decoded.width, 32);
  assert.equal(decoded.height, 48);
  const colors = new Set<number>();
  const u32 = new Uint32Array(decoded.data.buffer, decoded.data.byteOffset, decoded.width * decoded.height);
  for (const c of u32) colors.add(c);
  assert.ok(colors.size <= 8, `expected <= 8 colours, got ${colors.size}`);
});

test('hqx and contain resize run', async () => {
  const out = join(dir, 'out-hqx');
  assert.equal(await quiet(() => main(['compress', png, '-e', 'qoi', '-o', out, '--resize-method', 'hqx', '--resize-preset', '200'])), 0);
  const big = await decodeImage(new Uint8Array(await readFile(join(out, 'fixture.qoi'))));
  assert.deepEqual([big.width, big.height], [192, 128]);

  const out2 = join(dir, 'out-contain');
  assert.equal(await quiet(() => main(['compress', png, '-e', 'qoi', '-o', out2, '--no-maintain-aspect', '--resize-width', '50', '--resize-height', '50', '--fit-method', 'contain'])), 0);
  const sq = await decodeImage(new Uint8Array(await readFile(join(out2, 'fixture.qoi'))));
  assert.deepEqual([sq.width, sq.height], [50, 50]);
});

test('JPEG and WebP outputs can be used as inputs', async () => {
  for (const input of [join(dir, 'out-mozjpeg', 'fixture.jpg'), join(dir, 'out-webp', 'fixture.webp')]) {
    const out = join(dir, `out-chain-${input.slice(-4)}`);
    assert.equal(await quiet(() => main(['compress', input, '-e', 'avif', '-o', out])), 0);
    assert.deepEqual(await readdir(out), ['fixture.avif']);
  }
});

test('two inputs that map to the same output name are rejected', async () => {
  const sub = join(dir, 'sub');
  await mkdir(sub, { recursive: true });
  await writeFile(join(sub, 'fixture.png'), await readFile(png));
  const code = await quiet(() => main(['compress', png, join(sub, 'fixture.png'), '-o', join(dir, 'out-dupe')]));
  assert.equal(code, 2);
});

test('an output that would overwrite its own input is rejected', async () => {
  const code = await quiet(() => main(['compress', png, '-e', 'oxipng', '-o', dir]));
  assert.equal(code, 2);
});

test('missing inputs and unsupported formats are reported', async () => {
  assert.equal(await quiet(() => main(['compress', join(dir, 'nope.png'), '-o', join(dir, 'x')])), 2);
  const gif = join(dir, 'a.gif');
  await writeFile(gif, Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'));
  assert.equal(await quiet(() => main(['compress', gif, '-o', join(dir, 'out-gif')])), 1);
});

test('without -o, writes to squoosh_out_<unix timestamp> in the current directory', async () => {
  const cwd = process.cwd();
  const work = join(dir, 'cwd');
  await mkdir(work, { recursive: true });
  process.chdir(work);
  try {
    const before = Math.floor(Date.now() / 1000);
    assert.equal(await quiet(() => main(['compress', png])), 0);
    const after = Math.floor(Date.now() / 1000);
    const entries = await readdir(work);
    assert.equal(entries.length, 1);
    const match = /^squoosh_out_(\d+)$/.exec(entries[0]);
    assert.ok(match, entries[0]);
    const ts = Number(match![1]);
    assert.ok(ts >= before && ts <= after);
    assert.deepEqual(await readdir(join(work, entries[0])), ['fixture.jpg']);
  } finally {
    process.chdir(cwd);
  }
});

test('existing output files are overwritten', async () => {
  const out = join(dir, 'out-overwrite');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'fixture.jpg'), 'old');
  assert.equal(await quiet(() => main(['compress', png, '-o', out])), 0);
  const bytes = new Uint8Array(await readFile(join(out, 'fixture.jpg')));
  assert.equal(sniffMimeType(bytes), 'image/jpeg');
});
