import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childEnvironment, environmentNames, outputTailBytes, processGroupCleanupScript, runCommand } from '../run-command.js';
import { temporaryDirectory } from './helpers/temporary.js';

const exec = promisify(execFile);

describe('command cleanup wrapper', () => {
  // Run the complete wrapper, including wait and its original exit code. Shell
  // functions control only signal delivery and the grace sleep; no wall-clock
  // threshold decides whether the completed/no-target path is correct.
  for (const mode of ['group', 'single'] as const) {
    for (const targetRemains of [false, true]) {
      it(`${mode}: ${targetRemains ? 'waits and escalates after delivered TERM' : 'does not sleep or escalate when TERM finds no target'}`, async () => {
        const result = await exec('bash', ['-c', `
command() {
  if [ "$1" = -v ] && [ "$2" = setsid ]; then ${mode === 'group' ? 'return 0' : 'return 1'}; fi
  builtin command "$@"
}
setsid() { "$@"; }
kill() {
  printf 'signal:%s\\n' "$*"
  if [ "$1" = -TERM ]; then ${targetRemains ? 'return 0' : 'return 1'}; fi
}
sleep() { printf 'sleep:%s\\n' "$*"; }
source "$1" bash -c 'exit 7' <<< start
`, '_', processGroupCleanupScript]).then(result => ({ ...result, code: 0 }),
          (error: { code: number; stdout: string; stderr: string }) => error);
        const { stdout, stderr } = result;
        expect(result.code).toBe(7);
        const events = stdout.trim().split('\n');
        const targetPattern = mode === 'group' ? '-- -\\d+' : '\\d+';
        expect(events[0]).toMatch(new RegExp(`^signal:-TERM ${targetPattern}$`, 'u'));
        if (targetRemains) {
          expect(events).toHaveLength(3);
          expect(events[1]).toBe('sleep:0.2');
          expect(events[2]).toBe(events[0]!.replace('-TERM', '-KILL'));
        } else expect(events).toHaveLength(1);
        expect(stderr).toMatch(mode === 'group' ? /^RAMIFY_GROUP:\d+\n$/u : /^RAMIFY_GROUP:0\n$/u);
      });
    }
  }
});

/**
 * A command runs in its own process group with an environment the harness
 * built, and how it ended is never read from what it printed.
 */
describe('runCommand', () => {
  let directory: { path: string; remove: () => Promise<void> };
  const groups = new Set<number>();
  beforeEach(async () => {
    directory = await temporaryDirectory();
  });
  afterEach(async () => {
    try {
      // Cancellation can answer while the wrapper is finishing its bounded
      // cleanup. Observe settlement without mistaking a dead zombie for a leak.
      for (const group of groups) {
        let liveMembers: string[] = [];
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const { stdout } = await exec('ps', ['-eo', 'pgid=,stat=']);
          liveMembers = stdout.trim().split('\n').filter(line => {
            const [pgid, state] = line.trim().split(/\s+/u);
            return pgid === String(group) && !state?.startsWith('Z');
          });
          if (liveMembers.length === 0) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(liveMembers, `live owned group ${group}`).toEqual([]);
      }
    } finally {
      for (const group of groups) {
        try { process.kill(-group, 'SIGKILL'); } catch { /* Already settled. */ }
      }
      groups.clear();
      await directory.remove();
    }
  });

  const request = (script: string, overrides: Partial<Parameters<typeof runCommand>[0]> = {}) => ({
    argv: ['bash', '-c', script],
    cwd: directory.path,
    env: childEnvironment(),
    timeoutMs: 30_000,
    outputFile: join(directory.path, 'output.log'),
    registerProcessGroup: async (pid: number) => { groups.add(pid); },
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

  it('escalates to KILL for a TERM-resistant descendant after its parent exits', async () => {
    const ready = join(directory.path, 'ready');
    const script = `
bash -c 'trap "" TERM; echo ready > "$1"; exec sleep 30' _ "$1" &
while [ ! -f "$1" ]; do sleep 0.01; done
exit 7
`;
    let group: number | undefined;
    try {
      const run = await runCommand(request(script, {
        argv: ['bash', '-c', script, '_', ready],
        registerProcessGroup: async pid => { group = pid; },
      }));
      expect(run.outcome).toEqual({ kind: 'completed', exitCode: 7 });
      expect(await readFile(ready, 'utf8')).toBe('ready\n');
      expect(group).toBeGreaterThan(0);
      const { stdout } = await exec('ps', ['-eo', 'pgid=,stat=']);
      // An orphan can briefly remain a zombie until the host reaps it; it is
      // no longer a live descendant and cannot run or keep a pipe open.
      const liveMembers = stdout.trim().split('\n').filter(line => {
        const [pgid, state] = line.trim().split(/\s+/u);
        return pgid === String(group) && !state?.startsWith('Z');
      });
      expect(liveMembers).toEqual([]);
    } finally {
      if (group !== undefined) {
        try { process.kill(-group, 'SIGKILL'); } catch { /* Already settled. */ }
      }
    }
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
