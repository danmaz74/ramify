import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childEnvironment, environmentNames, outputTailBytes, runCommand } from '../run-command.js';
import { temporaryDirectory } from './helpers/temporary.js';

const exec = promisify(execFile);

/**
 * A command runs in its own process group with an environment the harness
 * built, and how it ended is never read from what it printed.
 */
describe('runCommand', () => {
  let directory: { path: string; remove: () => Promise<void> };
  beforeEach(async () => {
    directory = await temporaryDirectory();
  });
  afterEach(async () => {
    await directory.remove();
  });

  const request = (script: string, overrides: Partial<Parameters<typeof runCommand>[0]> = {}) => ({
    argv: ['bash', '-c', script],
    cwd: directory.path,
    env: childEnvironment(),
    timeoutMs: 30_000,
    outputFile: join(directory.path, 'output.log'),
    ...overrides,
  });

  it('completes with the exit code the command chose and writes its complete output', async () => {
    const run = await runCommand(request('echo out; echo err >&2; exit 0'));

    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 });
    expect(run.stdout).toBe('out\n');
    expect(run.stderr).toBe('err\n');
    expect(run.output.path).toBe(join(directory.path, 'output.log'));
    expect(await readFile(run.output.path ?? '', 'utf8')).toBe('out\nerr\n');
    expect(run.output.bytes).toBe(8);
    expect(run.output.truncated).toBe(false);
    expect(run.output.tail).toBe('out\nerr\n');
    expect(run.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(run.startedAt)).not.toBeNaN();
  });

  it('passes exact stdin bytes through the process-group start barrier', async () => {
    const input = 'src/tmp/\0subs/space name/src/tmp/\0';
    const run = await runCommand(request('cat', { stdin: input }));
    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 });
    expect(run.stdout).toBe(input);
  });

  it('holds the command behind durable group registration and reports its kernel identity', async () => {
    const marker = join(directory.path, 'started.txt');
    let release!: () => void;
    const registered = new Promise<void>(resolve => { release = resolve; });
    let observed: { pid: number; identity: string | null } | null = null;
    const running = runCommand(request(`echo started > ${marker}`, {
      registerProcessGroup: async (pid, identity) => {
        observed = { pid, identity };
        await registered;
      },
    }));
    for (let attempt = 0; attempt < 100 && observed === null; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(observed).not.toBeNull();
    expect(observed!.pid).toBeGreaterThan(0);
    if (process.platform === 'linux') expect(observed!.identity).toMatch(/^[0-9a-f-]+:\d+$/u);
    await expect(stat(marker)).rejects.toThrow();
    release();
    expect((await running).outcome).toEqual({ kind: 'completed', exitCode: 0 });
    expect(await readFile(marker, 'utf8')).toBe('started\n');
  });

  it('tells a non-zero exit from a timeout', async () => {
    const failed = await runCommand(request('exit 7'));
    const timedOut = await runCommand(request('sleep 30', { timeoutMs: 300 }));

    expect(failed.outcome).toEqual({ kind: 'completed', exitCode: 7 });
    expect(timedOut.outcome).toEqual({ kind: 'timed-out', timeoutMs: 300 });
  });

  it('surfaces a spawn failure as a runner error with its string code', async () => {
    const run = await runCommand(request('echo never', { cwd: join(directory.path, 'absent') }));

    expect(run.outcome.kind).toBe('runner-error');
    expect(run.outcome.kind === 'runner-error' && run.outcome.error.kind).toBe('ENOENT');
    expect(run.outcome.kind === 'runner-error' && run.outcome.error.message).toContain('ENOENT');
  });

  it('reports a cancelled command as cancelled, not as a failure', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    const run = await runCommand(request('sleep 30', { signal: controller.signal }));

    expect(run.outcome).toEqual({ kind: 'cancelled' });
  });

  it('reports output beyond the cap as truncated and never as a pass', async () => {
    const run = await runCommand(request('head -c 4000 /dev/zero | tr "\\0" "a"', { maxBytes: 1_000 }));

    expect(run.outcome.kind).toBe('runner-error');
    expect(run.outcome.kind === 'runner-error' && run.outcome.error.kind).toBe('ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
    expect(run.output.truncated).toBe(true);
  });

  it('bounds the tail it answers while the file keeps the complete output', async () => {
    const run = await runCommand(request(`head -c ${outputTailBytes * 2} /dev/zero | tr "\\0" "b"`));

    expect(run.output.bytes).toBe(outputTailBytes * 2);
    expect(run.output.tail.length).toBe(outputTailBytes);
    expect((await stat(run.output.path ?? '')).size).toBe(outputTailBytes * 2);
  });

  it('writes no output file when the caller asked for none', async () => {
    const run = await runCommand(request('echo answer', { outputFile: undefined }));

    expect(run.output.path).toBeNull();
    expect(run.stdout).toBe('answer\n');
    expect(run.output.tail).toBe('answer\n');
  });

  /**
   * The wrapper script's purpose: a command that leaves a descendant running
   * is settled by its process group, so the harness never waits on a leak.
   */
  it('settles a descendant that outlives the command, by its process group', async () => {
    const marker = join(directory.path, 'leaked.txt');
    const token = `ramify-agent-descendant-${process.pid}`;

    const run = await runCommand(request(
      `ps -o pgid= -p $$ | tr -d ' '; (sleep 30; echo ${token} > ${marker}) &\nexit 0`,
    ));

    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 });
    const group = run.stdout.trim().split('\n')[0] ?? '';
    expect(group).toMatch(/^\d+$/);
    expect(group).not.toBe(String(process.pid));

    const { stdout } = await exec('bash', ['-c', `pgrep -g ${group} || true`], { cwd: directory.path });
    expect(stdout.trim()).toBe('');
    await expect(stat(marker)).rejects.toThrow();
  });
});

describe('childEnvironment', () => {
  it('leaves NODE_OPTIONS out of the child environment', async () => {
    const directory = await temporaryDirectory();
    const inherited = process.env['NODE_OPTIONS'];
    process.env['NODE_OPTIONS'] = '--import tsx';
    try {
      const run = await runCommand({
        argv: ['bash', '-c', 'echo "[${NODE_OPTIONS-unset}]"; echo "[$RAMIFY_AGENT_PROBE]"'],
        cwd: directory.path,
        env: childEnvironment({ RAMIFY_AGENT_PROBE: 'given' }),
        timeoutMs: 30_000,
      });

      expect(childEnvironment()).not.toHaveProperty('NODE_OPTIONS');
      expect(run.stdout).toBe('[unset]\n[given]\n');
    } finally {
      if (inherited === undefined) delete process.env['NODE_OPTIONS'];
      else process.env['NODE_OPTIONS'] = inherited;
      await directory.remove();
    }
  });

  it('builds a complete environment, so no caller merges this process again', () => {
    const env = childEnvironment({ RAMIFY_AGENT_PROBE: 'given' });

    expect(env['PATH']).toBe(process.env['PATH']);
    expect(env['RAMIFY_AGENT_PROBE']).toBe('given');
    expect(Object.values(env).every(value => typeof value === 'string')).toBe(true);
  });

  it('passes on the allowlist and withholds everything else, in a real child', async () => {
    const directory = await temporaryDirectory();
    process.env['RAMIFY_AGENT_TEST_SECRET'] = 'hunter2';
    process.env['npm_config_registry'] = 'https://registry.invalid/';
    try {
      const env = childEnvironment();
      expect(env).not.toHaveProperty('RAMIFY_AGENT_TEST_SECRET');
      expect(env['npm_config_registry']).toBe('https://registry.invalid/');

      const run = await runCommand({
        argv: ['bash', '-c', 'echo "[${RAMIFY_AGENT_TEST_SECRET-unset}]"; echo "[${npm_config_registry-unset}]"; echo "[${HOME:+set}]"'],
        cwd: directory.path,
        env,
        timeoutMs: 30_000,
      });

      expect(run.stdout).toBe('[unset]\n[https://registry.invalid/]\n[set]\n');
      expect(run.stdout).not.toContain('hunter2');
    } finally {
      delete process.env['RAMIFY_AGENT_TEST_SECRET'];
      delete process.env['npm_config_registry'];
      await directory.remove();
    }
  });
});

describe('environmentNames', () => {
  it('answers the names of an environment, sorted, and no value of it', () => {
    expect(environmentNames({ PATH: '/bin', HOME: '/home/app', CI: undefined })).toEqual(['CI', 'HOME', 'PATH']);
    expect(JSON.stringify(environmentNames({ SECRET: 'hunter2' }))).not.toContain('hunter2');
  });
});
