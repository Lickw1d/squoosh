# Squoosh CLI

Compress images from the command line using the same codecs, settings and
defaults as the Squoosh web app.

```sh
cd cli
npm install
npm run build
./bin/squoosh.js compress photo.png                      # MozJPEG, app defaults
./bin/squoosh.js compress *.png -e webp --quality 80 -o dist
./bin/squoosh.js help                                    # every option and value
```

`npm link` (from this folder) puts `squoosh` on your PATH.

## Behaviour

- One command, `compress`, with one encoder per run (`--encoder`, default
  `mozjpeg`, the same as the app's right-hand panel).
- Every control in the app's options panels, including the advanced settings,
  is a flag. Flags are named after the app's labels, and `squoosh help` shows
  each label next to its flag.
- Optional settings stay optional. Defaults come from the app's
  `src/features/*/*/shared/meta.ts` files at build time, so they can't drift.
- Values are validated: ranges, slider steps, and enum values, which are
  shell-safe tokens such as `ycbcr` or `pseudo-random-dithering`. Settings the
  app only shows in certain states (for example chroma quality, which needs
  "Separate chroma quality") are rejected unless that state is set. All
  errors are reported together; the exit code is 2.
- Output goes to `--output-dir`, or `./squoosh_out_<unix timestamp>` if not
  given. Existing files are overwritten. An output that would replace its own
  input, or two inputs that map to the same output name, are rejected before
  anything is written.
- Pipeline order matches the app: decode → rotate → resize → reduce palette →
  encode.

## How it relates to the app

The CLI is a separate package. It doesn't change or import any app UI code.
Two things are reused from the main repo:

| From the repo | Used for |
| --- | --- |
| `src/features/**/shared/meta.ts` (+ resize `shared/util.ts`) | Option types, defaults, labels, extensions |
| `codecs/` prebuilt `.js` + `.wasm` | Copied to `dist/codecs` at build time |

The encoders and the WebP/AVIF/JPEG XL/WebP2/QOI decoders are the same web
builds the app runs in its worker. They load in Node through a few small
globals set in `src/codecs.ts`. Each app Options component's mapping from UI
controls to encoder options (inverted sliders, lossless presets, the AVIF
"effort = 10 − speed" rule and so on) is reproduced in `src/encoders/*.ts`. A
test checks that untouched CLI settings produce exactly each `meta.ts`
`defaultOptions`.

## Differences from the app

- **Browser-only features aren't available**: GIF/BMP/TIFF/SVG input; the
  Browser JPEG/PNG/GIF encoders; the Browser and Vector resize methods.
- **JPEG and PNG input** are decoded by MozJPEG and the Rust `png` crate
  instead of the browser. EXIF orientation is applied, as browsers do. Embedded
  color profiles are not converted to sRGB the way browsers do, so non-sRGB
  sources (for example Display P3 phone photos) can come out with slightly
  different colors.
- **Threading**: the app uses the multithreaded AVIF, JPEG XL, WebP2 and
  OxiPNG builds when the page allows it. The CLI uses their single-threaded
  builds of the same codecs.
- The committed `*_node_*` AVIF encoder builds in `codecs/avif/enc` are older
  than the web build (they expect an option called `enableSharpDownsampling`),
  which is why the CLI uses the web builds.

## Development

```sh
npm test        # build, then unit + end-to-end tests (node:test)
```

- `src/options.ts`: option schema and resolved values.
- `src/args.ts`: parsing and validation.
- `src/help.ts`: help output, generated from the schemas.
- `src/encoders/*`, `src/processors/*`: one file per app feature.
- `src/decode.ts`, `src/exif.ts`: input decoding.
- `src/compress.ts`: the pipeline and output handling.

To add an encoder, add its file under `src/encoders/` and list it in
`src/encoders/index.ts`. Then add its codec files to
`scripts/copy-codecs.mjs`.
