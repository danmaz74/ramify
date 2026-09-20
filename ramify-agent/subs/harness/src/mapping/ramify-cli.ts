import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The `ramify` executable this package depends on. */
export const ramifyExecutable = fileURLToPath(new URL('../../../../node_modules/.bin/ramify', import.meta.url));

export interface RamifyRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
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
    const env = { ...process.env, ...(this.options.endpointDirectory ? { RAMIFY_ENDPOINT_DIR: this.options.endpointDirectory } : {}) };
    return new Promise(resolve => {
      execFile(this.options.executable ?? ramifyExecutable, [...args], {
        cwd, env, signal, timeout: this.options.timeoutMs ?? 600_000, maxBuffer: 16 * 1024 * 1024,
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
    const result = await this.run(args, projectRoot, signal);
    if (result.code === 0) return { ok: true, output: result.stdout };
    const detail = `${result.stderr}\n${result.stdout}`.trim();
    return { ok: false, message: `\`ramify ${args.join(' ')}\` exited with ${result.code}${detail ? `: ${detail.slice(-2000)}` : ''}` };
  }

  /** Stops this harness's own daemon; with a shared daemon, does nothing. */
  async stopDaemon(): Promise<void> {
    if (!this.ownsDaemon) return;
    await this.run(['daemon', 'stop'], tmpdir());
  }
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
