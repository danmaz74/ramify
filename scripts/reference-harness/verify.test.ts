import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from './plan.js';
import { parseVerifyArguments } from './verify.js';

describe('reference verification invocation', () => {
  it('parses explicit plan, iteration, preservation and output options', () => {
    expect(parseVerifyArguments(['--plan', '1', '--iteration', '3', '--preserve-on-failure', '--format', 'json']))
      .toEqual({ iteration: 3, preserveOnFailure: true, format: 'json' });
    expect(parseVerifyArguments(['--plan', '1'])).toEqual({ preserveOnFailure: false, format: 'human' });
  });

  it.each([
    [], ['--plan', '2'], ['--plan', '1', '--iteration', '3.5'],
    ['--plan', '1', '--iteration', '0'], ['--plan', '1', '--iteration', '16'],
    ['--plan', '1', '--iteration'], ['--plan', '1', '--plan', '1'],
    ['--plan', '1', '--unknown'], ['--plan', '1', '--format', 'xml'],
  ])('rejects invalid arguments %j', (...args) => {
    expect(() => parseVerifyArguments(args)).toThrow();
  });

  it.each([undefined, 3])('reports actual model execution and pending source work for iteration %s', (iteration) => {
    const args = ['--import', 'tsx', resolve(repositoryRoot, 'scripts/reference-harness/verify.ts'), '--plan', '1', '--format', 'json'];
    if (iteration) args.push('--iteration', String(iteration));
    const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: 'utf8', timeout: 15_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(iteration === 3 ? 0 : 1);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report.summary).toEqual({ required: iteration ? 14 : 308, passed: 14, failed: 0, notExecuted: 294 });
    expect(report.availableCapabilities).toEqual(['registry']);
    expect(report.instances.filter((item: { status: string }) => item.status === 'passed')).toHaveLength(14);
    expect(report.mode).toBe(iteration ? 'iteration-verification' : 'plan-verification');
    expect(report.planComplete).toBe(false);
    expect(report.instances).toHaveLength(308);
  });
});
