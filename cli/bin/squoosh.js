#!/usr/bin/env node
import { main } from '../dist/cli/src/main.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  },
);
