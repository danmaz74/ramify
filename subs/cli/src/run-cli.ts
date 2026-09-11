import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { CliEnvironment, CliExitCode } from './interfaces/cli.js';
import { help, parseArguments } from './arguments.js';
import { checkCommand } from './check-command.js';
import { daemonCommand } from './daemon-command.js';
import { watchCommand } from './watch-command.js';
import { CliFailure } from './errors.js';

export async function runCli(argv: readonly string[], environment: CliEnvironment, control: RunControl = {}): Promise<CliExitCode> {
  const stderr = (text: string): void => { try { environment.stderr(text); } catch { /* The failed output already selects exit 2. */ } };
  const interrupted = (): CliExitCode => { stderr('Interrupted; no result claimed.\n'); return 130; };
  if (control.signal?.aborted) return interrupted();
  const json = argv.some((arg, index) => arg === '--format' && argv[index + 1] === 'json');
  let phase: 'invocation' | 'execution' = 'invocation', outputFailed = false;
  let args: ReturnType<typeof parseArguments> | undefined;
  const output: CliEnvironment = { ...environment,
    stdout(text) { try { environment.stdout(text); } catch (error) { outputFailed = true; throw error; } },
    stderr(text) { try { environment.stderr(text); } catch (error) { outputFailed = true; throw error; } },
  };
  try {
    args = parseArguments(argv);
    if (args.command === 'help' || args.command === 'version') {
      output.stdout(args.command === 'help' ? help : `${environment.version}\n`); return 0;
    }
    phase = 'execution';
    if (args.command === 'check') return await checkCommand(args, output, control);
    if (args.command === 'watch') return await watchCommand(args, output, control);
    if (args.command === 'daemon') return await daemonCommand(args, output, control);
    throw new Error('Invalid command dispatch');
  } catch (error) {
    if (!outputFailed && control.signal?.aborted) return interrupted();
    const code = outputFailed ? 'output-failure' : phase === 'invocation' ? 'invalid-invocation'
      : error instanceof CliFailure ? error.code : 'internal-error';
    const message = error instanceof Error ? error.message : String(error);
    if (json && !outputFailed) {
      try {
        environment.stdout(JSON.stringify(args?.command === 'watch'
          ? { schemaVersion: 'ramify.watch/1', event: code === 'stopped' ? 'stopped' : 'unavailable', reason: message }
          : { schemaVersion: 'ramify.cli/1', status: 'unavailable', diagnostics: [{ category: phase, code, message }], exitCode: 2 }) + '\n');
      } catch { stderr('Error [output-failure]: Cannot write the invocation result.\n'); }
    } else stderr(`Error [${code}]: ${message}\n`);
    return 2;
  }
}
