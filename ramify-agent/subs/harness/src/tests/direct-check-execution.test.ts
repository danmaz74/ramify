import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { createDirectCheckExecution, createMappedCheckExecution, type DirectCheckStep } from './helpers/direct-check-execution.js';

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-agent-direct-check-'));
  cleanups.push(root);
  const directory = join(root, 'gate');
  const command = checkCommand({ argv: [process.execPath, '-e', 'process.exit(99)'], cwd: root, timeoutMs: 1_000 });
  const checks: PlannedCheck[] = [
    { kind: 'tests', command },
    { kind: 'type-check', command },
    { kind: 'ramify-check', command },
  ];
  return { root, directory, checks };
}

async function gate(steps: readonly DirectCheckStep[], signal?: AbortSignal) {
  const f = await fixture();
  const execution = createDirectCheckExecution({ script: steps });
  const attempt = await runGate(execution, 'iteration', {
    id: 'ga-direct',
    runId: 'run-direct',
    projectRoot: f.root,
    directory: f.directory,
    head: 'source-commit',
    checks: f.checks,
    ...(signal === undefined ? {} : { signal }),
  });
  execution.assertComplete();
  return { ...f, attempt };
}

describe('direct test check execution', () => {
  test('writes output, delegates classification, and returns visibly synthetic evidence for the source commit', async () => {
    const { attempt } = await gate([
      { stdout: 'passed\n' },
      { outcome: { kind: 'completed', exitCode: 7 }, stderr: 'failed\n', elapsedMs: 12 },
      { outcome: { kind: 'timed-out', timeoutMs: 1_000 }, stdout: 'partial\n' },
    ]);

    expect(attempt.audited).toBe('source-commit');
    expect(attempt.evidence).toEqual({
      runRef: 'refs/test-only/audited-runs/source-commit-ga-direct',
      reportCommit: 'test-only-report-source-commit-ga-direct',
      treeRef: 'refs/test-only/audited-trees/source-commit',
    });
    expect(attempt.commands.map(command => [command.outcome, command.exitCode, command.notVerified])).toEqual([
      ['passed', 0, undefined],
      ['failed', 7, undefined],
      ['not-verified', null, 'timeout'],
    ]);
    expect(attempt.commands[1]!.elapsedMs).toBe(12);
    expect(await readFile(attempt.commands[0]!.output.path, 'utf8')).toBe('passed\n');
    expect(await readFile(attempt.commands[1]!.output.path, 'utf8')).toBe('failed\n');
    expect(await readFile(attempt.commands[2]!.output.path, 'utf8')).toBe('partial\n');
  });

  test('classifies cancellation and runner errors and does not select later scripted results after interruption', async () => {
    let selected = 0;
    const f = await fixture();
    const attempt = await runGate(createMappedCheckExecution({
      script(invocation) {
        selected += 1;
        if (invocation.invocationIndex === 0) return { outcome: { kind: 'cancelled' }, stderr: 'cancelled\n' };
        return { outcome: { kind: 'runner-error', error: { kind: 'EFAKE', message: 'must not run' } } };
      },
    }), 'iteration', {
      id: 'ga-interrupted',
      projectRoot: f.root,
      directory: f.directory,
      head: 'source-commit',
      checks: f.checks,
    });

    expect(selected).toBe(1);
    expect(attempt.audited).toBeNull();
    expect(attempt.evidence).toBeNull();
    expect(attempt.commands.map(command => [command.outcome, command.notVerified])).toEqual([
      ['not-verified', 'interrupted'],
      ['not-verified', 'interrupted'],
      ['not-verified', 'interrupted'],
    ]);
    expect(attempt.commands[0]!.output.tail).toBe('cancelled\n');
    expect(attempt.commands[1]!.output.bytes).toBe(0);
  });

  test('represents a scripted runner error when no earlier command interrupted execution', async () => {
    const { attempt } = await gate([
      { outcome: { kind: 'runner-error', error: { kind: 'ENOENT', message: 'missing runner' } } },
      {},
      {},
    ]);

    expect(attempt.commands[0]).toMatchObject({
      outcome: 'not-verified',
      notVerified: 'runner-error',
      runnerError: { kind: 'ENOENT', message: 'missing runner' },
    });
    expect(attempt.commands.slice(1).every(command => command.outcome === 'passed')).toBe(true);
  });

  test('honors an already-aborted request before selecting any scripted result', async () => {
    const controller = new AbortController();
    controller.abort();
    let selected = 0;
    const f = await fixture();
    const attempt = await runGate(createMappedCheckExecution({ script: () => {
      selected += 1;
      return { stdout: 'must not be selected' };
    } }), 'iteration', {
      id: 'ga-aborted',
      runId: 'run-aborted',
      projectRoot: f.root,
      directory: f.directory,
      head: 'source-commit',
      checks: f.checks,
      signal: controller.signal,
    });

    expect(selected).toBe(0);
    expect(attempt.audited).toBeNull();
    expect(attempt.evidence).toBeNull();
    expect(attempt.commands.every(command => command.notVerified === 'interrupted')).toBe(true);
    expect(attempt.commands.every(command => command.output.bytes === 0)).toBe(true);
  });

  test('turns an abort during an async scripted step into cancellation and selects nothing later', async () => {
    const f = await fixture();
    const controller = new AbortController();
    let selected = 0;
    const attempt = await runGate(createMappedCheckExecution({
      async script() {
        selected += 1;
        controller.abort();
        await Promise.resolve();
        return { stdout: 'late success must be discarded\n' };
      },
    }), 'iteration', {
      id: 'ga-abort-pending',
      projectRoot: f.root,
      directory: f.directory,
      head: 'source-commit',
      checks: f.checks,
      signal: controller.signal,
    });

    expect(selected).toBe(1);
    expect(attempt.audited).toBeNull();
    expect(attempt.evidence).toBeNull();
    expect(attempt.commands.every(command => command.notVerified === 'interrupted')).toBe(true);
    expect(attempt.commands.every(command => command.output.bytes === 0)).toBe(true);
  });

  test('rejects an exhausted sequential script instead of turning missing results into successes', async () => {
    const f = await fixture();
    const execution = createDirectCheckExecution({ script: [{}, {}] });

    await expect(runGate(execution, 'iteration', {
      id: 'ga-exhausted',
      runId: 'run-exhausted',
      projectRoot: f.root,
      directory: f.directory,
      head: 'source-commit',
      checks: f.checks,
    })).rejects.toThrow('No direct check result scripted for invocation 2 (iteration ramify-check)');
  });

  test('reports sequential results left unconsumed by the scenario', async () => {
    const f = await fixture();
    const execution = createDirectCheckExecution({ script: [{}, {}, {}, { stdout: 'extra' }] });
    await runGate(execution, 'iteration', {
      id: 'ga-surplus',
      runId: 'run-surplus',
      projectRoot: f.root,
      directory: f.directory,
      head: 'source-commit',
      checks: f.checks,
    });

    expect(() => execution.assertComplete()).toThrow('declared 4 results but consumed 3');
  });
});
