import { RamifyCli, type MaterializeResult, type RamifyRun } from '../../../subs/evidence/src/ramify-cli.js';

/*
 * The toolkit's command line, without the command line.
 *
 * `stubRamify` installs a real executable that answers its version and
 * nothing else, and a run then spawns it: once for readiness, once for each
 * guarded write's hook check, and four times for each materialization, whose
 * repeats wait 300, 900 and 2,000 ms before the adapter reports the view
 * unavailable. A lifecycle scenario pays all of that to reach a result it
 * already knows.
 *
 * This fake answers the same results at once. It is not a Ramify: it
 * materializes nothing and checks nothing, and it says so in the message the
 * run records, so a run's evidence stays unavailable rather than becoming a
 * synthetic pass. Tests whose subject is the adapter itself — its retry
 * policy, its exit-code reading, its daemon — keep the real command line.
 */

/** One call a run made at this boundary. */
export interface RamifyCall {
  readonly operation: 'run' | 'materialize' | 'stop-daemon';
  readonly argv: readonly string[];
  readonly answer: string;
}

/** The version the fake answers, in the form `ramify --version` prints. */
const version = 'ramify 0.0.0 (the boundary spike\'s fake command line)';

/** What the real stub executable prints for anything but its version. */
const unavailable = JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable', reason: 'stub', exitCode: 2 });

/**
 * A `RamifyCli` that starts no process.
 *
 * `run` answers what the run tests' stub executable answers, so the real
 * adapter's exit-code reading still decides what `checkChanged` and
 * `checkComplete` mean. `materialize` is answered directly, because the real
 * adapter would repeat a result this fake already knows and wait between the
 * repeats.
 */
export class FakeRamifyCli extends RamifyCli {
  readonly calls: RamifyCall[] = [];

  constructor() {
    super({ executable: '/nonexistent/the-boundary-spike-starts-no-ramify', timeoutMs: 0 });
  }

  override async run(args: readonly string[], _cwd: string, _signal?: AbortSignal): Promise<RamifyRun> {
    const answer: RamifyRun = args[0] === '--version'
      ? { code: 0, stdout: `${version}\n`, stderr: '' }
      : { code: 2, stdout: `${unavailable}\n`, stderr: '' };
    this.calls.push({ operation: 'run', argv: [...args], answer: `exit ${answer.code}` });
    return answer;
  }

  override async materialize(projectRoot: string, apiFrom?: string, _signal?: AbortSignal): Promise<MaterializeResult> {
    const argv = ['materialize', '--view', 'architect', ...(apiFrom === undefined ? [] : ['--view', 'api', '--from', apiFrom === '' ? '.' : apiFrom]), '--root', projectRoot];
    const result: MaterializeResult = {
      ok: false,
      message: `\`ramify ${argv.join(' ')}\` was not run: this test's fake command line materializes no view (status unavailable, reason "stub")`,
    };
    this.calls.push({ operation: 'materialize', argv, answer: 'unavailable' });
    return result;
  }

  override async stopDaemon(): Promise<void> {
    this.calls.push({ operation: 'stop-daemon', argv: ['daemon', 'stop'], answer: 'no daemon' });
  }

  /** How many times one operation was asked for. */
  count(operation: RamifyCall['operation']): number {
    return this.calls.filter(call => call.operation === operation).length;
  }
}
