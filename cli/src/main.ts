import { parseArgs, UsageError } from './args.js';
import { compress } from './compress.js';
import { helpText } from './help.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/** Runs the CLI and returns the process exit code. */
export async function main(argv: string[]): Promise<number> {
  // "Calling time" for the default output folder name.
  const startedAt = new Date();

  try {
    const command = parseArgs(argv);
    if (command.kind === 'help') {
      console.log(helpText());
      return EXIT_OK;
    }

    const results = await compress(command.args, startedAt, (line) => console.log(line));
    const failed = results.filter((r) => r.error).length;
    if (failed) {
      console.error(`${failed} of ${results.length} failed.`);
      return EXIT_FAILED;
    }
    return EXIT_OK;
  } catch (err) {
    if (err instanceof UsageError) {
      for (const e of err.errors) console.error(`error: ${e}`);
      console.error('Run "squoosh help" to see all options and accepted values.');
      return EXIT_USAGE;
    }
    throw err;
  }
}
