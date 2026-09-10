import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export interface CommandResult {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly error: string | null;
}

/** Finite POSIX command lifetime, including npm's children on timeout. */
export async function command(cwd: string, executable: string, args: readonly string[], timeoutMs = 120_000): Promise<CommandResult> {
  const started = performance.now();
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let bytes = 0, error: string | null = null;
    const stop = (message: string) => {
      error ??= message;
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL'); }
      }
    };
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 32 * 1024 ** 2) stop('Command output exceeded 32 MiB; evidence is incomplete');
      else chunks.push(chunk);
    };
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
    child.once('error', cause => { error = cause.message; });
    const timer = setTimeout(() => stop(`Command exceeded ${timeoutMs} ms`), timeoutMs);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ command: [executable, ...args], cwd, code, signal, error,
        stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
        durationMs: Math.round((performance.now() - started) * 1000) / 1000 });
    });
  });
}
