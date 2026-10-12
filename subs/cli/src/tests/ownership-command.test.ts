import { describe, expect, it, vi } from 'vitest';
import { parseArguments } from '../arguments.js';
import { runCli } from '../run-cli.js';
import type { CliEnvironment } from '../interfaces/cli.js';
import type { OwnershipBatchResult } from '../../../../src/interfaces/batch.js';
import { answeredOwnership, ownershipFailures } from './recovery-contract-fixtures.js';

function environment(result?: OwnershipBatchResult) {
  const stdout: string[] = [], stderr: string[] = [];
  const ownershipBatch = vi.fn(async () => result!);
  const value: CliEnvironment = { cwd: '/project', version: '0.4.3', stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
    connect: vi.fn(async () => { throw new Error('Unexpected daemon'); }),
    batch: vi.fn(async () => { throw new Error('Unexpected full analysis'); }),
    ...(result ? { ownershipBatch } : {}) };
  return { value, ownershipBatch, stdout, stderr };
}
function batchResult(document: typeof answeredOwnership | (typeof ownershipFailures)[number]): OwnershipBatchResult {
  const { schemaVersion: _schema, ramifyVersion: _version, ...result } = document;
  return result;
}

describe('FR01 FR07 FR08 ownership command boundary', () => {
  it('validates and deduplicates paths before dispatch', () => {
    expect(parseArguments(['ownership'])).toEqual({ command: 'ownership', format: 'human', paths: ['.'] });
    expect(parseArguments(['ownership', '--path', '../x', '--path', '.', '--path', '../x', '--format', 'human']))
      .toEqual({ command: 'ownership', format: 'human', paths: ['../x', '.'] });
  });
  it.each([['--batch'], ['operand'], ['--path'], ['--root', 'x', '--root', 'y'], ['--format', 'yaml'],
    ['--path', 'src/../x'], ['--path', './x'], ['--path', '/x'], ['--path', 'C:/x'], ['--path', 'x\\y'], ['--path', 'x//y']].map(args => [args] as const))
    ('FR07 rejects %j before acquisition', async args => {
      const e = environment(batchResult(answeredOwnership));
      expect(await runCli(['ownership', ...args, '--format', 'json'], e.value)).toBe(2);
      expect(JSON.parse(e.stdout.join(''))).toMatchObject({ schemaVersion: 'ramify.cli/2', status: 'unavailable', exitCode: 2,
        diagnostics: [{ category: 'invocation', code: 'invalid-invocation' }] });
      expect(e.ownershipBatch).not.toHaveBeenCalled(); expect(e.value.connect).not.toHaveBeenCalled();
    });
  it.each([answeredOwnership, ...ownershipFailures])('FR01 serializes $status with its exact exit', async document => {
    const e = environment(batchResult(document));
    expect(await runCli(['ownership', '--format', 'json'], e.value)).toBe(document.exitCode);
    expect(JSON.parse(e.stdout.join(''))).toEqual(document);
    expect(e.ownershipBatch).toHaveBeenCalledWith({ cwd: '/project', paths: ['.'] }, {});
    expect(e.value.connect).not.toHaveBeenCalled(); expect(e.value.batch).not.toHaveBeenCalled();
  });
  it('FR08 cancels without an ownership document and refuses absent injection', async () => {
    const cancelled = environment({ status: 'cancelled', exitCode: 130 });
    expect(await runCli(['ownership', '--format', 'json'], cancelled.value)).toBe(130);
    expect(cancelled.stdout).toEqual([]); expect(cancelled.stderr.join('')).toContain('Interrupted');
    const missing = environment();
    expect(await runCli(['ownership', '--format', 'json'], missing.value)).toBe(2);
    expect(JSON.parse(missing.stdout.join(''))).toMatchObject({ schemaVersion: 'ramify.cli/2', diagnostics: [{ category: 'execution', code: 'unavailable' }] });
    expect(missing.value.connect).not.toHaveBeenCalled();
  });
});
