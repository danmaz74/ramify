import { describe, expect, it } from 'vitest';
import { runCli } from '../run-cli.js';

describe('lightweight CLI arguments', () => {
  for (const argv of [['--help'], ['check', '--help'], ['--version']]) it(`handles ${argv.join(' ')} without dispatch`, async () => {
    let calls = 0;
    const stdout: string[] = [];
    const result = await runCli(argv, { cwd: '/project', version: '2.3.4',
      stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); },
      batch: async () => { calls++; throw new Error('Unexpected batch'); } });
    expect([result, calls]).toEqual([0, 0]);
    expect(stdout.join('')).toContain(argv[0] === '--version' ? '2.3.4' : 'Usage: ramify check');
  });
  for (const argv of [[], ['inspect'], ['watch'], ['mcp'], ['verify-browser'], ['check', '--root'],
    ['check', '--root', '--batch'], ['check', '--format', 'xml'], ['check', '--format', 'human'],
    ['check', '--batch', '--batch'], ['check', '--root', 'a', '--root', 'b'], ['check', '--strict'],
    ['check', '--exclude', 'src/tests'], ['check', 'some/file.ts'], ['--help', '--root', 'a']]) {
    it(`rejects ${JSON.stringify(argv)} before dispatch`, async () => {
      let calls = 0;
      const stderr: string[] = [], stdout: string[] = [];
      const exit = await runCli(argv, { cwd: '/project', version: '1', stdout: text => { stdout.push(text); },
        stderr: text => { stderr.push(text); }, batch: async () => { calls++; throw new Error('Unexpected batch'); } });
      expect([exit, calls, stdout.length]).toEqual([2, 0, 0]);
      expect(stderr.join('')).toContain('invalid-invocation');
    });
  }
  it('returns one versioned JSON error even when an earlier option is invalid', async () => {
    const stdout: string[] = [];
    const result = await runCli(['watch', '--format', 'json'], { cwd: '/project', version: '1',
      stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); }, batch: async () => { throw new Error('Unexpected batch'); } });
    expect([result, stdout.length]).toEqual([2, 1]);
    expect(JSON.parse(stdout[0])).toMatchObject({ schemaVersion: 'ramify.cli/1', exitCode: 2,
      diagnostics: [{ code: 'invalid-invocation', message: expect.stringContaining('Unavailable command: watch') }] });
  });
  it('returns cancellation before dispatch and catches rejected operations', async () => {
    let calls = 0;
    const env = { cwd: '/project', version: '1', stdout: () => {}, stderr: () => {},
      batch: async () => { calls++; throw new Error('Batch failed'); } };
    expect(await runCli(['check'], env, { signal: AbortSignal.abort() })).toBe(130);
    expect(calls).toBe(0);
    expect(await runCli(['check'], env)).toBe(2);
    expect(calls).toBe(1);
  });
});
