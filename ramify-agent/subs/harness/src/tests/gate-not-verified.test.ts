import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGate } from '../checks/gate.js';
import type { GateRequest } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import type { CheckCommand, TestSelection } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { temporaryDirectory } from './helpers/fixture.js';

/**
 * A check that did not run says why, and an empty required selection never
 * passes. Every command and every selection is verified before the first
 * command runs, so a checkpoint that cannot run what it requires runs nothing
 * at all.
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

  const selection = (resolved: string[], extraSuites: string[] = []): TestSelection =>
    ({ policy: 'owned-by-scope', exactOwners: ['project/reviews'], subtrees: [], extraSuites, resolved });

  const gate = (checks: readonly PlannedCheck[], overrides: Partial<GateRequest> = {}): Promise<ReturnType<typeof runGate> extends Promise<infer T> ? T : never> =>
    runGate('iteration', {
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
      { kind: 'tests', command: command(`touch ${marker('ran-tests')}`) },
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

  it('never passes an empty required selection', async () => {
    const attempt = await gate([
      { kind: 'type-check', command: command('true') },
      { kind: 'tests', command: command(`touch ${marker('ran-tests')}`), selection: selection([]), requiresTests: true },
    ]);

    expect(attempt.verdict).toBe('not-verified');
    expect(attempt.commands[1]?.notVerified).toBe('empty-selection');
    expect(attempt.commands[1]?.selection?.resolved).toEqual([]);
    expect(attempt.cause).toBe('unknown');
    expect(attempt.next).toBe('return-to-local-architect');
    await expect(stat(marker('ran-tests'))).rejects.toThrow();
  });

  it('refuses a selection that lost a required suite, and one discovery could not establish', async () => {
    const missing = await gate([
      { kind: 'tests', command: command('true'), selection: selection(['src/tests/one.test.ts'], ['subs/contracts/src/tests/conformance.test.ts']), requiresTests: true },
    ]);
    const failed = await gate([
      { kind: 'tests', command: command('true'), discovery: { failed: 'discovery-error', detail: 'the architect view could not be read' } },
    ]);

    expect(missing.commands[0]?.notVerified).toBe('required-suite-missing');
    expect(missing.commands[0]?.output.tail).toContain('subs/contracts/src/tests/conformance.test.ts');
    expect(failed.commands[0]?.notVerified).toBe('discovery-error');
    expect(failed.commands[0]?.output.tail).toBe('the architect view could not be read');
    expect([missing.verdict, failed.verdict]).toEqual(['not-verified', 'not-verified']);
  });

  it('records a timeout as a timeout, not as a failure', async () => {
    const attempt = await gate([
      { kind: 'tests', command: command('sleep 30', { timeoutMs: 300 }) },
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
      { kind: 'tests', command: command('true', { cwd: vanishing }) },
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
      { kind: 'tests', command: command('sleep 30') },
      { kind: 'conformance', command: command(`touch ${marker('ran-conformance')}`) },
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
    expect(first.cause).toBe('in-scope');
    expect(first.next).toBe('repair');
    expect(last.next).toBe('exhausted');
    expect(first.commands[0]?.exitCode).toBe(2);
    expect(first.commands[0]?.runnerError).toBeNull();
  });

  it('passes when every verified command exited zero, and keeps the complete output beside the attempt', async () => {
    const attempt = await gate([
      { kind: 'ramify-check', command: command('echo checked') },
      { kind: 'type-check', command: command('echo typed') },
      { kind: 'tests', command: command('echo tested'), selection: selection(['src/tests/one.test.ts']), requiresTests: true },
    ]);

    expect(attempt.verdict).toBe('passed');
    expect(attempt.cause).toBeNull();
    expect(attempt.next).toBe('accept');
    expect(attempt.commit).toBeNull();
    expect(attempt.commands.map(entry => entry.exitCode)).toEqual([0, 0, 0]);
    expect(attempt.commands[2]?.output.path).toBe(join(directory.path, 'gates', 'ga-0001', '03-tests.log'));
    expect(await readFile(attempt.commands[2]?.output.path ?? '', 'utf8')).toBe('tested\n');
    expect(attempt.commands[2]?.output.tail).toBe('tested\n');
    expect(attempt.commands[2]?.selection?.resolved).toEqual(['src/tests/one.test.ts']);
  });
});
