import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnvironment, outputCapBytes } from './run-command.js';

/** The `ramify` executable this package depends on. */
export const ramifyExecutable = fileURLToPath(new URL('../../../../../node_modules/.bin/ramify', import.meta.url));

export interface RamifyRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * What a `ramify check` invocation answered, from its exit code alone: 0 is
 * checked with no findings, 1 is findings or an invalid revision, and 2 is not
 * checked with the CLI's reason. Exit 2 is never a pass, and neither is any
 * other code the contract does not define.
 */
export interface RamifyCheckResult {
  readonly form: 'complete' | 'changed';
  readonly exitCode: number;
  readonly outcome: 'checked' | 'findings' | 'not-checked';
  /** For `not-checked`, the reason the CLI gave, such as `cold` or `configuration-changed`. */
  readonly reason: string | null;
  /** The document the CLI printed, or null when it printed no JSON. */
  readonly report: unknown;
  readonly stdout: string;
  readonly stderr: string;
}

/** How often a materialization is repeated before the harness reports it unavailable. */
export const materializeAttempts = 4;
/** How long to wait before each repeat. A request superseded by a newer revision needs the newer one to finish. */
const materializePausesMs = [300, 900, 2_000];

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}

export type MaterializeResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly message: string };

/**
 * The toolkit's command line, the only way the harness reaches Ramify.
 * Materialization runs through Ramify's resident daemon. With an endpoint
 * directory, the daemon is this harness's own: nothing else shares it, and
 * the harness may stop it.
 */
export class RamifyCli {
  constructor(readonly options: {
    readonly executable?: string | undefined;
    /** `RAMIFY_ENDPOINT_DIR` for every invocation; the daemon behind it belongs to this harness. */
    readonly endpointDirectory?: string | undefined;
    readonly timeoutMs?: number | undefined;
  } = {}) {}

  /** Whether the daemon is this harness's own, so that stopping it affects no one else. */
  get ownsDaemon(): boolean {
    return this.options.endpointDirectory !== undefined;
  }

  run(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<RamifyRun> {
    const env = childEnvironment(this.options.endpointDirectory ? { RAMIFY_ENDPOINT_DIR: this.options.endpointDirectory } : {});
    return new Promise(resolve => {
      execFile(this.options.executable ?? ramifyExecutable, [...args], {
        cwd, env, signal, timeout: this.options.timeoutMs ?? 600_000, maxBuffer: outputCapBytes,
      }, (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : -1;
        resolve({ code, stdout: String(stdout), stderr: error !== null && code === -1 ? `${String(stderr)}${error.message}` : String(stderr) });
      });
    });
  }

  /**
   * Materializes the project's architect view and, with `apiFrom`, the API
   * views of the module in that project-relative directory, from one
   * revision, as `ramify materialize --view architect [--view api --from <dir>]`.
   */
  async materialize(projectRoot: string, apiFrom?: string, signal?: AbortSignal): Promise<MaterializeResult> {
    const args = ['materialize', '--view', 'architect', ...(apiFrom === undefined ? [] : ['--view', 'api', '--from', apiFrom === '' ? '.' : apiFrom]), '--root', projectRoot];
    // Any failure is repeated a bounded number of times, waiting longer each
    // time, before the harness reports that the view could not be
    // materialized with the last failure's own output. A request against a
    // tree that has just changed can be superseded by a newer revision of the
    // daemon's own analysis, which settles within these pauses. A failure the
    // daemon repeats until its next file event (an analysis-failed answer
    // once did) outlasts them, so a caller that briefs several turns
    // materializes again for a later one rather than repeating this result.
    // Nothing of the output is read to decide a retry.
    let last = '';
    for (let attempt = 1; attempt <= materializeAttempts; attempt += 1) {
      const result = await this.run(args, projectRoot, signal);
      if (result.code === 0) return { ok: true, output: result.stdout };
      const detail = `${result.stderr}\n${result.stdout}`.trim();
      last = `\`ramify ${args.join(' ')}\` exited with ${result.code}${detail ? `: ${detail.slice(-2000)}` : ''}`;
      if (attempt < materializeAttempts) await pause(materializePausesMs[attempt - 1] ?? 2_000);
    }
    return { ok: false, message: `${last} (after ${materializeAttempts} attempts)` };
  }

  /**
   * The complete check, `ramify check --batch --format json --no-snapshot`:
   * an independent session that trusts no retained daemon state, with no
   * deadline. This is the form a gate runs, and the form that gives a
   * configuration edit its verdict. The harness reads the verdict and the
   * findings, never the snapshot of every evaluated import, so the report
   * leaves it out.
   */
  async checkComplete(projectRoot: string, signal?: AbortSignal): Promise<RamifyCheckResult> {
    const args = ['check', '--batch', '--root', projectRoot, '--format', 'json', '--no-snapshot'];
    return answer('complete', args, await this.run(args, projectRoot, signal));
  }

  /**
   * The bounded hook check, `ramify check --changed <path>... --format json
   * --deadline`, run from the directory the paths are relative to. It never
   * falls back to a complete check: a cold daemon, an expired deadline or a
   * named configuration file is answered at once as `not-checked` with the
   * CLI's reason, which permits continued editing and is never a pass. A
   * caller that needs a verdict runs {@link checkComplete} instead of
   * claiming hook coverage.
   */
  async checkChanged(paths: readonly string[], cwd: string, deadlineMs: number, signal?: AbortSignal): Promise<RamifyCheckResult> {
    const args = ['check', '--changed', ...paths, '--format', 'json', '--deadline', String(deadlineMs)];
    return answer('changed', args, await this.run(args, cwd, signal));
  }

  /** Stops this harness's own daemon; with a shared daemon, does nothing. */
  async stopDaemon(): Promise<void> {
    if (!this.ownsDaemon) return;
    await this.run(['daemon', 'stop'], tmpdir());
  }
}

function answer(form: 'complete' | 'changed', args: readonly string[], run: RamifyRun): RamifyCheckResult {
  let report: unknown = null;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    report = null;
  }
  const outcome = run.code === 0 ? 'checked' : run.code === 1 ? 'findings' : 'not-checked';
  return {
    form,
    exitCode: run.code,
    outcome,
    reason: outcome === 'not-checked' ? notCheckedReason(args, run, report) : null,
    report,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

/** The CLI's own reason where it states one, and the invocation with its exit code where it does not. */
function notCheckedReason(args: readonly string[], run: RamifyRun, report: unknown): string {
  const document = report as { reason?: unknown; outcome?: { execution?: unknown } } | null;
  if (typeof document?.reason === 'string' && document.reason !== '') return document.reason;
  if (typeof document?.outcome?.execution === 'string' && document.outcome.execution !== '') return document.outcome.execution;
  const detail = `${run.stderr}\n${run.stdout}`.trim();
  return `\`ramify ${args.join(' ')}\` exited with ${run.code}${detail === '' ? '' : `: ${detail.slice(-2000)}`}`;
}

let versionOnce: Promise<string | null> | undefined;

/** The version the `ramify` CLI reports, or `null` when it cannot be run. */
export function ramifyVersion(): Promise<string | null> {
  versionOnce ??= new RamifyCli().run(['--version'], tmpdir()).then(({ code, stdout }) => (code === 0 && stdout.trim()) || null);
  return versionOnce;
}

/**
 * A `ramify` command line with a daemon of its own, in a new endpoint
 * directory. The daemon's socket path must stay under about 100 bytes, so the
 * directory is short. `dispose` stops the daemon and removes the directory.
 */
export async function privateRamify(options: { readonly timeoutMs?: number | undefined } = {}): Promise<{ readonly ramify: RamifyCli; dispose(): Promise<void> }> {
  const base = join(tmpdir(), 'ra-XXXXXX', 'daemon-0123456789abcdef.sock').length <= 100 ? tmpdir() : existsSync('/tmp') ? '/tmp' : tmpdir();
  const endpointDirectory = await mkdtemp(join(base, 'ra-'));
  const ramify = new RamifyCli({ endpointDirectory, timeoutMs: options.timeoutMs });
  return {
    ramify,
    dispose: async () => {
      await ramify.stopDaemon();
      await rm(endpointDirectory, { recursive: true, force: true });
    },
  };
}
