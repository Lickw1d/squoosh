/**
 * Strict command-line parsing for `squoosh compress`.
 *
 * Every flag is validated against the option catalogue: unknown flags,
 * values out of range, off-step numbers, unknown enum tokens, and flags that
 * the app wouldn't show in the current state are all errors, and all errors
 * are reported together.
 */
import { defaultEncoderId, encoders, findEncoder, EncoderDef } from './encoders/index.js';
import {
  createValues,
  describeRange,
  NumberOption,
  OptionDef,
  resolveBound,
  Values,
} from './options.js';
import { processorOptions, validateProcessors } from './processors/index.js';

export class UsageError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('\n'));
  }
}

export interface CompressArgs {
  inputs: string[];
  outputDir?: string;
  encoder: EncoderDef<any>;
  values: Values;
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'compress'; args: CompressArgs };

const OUTPUT_DIR = ['-o', '--output-dir'];
const ENCODER = ['-e', '--encoder'];
const HELP = ['-h', '--help'];

function splitFlag(arg: string): [key: string, inlineValue: string | undefined] {
  const eq = arg.indexOf('=');
  return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
}

/**
 * Flag types depend on the encoder (e.g. --slight-loss is a number for WebP
 * but a switch for JPEG XL), so find --encoder before parsing anything else.
 */
function findEncoderArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') break;
    const [key, inline] = splitFlag(args[i]);
    if (ENCODER.includes(key)) return inline ?? args[i + 1];
  }
  return undefined;
}

export function parseArgs(argv: string[]): ParsedCommand {
  if (argv.length === 0) return { kind: 'help' };
  const dashDash = argv.indexOf('--');
  const beforeDashDash = dashDash === -1 ? argv : argv.slice(0, dashDash);
  if (beforeDashDash.some((a) => HELP.includes(a))) return { kind: 'help' };

  const [command, ...rest] = argv;
  if (command === 'help') return { kind: 'help' };
  if (command !== 'compress') {
    throw new UsageError([
      `Unknown command "${command}". The only command is "compress" (run "squoosh help" for usage).`,
    ]);
  }
  // `squoosh compress` on its own shows the help.
  if (rest.length === 0) return { kind: 'help' };

  const errors: string[] = [];

  const encoderId = findEncoderArg(rest)?.toLowerCase();
  let encoder = findEncoder(encoderId ?? defaultEncoderId);
  if (!encoder) {
    errors.push(
      `Unknown encoder "${encoderId}". Choose one of: ${encoders.map((e) => e.id).join(', ')}.`,
    );
    encoder = findEncoder(defaultEncoderId)!;
  }

  const defs: OptionDef[] = [...processorOptions, ...encoder.options];
  const byFlag = new Map(defs.map((d) => [d.flag, d]));
  const provided = new Map<string, number | boolean | string>();
  const inputs: string[] = [];
  let outputDir: string | undefined;
  let sawEncoder = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (arg === '--') {
      inputs.push(...rest.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      inputs.push(arg);
      continue;
    }

    const [key, inlineValue] = splitFlag(arg);

    // Takes the value after "=", or else the next argument.
    const takeValue = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) return undefined;
      i++;
      return next;
    };

    if (OUTPUT_DIR.includes(key)) {
      const value = takeValue();
      if (!value) errors.push(`${key} needs a directory.`);
      else if (outputDir !== undefined) errors.push(`${key} was given more than once.`);
      else outputDir = value;
      continue;
    }
    if (ENCODER.includes(key)) {
      const value = takeValue();
      if (!value) errors.push(`${key} needs a value (${encoders.map((e) => e.id).join('|')}).`);
      else if (sawEncoder) errors.push(`${key} was given more than once.`);
      sawEncoder = true;
      continue;
    }
    if (!key.startsWith('--')) {
      errors.push(`Unknown option "${key}". The short options are -o, -e and -h.`);
      continue;
    }

    const name = key.slice(2);
    let def = byFlag.get(name);
    let negated = false;
    if (!def && name.startsWith('no-')) {
      const positive = byFlag.get(name.slice(3));
      if (positive?.kind === 'boolean') {
        def = positive;
        negated = true;
      }
    }
    if (!def) {
      errors.push(unknownFlagMessage(key, encoder, defs));
      continue;
    }
    if (provided.has(def.flag)) {
      errors.push(`--${def.flag} was given more than once.`);
      if (def.kind !== 'boolean' && inlineValue === undefined) takeValue();
      continue;
    }

    if (def.kind === 'boolean') {
      if (negated) {
        if (inlineValue !== undefined) errors.push(`${key} doesn't take a value.`);
        else provided.set(def.flag, false);
      } else if (inlineValue === undefined) {
        provided.set(def.flag, true);
      } else if (inlineValue === 'true' || inlineValue === 'false') {
        provided.set(def.flag, inlineValue === 'true');
      } else {
        errors.push(`${key} is a switch: use --${def.flag} or --no-${def.flag}.`);
      }
      continue;
    }

    const value = takeValue();
    if (!value) {
      errors.push(`--${def.flag} needs a value (${valueHint(def)}).`);
      continue;
    }

    if (def.kind === 'enum') {
      const lower = value.toLowerCase();
      const choice = def.choices.find((c) => c.token === lower);
      if (!choice) {
        errors.push(
          `"${value}" isn't a valid value for --${def.flag}. Choose one of: ${def.choices.map((c) => c.token).join(', ')}.`,
        );
        continue;
      }
      provided.set(def.flag, choice.token);
    } else {
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value)) {
        errors.push(`--${def.flag} must be a number (${describeRange(def)}), got "${value}".`);
        continue;
      }
      provided.set(def.flag, Number(value));
    }
  }

  const values = createValues(defs, provided);

  // Range and step checks (some bounds depend on other settings).
  for (const [flag, value] of provided) {
    const def = byFlag.get(flag)!;
    if (def.kind === 'number') {
      const err = checkNumber(def, value as number, values);
      if (err) errors.push(err);
    }
  }

  // Settings the app only shows in some states.
  for (const flag of provided.keys()) {
    const def = byFlag.get(flag)!;
    if (def.when && !def.when.test(values)) {
      errors.push(`--${flag} only applies with ${def.when.describe}.`);
    }
  }

  errors.push(...validateProcessors(values));
  if (encoder.validate) errors.push(...encoder.validate(values));

  if (inputs.length === 0) {
    errors.push('No input files given. Usage: squoosh compress <input...> [options]');
  }

  if (errors.length) throw new UsageError(errors);

  return { kind: 'compress', args: { inputs, outputDir, encoder, values } };
}

function checkNumber(def: NumberOption, value: number, values: Values): string | undefined {
  const min = resolveBound(def.min, values);
  const max = resolveBound(def.max, values);
  if (value < min || value > max) {
    const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`;
    return `--${def.flag} must be ${range}, got ${value}.`;
  }
  const steps = (value - min) / def.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    return def.step === 1
      ? `--${def.flag} must be a whole number, got ${value}.`
      : `--${def.flag} must be in steps of ${def.step}, got ${value}.`;
  }
  return undefined;
}

function valueHint(def: OptionDef): string {
  if (def.kind === 'enum') return def.choices.map((c) => c.token).join('|');
  if (def.kind === 'number') return describeRange(def);
  return '';
}

function unknownFlagMessage(key: string, encoder: EncoderDef<any>, defs: OptionDef[]): string {
  const name = key.replace(/^--(no-)?/, '');
  const owners = encoders.filter((e) => e !== encoder && e.options.some((o) => o.flag === name));
  if (owners.length) {
    return `${key} is a setting for ${owners.map((e) => `--encoder ${e.id}`).join(' / ')}, not ${encoder.id}.`;
  }
  const candidates = [
    'output-dir',
    'encoder',
    'help',
    ...defs.map((d) => d.flag),
    ...defs.filter((d) => d.kind === 'boolean').map((d) => `no-${d.flag}`),
  ];
  const target = key.slice(2);
  const best = candidates
    .map((c) => ({ c, dist: editDistance(target, c) }))
    .sort((a, b) => a.dist - b.dist)[0];
  const hint = best && best.dist <= 2 ? ` Did you mean --${best.c}?` : '';
  return `Unknown option ${key}.${hint}`;
}

function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}
