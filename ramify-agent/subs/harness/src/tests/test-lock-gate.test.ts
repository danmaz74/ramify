import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { testLockedRunner } from '../../subs/audit/src/test-lock.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { createInPlaceCheckExecution } from '../checks/execution.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import type { ProjectCommands } from '../checks/checkpoint.js';
import { createScopeTestsTool } from '../work/engineer.js';
import { createShellTool } from '../tools/shell.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

const cleanups: string[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-lock-'));
  cleanups.push(root);
  const lock = { held: false, lockPath: join(root, 'private.lock'), findFlock: async () => '/usr/bin/flock', waitTimeoutMs: 5000 };
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let acquired!: () => void;
  const acquisition = new Promise<void>(resolve => { acquired = resolve; });
  const runner: CommandRunner = async () => {
    acquired();
    await hold;
    return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: new Date().toISOString(), elapsedMs: 0,
      output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
  };
  const holder = testLockedRunner(runner, { repositoryPath: root, command: 'holder' }, {}, lock)({
    argv: ['true'], cwd: root, env: {}, timeoutMs: 5000,
  });
  await acquisition;
  return { root, lock, holder, release };
}

describe('in-place suite checks', () => {
  test('a tests command waits and starts only after acquisition; a type check does not wait', async () => {
    const f = await fixture();
    const command = checkCommand({ argv: [process.execPath, '-e', 'process.stdout.write(process.env.RAMIFY_AUDIT_TEST_LOCK_HELD ?? "missing")'], cwd: f.root, timeoutMs: 5000 });
    const nonSuite = await runGate(createInPlaceCheckExecution(f.lock), 'readiness', {
      id: 'type-now', projectRoot: f.root, directory: join(f.root, 'type'), head: 'HEAD',
      checks: [{ kind: 'type-check', command }],
    });
    expect(nonSuite.verdict).toBe('passed');
    expect(await readFile(nonSuite.commands[0]!.output.path, 'utf8')).toBe('1');
    const starts: string[] = [];
    const pending = runGate(createInPlaceCheckExecution(f.lock), 'readiness', {
      id: 'test-later', projectRoot: f.root, directory: join(f.root, 'test'), head: 'HEAD',
      checks: [{ kind: 'tests', command }], started: async started => { starts.push(started.kind); },
    });
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(starts).toEqual([]);
    f.release();
    await f.holder;
    const attempt = await pending;
    expect(attempt.verdict).toBe('passed');
    expect(starts).toEqual(['tests']);
    expect(await readFile(attempt.commands[0]!.output.path, 'utf8')).toBe('1');
    expect(attempt.commands[0]!.command.env).toContain('RAMIFY_AUDIT_TEST_LOCK_HELD');
  });

  test('focused shell and run_scope_tests finish while a suite holds the private lock', async () => {
    const f = await fixture();
    await writeFile(join(f.root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    await mkdir(join(f.root, 'subs/shelf/src/tests'), { recursive: true });
    await writeFile(join(f.root, 'subs/shelf/src/tests/shelf.test.ts'), 'export {};\n');
    let shellCalls = 0;
    const shell = createShellTool({
      workingDirectory: f.root, judge: async () => ({ ok: true }),
      outputFile: call => join(f.root, `${call}.log`), starting: async () => {}, ended: async () => {},
      commandExecution: async input => {
        shellCalls += 1;
        return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: new Date().toISOString(), elapsedMs: 1,
          output: { path: input.outputFile ?? null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
      },
    });
    const shellResult = await shell.definition.execute({ command: 'npm test -- subs/shelf/src/tests/shelf.test.ts' }, new AbortController().signal);
    expect(shellResult.isError).toBe(false);
    expect(shellCalls).toBe(1);

    let scopeCalls = 0;
    const scoped = createScopeTestsTool({
      projectRoot: f.root,
      commands: { scopedTests: checkCommand({ argv: ['vitest', 'run'], cwd: f.root, timeoutMs: 5000 }) } as ProjectCommands,
      policy: { policy: 'owned-by-scope', exactOwners: ['sample/shelf'], subtrees: [], extraSuites: [] },
      refresh: async () => architectIndex([moduleEntry('sample', '', null), moduleEntry('sample/shelf', 'subs/shelf', 'sample')]),
      judge: async () => ({ ok: true }), observe: async () => {},
      commandExecution: async () => {
        scopeCalls += 1;
        return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: new Date().toISOString(), elapsedMs: 1,
          output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
      },
    });
    const scopeResult = await scoped.execute({}, new AbortController().signal);
    expect(scopeResult.isError).toBe(false);
    expect(scopeCalls).toBe(1);
    f.release();
    await f.holder;
  });

  test('cancelling a waiting test runs no command and records interruption', async () => {
    const f = await fixture();
    const marker = join(f.root, 'should-not-exist');
    const command = checkCommand({ argv: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], cwd: f.root, timeoutMs: 5000 });
    const controller = new AbortController();
    const pending = runGate(createInPlaceCheckExecution(f.lock), 'readiness', {
      id: 'cancel-wait', projectRoot: f.root, directory: join(f.root, 'cancel'), head: 'HEAD',
      checks: [{ kind: 'tests', command }], signal: controller.signal,
    });
    await new Promise(resolve => setTimeout(resolve, 60));
    controller.abort();
    const attempt = await pending;
    expect(attempt.commands[0]).toMatchObject({ outcome: 'not-verified', notVerified: 'interrupted' });
    await expect(readFile(marker, 'utf8')).rejects.toThrow();
    f.release();
    await f.holder;
  });

  test('a scenarios check waits before its runner command starts', async () => {
    const f = await fixture();
    const command = checkCommand({ argv: [process.execPath, '-e', ''], cwd: f.root, timeoutMs: 5000 });
    const setup = checkCommand({ argv: [process.execPath, '-e', 'process.stdout.write(process.env.RAMIFY_AUDIT_TEST_LOCK_HELD ?? "missing")'], cwd: f.root, timeoutMs: 5000 });
    const starts: string[] = [];
    const pending = runGate(createInPlaceCheckExecution(f.lock), 'readiness', {
      id: 'scenario-later', projectRoot: f.root, directory: join(f.root, 'scenario'), head: 'HEAD',
      checks: [{ kind: 'scenarios', command, scenarios: {
        mode: 'quick', selection: { kind: 'all' }, strict: true, dryRun: false, support: [], runs: [],
        setup, teardown: null, runTimeoutMs: 5000, tracked: [],
      } }],
      started: async started => { starts.push(started.kind); },
    });
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(starts).toEqual([]);
    f.release();
    await f.holder;
    const attempt = await pending;
    expect(starts).toEqual(['scenarios']);
    expect(attempt.commands[0]?.scenarios?.setup).toEqual({ exit: 0 });
    expect(attempt.commands[0]?.output.tail).toContain('1');
  });
});
