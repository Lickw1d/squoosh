/**
 * Declarative description of every setting the CLI accepts.
 *
 * Each OptionDef corresponds to one control in the web app's options panel
 * (a slider, checkbox or select). `uiLabel` is the label shown in the app so
 * people can map between the two. Defaults are always derived from the app's
 * shared/meta.ts files, never written out by hand.
 */

export type ResolvedValue = number | boolean | string | undefined;

/** Read-only view of the resolved settings (user-provided over defaults). */
export interface Values {
  num(flag: string): number;
  /** Number that may have no default (e.g. resize width). */
  optNum(flag: string): number | undefined;
  bool(flag: string): boolean;
  /** Enum token as typed on the command line, e.g. 'ycbcr'. */
  token(flag: string): string;
  /** The underlying value the token maps to, e.g. MozJpegColorSpace.YCbCr. */
  enumValue<T = number | string>(flag: string): T;
  /** Whether the user passed this flag explicitly. */
  provided(flag: string): boolean;
}

interface BaseOption {
  /** Flag name without leading dashes, kebab-case. */
  flag: string;
  /** Label of the matching control in the web app. */
  uiLabel: string;
  /** Extra help text. */
  description?: string;
  /** Shown under "Advanced settings" in the app. */
  advanced?: boolean;
  /** Overrides the default shown in help. */
  defaultText?: string;
  /**
   * The app only shows this control in some states. If the user passes the
   * flag while `when` is false, it's an error rather than a silent no-op.
   */
  when?: { describe: string; test(v: Values): boolean };
}

export interface NumberOption extends BaseOption {
  kind: 'number';
  min: number | ((v: Values) => number);
  max: number | ((v: Values) => number);
  /** The slider's step. 1 means whole numbers only. */
  step: number;
  /** Omitted when the default depends on the image (e.g. resize width). */
  default?: number | ((v: Values) => number);
  rangeText?: string;
}

export interface BooleanOption extends BaseOption {
  kind: 'boolean';
  default: boolean;
}

export interface EnumChoice {
  /** Shell-safe token: lowercase letters, digits, dots and hyphens. */
  token: string;
  uiLabel: string;
  value: number | string;
}

export interface EnumOption extends BaseOption {
  kind: 'enum';
  choices: EnumChoice[];
  /** The default *value* (from meta.ts); the token is looked up from it. */
  defaultValue: number | string;
}

export type OptionDef = NumberOption | BooleanOption | EnumOption;

export const SHELL_SAFE_TOKEN = /^[a-z0-9][a-z0-9.-]*$/;
export const SHELL_SAFE_FLAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function defaultToken(opt: EnumOption): string {
  const choice = opt.choices.find((c) => c.value === opt.defaultValue);
  if (!choice) {
    throw new Error(
      `Internal: default ${opt.defaultValue} for --${opt.flag} is not one of its choices`,
    );
  }
  return choice.token;
}

/**
 * Builds a Values view from user input (already parsed to typed values)
 * layered over each option's default.
 */
export function createValues(
  defs: OptionDef[],
  provided: Map<string, number | boolean | string>,
): Values {
  const byFlag = new Map(defs.map((d) => [d.flag, d]));

  const get = (flag: string): ResolvedValue => {
    const def = byFlag.get(flag);
    if (!def) throw new Error(`Internal: unknown option --${flag}`);
    if (provided.has(flag)) return provided.get(flag);
    switch (def.kind) {
      case 'boolean':
        return def.default;
      case 'enum':
        return defaultToken(def);
      case 'number':
        return typeof def.default === 'function'
          ? def.default(values)
          : def.default;
    }
  };

  const values: Values = {
    num(flag) {
      const v = get(flag);
      if (typeof v !== 'number') throw new Error(`Internal: --${flag} is not a number`);
      return v;
    },
    optNum(flag) {
      const v = get(flag);
      return typeof v === 'number' ? v : undefined;
    },
    bool(flag) {
      const v = get(flag);
      if (typeof v !== 'boolean') throw new Error(`Internal: --${flag} is not a boolean`);
      return v;
    },
    token(flag) {
      const v = get(flag);
      if (typeof v !== 'string') throw new Error(`Internal: --${flag} is not an enum`);
      return v;
    },
    enumValue(flag) {
      const def = byFlag.get(flag) as EnumOption;
      const token = values.token(flag);
      return def.choices.find((c) => c.token === token)!.value as any;
    },
    provided(flag) {
      return provided.has(flag);
    },
  };
  return values;
}

export function resolveBound(
  bound: number | ((v: Values) => number),
  values: Values,
): number {
  return typeof bound === 'function' ? bound(values) : bound;
}

/** Help-text rendering of a number option's accepted range. */
export function describeRange(opt: NumberOption): string {
  if (opt.rangeText) return opt.rangeText;
  const fmt = (b: number | ((v: Values) => number)) =>
    typeof b === 'function' ? '?' : b === Infinity ? '' : String(b);
  const max = fmt(opt.max);
  const range = max ? `${fmt(opt.min)}-${max}` : `>=${fmt(opt.min)}`;
  return opt.step === 1 ? range : `${range}, step ${opt.step}`;
}
