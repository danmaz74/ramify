import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGate } from '../checks/gate.js';
import { inPlaceCheckExecution } from '../checks/execution.js';
import type { CheckExecutionPort } from '../checks/execution.js';
import type { GateRequest } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import type { CheckCommand } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { temporaryDirectory } from './helpers/fixture.js';

/**
 * An in-place diagnosis whose command did not run says why. Every command is
 * verified before the first one runs, so a checkpoint that cannot run what it
 * requires runs nothing at all. (A committing gate plans no command: its
 * configured audit selects and runs the checks.)
 */
describe('a gate that cannot run what its checkpoint requires', () => {
  let directory: { path: string; remove: () => Promise<void> };

  beforeEach(async () => {
    directory = await temporaryDirectory();
  });
  afterEach(async () => {
    await directory.remove();
  });

  const command = (script: string, overrides: Partial<CheckCommand> = {}): CheckCommand => ({
    ...checkCommand({ argv: ['bash', '-c', script], cwd: directory.path, timeoutMs: 30_000 }),
    ...overrides,
  });

  const gate = (checks: readonly PlannedCheck[], overrides: Partial<GateRequest> = {}): Promise<ReturnType<typeof runGate> extends Promise<infer T> ? T : never> =>
    runGate(inPlaceCheckExecution, 'iteration', {
      id: 'ga-0001',
      projectRoot: directory.path,
      directory: join(directory.path, 'gates', 'ga-0001'),
      head: '0'.repeat(40),
      checks,
      ...overrides,
    });

  const marker = (name: string) => join(directory.path, name);

  it('runs nothing at all when one command is missing, and says which', async () => {
    const attempt = await gate([
      { kind: 'ramify-check', command: command(`touch ${marker('ran-ramify')}`) },
      { kind: 'type-check', command: { ...command('true'), argv: ['definitely-not-a-command-xyz'] } },
      { kind: 'ramify-check', name: 'second', command: command(`touch ${marker('ran-tests')}`) },
    ]);

    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.cause).toBe('infrastructure');
    expect(attempt.next).toBe('retry-infrastructure');
    expect(attempt.commands.map(entry => entry.outcome)).toEqual(['not-verified', 'not-verified', 'not-verified']);
    expect(attempt.commands.map(entry => entry.notVerified)).toEqual(['interrupted', 'command-missing', 'interrupted']);
    expect(attempt.commands[1]?.output.tail).toContain('definitely-not-a-command-xyz');
    expect(attempt.commands.every(entry => entry.exitCode === null && entry.elapsedMs === 0)).toBe(true);
    await expect(stat(marker('ran-ramify'))).rejects.toThrow();
    await expect(stat(marker('ran-tests'))).rejects.toThrow();
  });

  it('records a timeout as a timeout, not as a failure', async () => {
    const attempt = await gate([
      { kind: 'type-check', command: command('sleep 30', { timeoutMs: 300 }) },
    ]);

    expect(attempt.commands[0]?.notVerified).toBe('timeout');
    expect(attempt.commands[0]?.exitCode).toBeNull();
    expect(attempt.commands[0]?.runnerError).toBeNull();
    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.cause).toBe('timeout');
    expect(attempt.next).toBe('retry-infrastructure');
  });

  it('records a runner error with the structured error the spawn gave it', async () => {
    const vanishing = join(directory.path, 'vanishing');
    await gate([{ kind: 'type-check', command: command(`mkdir -p ${vanishing}`) }]);

    const attempt = await gate([
      { kind: 'type-check', command: command(`rm -rf ${vanishing}`) },
      { kind: 'ramify-check', command: command('true', { cwd: vanishing }) },
    ]);

    expect(attempt.commands[0]?.outcome).toBe('passed');
    expect(attempt.commands[1]?.notVerified).toBe('runner-error');
    expect(attempt.commands[1]?.runnerError?.kind).toBe('ENOENT');
    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.cause).toBe('infrastructure');
  });

  it('never reads a Ramify check that exited 2 as a pass', async () => {
    const attempt = await gate([
      { kind: 'ramify-check', command: command('echo \'{"outcome":"not-checked","reason":"cold"}\'; exit 2') },
    ]);

    expect(attempt.commands[0]?.exitCode).toBe(2);
    expect(attempt.commands[0]?.outcome).toBe('not-verified');
    expect(attempt.commands[0]?.notVerified).toBe('runner-error');
    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.cause).toBe('infrastructure');
  });

  it('reports what a cancelled attempt did not reach as interrupted', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    const attempt = await gate([
      { kind: 'type-check', command: command('sleep 30') },
      { kind: 'ramify-check', command: command(`touch ${marker('ran-conformance')}`) },
    ], { signal: controller.signal });

    expect(attempt.commands.map(entry => entry.notVerified)).toEqual(['interrupted', 'interrupted']);
    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.cause).toBe('infrastructure');
    await expect(stat(marker('ran-conformance'))).rejects.toThrow();
  });

  it('is a failure, and its next is repair until the rounds are spent', async () => {
    const failing: PlannedCheck[] = [
      { kind: 'type-check', command: command('echo "src/one.ts(3,5): error TS2322" >&2; exit 2') },
    ];

    const first = await gate(failing, { repairRound: 0, limits: { repairRounds: 2 } });
    const last = await gate(failing, { repairRound: 1, limits: { repairRounds: 2 } });

    expect(first.verdict).toBe('failed');
    expect(first.cause).toBe('check-failed');
    expect(first.next).toBe('repair');
    expect(last.next).toBe('exhausted');
    expect(first.commands[0]?.exitCode).toBe(2);
    expect(first.commands[0]?.runnerError).toBeNull();
  });

  it('passes when every verified command exited zero, and keeps the complete output beside the attempt', async () => {
    const attempt = await gate([
      { kind: 'ramify-check', command: command('echo checked') },
      { kind: 'type-check', command: command('echo typed') },
      { kind: 'type-check', name: 'second', command: command('echo tested') },
    ]);

    expect(attempt.verdict).toBe('passed');
    expect(attempt.cause).toBeNull();
    expect(attempt.next).toBe('accept');
    expect(attempt.commit).toBeNull();
    expect(attempt.commands.map(entry => entry.exitCode)).toEqual([0, 0, 0]);
    expect(attempt.commands[2]?.output.path).toBe(join(directory.path, 'gates', 'ga-0001', '03-type-check.log'));
    expect(await readFile(attempt.commands[2]?.output.path ?? '', 'utf8')).toBe('tested\n');
    expect(attempt.commands[2]?.output.tail).toBe('tested\n');
  });

  it('delegates every verified plan to the execution port and requires one record for each', async () => {
    const checks: PlannedCheck[] = [
      { kind: 'type-check', command: command('true') },
      { kind: 'ramify-check', command: command('true') },
    ];
    let received: readonly PlannedCheck[] = [];
    const execution: CheckExecutionPort = {
      async run(planned, request) {
        received = planned;
        return { commands: planned.map((check, index) => ({
          kind: check.kind,
          command: check.command,
          startedAt: '2026-09-21T00:00:00.000Z',
          elapsedMs: index + 1,
          exitCode: 0,
          outcome: 'passed',
          runnerError: null,
          output: { path: join(request.directory, `${index + 1}.log`), bytes: 0, truncated: false, tail: '' },
        })), audited: null, evidence: null };
      },
    };

    const attempt = await runGate(execution, 'iteration', {
      id: 'ga-port',
      projectRoot: directory.path,
      directory: join(directory.path, 'gates', 'ga-port'),
      head: '0'.repeat(40),
      checks,
    });
    expect(received).toBe(checks);
    expect(attempt.commands.map(entry => [entry.kind, entry.elapsedMs])).toEqual([
      ['type-check', 1],
      ['ramify-check', 2],
    ]);
    expect(attempt.verdict).toBe('passed');

    await expect(runGate({ run: async () => ({ commands: [], audited: null, evidence: null }) }, 'iteration', {
      id: 'ga-short',
      projectRoot: directory.path,
      directory: join(directory.path, 'gates', 'ga-short'),
      head: '0'.repeat(40),
      checks,
    })).rejects.toThrow('answered 0 command records for 2 planned checks');
  });
});
