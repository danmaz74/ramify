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

  it.each([undefined, 3, 4, 5, 6])('reports actual provider execution and pending later checking work for iteration %s', (iteration) => {
    const args = ['--import', 'tsx', resolve(repositoryRoot, 'scripts/reference-harness/verify.ts'), '--plan', '1', '--format', 'json'];
    if (iteration) args.push('--iteration', String(iteration));
    const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 32 * 1024 ** 2 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(iteration ? 0 : 1);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    const passed = iteration === 3 ? 14 : iteration === 4 ? 53 : iteration === 5 ? 88 : iteration === 6 ? 105 : 201;
    expect(report.summary).toEqual({ required: iteration ? passed : 308, passed, failed: 0, notExecuted: 308 - passed });
    expect(report.availableCapabilities).toEqual(['acquire', 'catalog', 'link', 'metadata', 'parse', 'registry', 'static-access', 'tags-origin']);
    expect(report.instances.filter((item: { status: string }) => item.status === 'passed')).toHaveLength(passed);
    if (iteration === 4) expect(report.requiredIterations).toEqual([1, 2, 4]);
    if (iteration === 6) expect(report.requiredIterations).toEqual([1, 2, 3, 4, 5, 6]);
    expect(report.mode).toBe(iteration ? 'iteration-verification' : 'plan-verification');
    expect(report.planComplete).toBe(false);
    expect(report.instances).toHaveLength(308);
  }, 1_210_000);
});
