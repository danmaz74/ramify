import { describe, expect, it } from 'vitest';
import { runCli } from '../run-cli.js';
import { parseArguments } from '../arguments.js';

describe('lightweight CLI arguments', () => {
  for (const argv of [['--help'], ['check', '--help'], ['--version']]) it(`handles ${argv.join(' ')} without dispatch`, async () => {
    let calls = 0;
    const stdout: string[] = [];
    const result = await runCli(argv, { cwd: '/project', version: '2.3.4', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); },
      batch: async () => { calls++; throw new Error('Unexpected batch'); } });
    expect([result, calls]).toEqual([0, 0]);
    expect(stdout.join('')).toContain(argv[0] === '--version' ? '2.3.4' : 'Usage: ramify check');
  });
  for (const argv of [[], ['inspect'], ['watch', '--root'], ['mcp'], ['verify-browser'], ['check', '--root'],
    ['check', '--root', '--batch'], ['check', '--format', 'xml'], ['check', '--format', 'human'],
    ['check', '--batch', '--batch'], ['check', '--root', 'a', '--root', 'b'], ['check', '--strict'],
    ['check', '--exclude', 'src/tests'], ['check', 'some/file.ts'], ['--help', '--root', 'a']]) {
    it(`rejects ${JSON.stringify(argv)} before dispatch`, async () => {
      let calls = 0;
      const stderr: string[] = [], stdout: string[] = [];
      const exit = await runCli(argv, { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); }, stdout: text => { stdout.push(text); },
        stderr: text => { stderr.push(text); }, batch: async () => { calls++; throw new Error('Unexpected batch'); } });
      expect([exit, calls, stdout.length]).toEqual([2, 0, 0]);
      expect(stderr.join('')).toContain('invalid-invocation');
    });
  }
  it('returns one versioned JSON error even when an earlier option is invalid', async () => {
    const stdout: string[] = [];
    const result = await runCli(['inspect', '--format', 'json'], { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); }, batch: async () => { throw new Error('Unexpected batch'); } });
    expect([result, stdout.length]).toEqual([2, 1]);
    expect(JSON.parse(stdout[0])).toMatchObject({ schemaVersion: 'ramify.cli/1', exitCode: 2,
      diagnostics: [{ code: 'invalid-invocation', message: expect.stringContaining('Unavailable command: inspect') }] });
  });
  it('returns cancellation before dispatch and catches rejected operations', async () => {
    let calls = 0;
    const env = { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); }, stdout: () => {}, stderr: () => {},
      batch: async () => { calls++; throw new Error('Batch failed'); } };
    expect(await runCli(['check', '--batch'], env, { signal: AbortSignal.abort() })).toBe(130);
    expect(calls).toBe(0);
    expect(await runCli(['check', '--batch'], env)).toBe(2);
    expect(calls).toBe(1);
  });
  it.each(['status', 'stop'])('queries daemon %s without starting or substituting batch', async action => {
    let calls = 0;
    const stdout: string[] = [], stderr: string[] = [];
    const exit = await runCli(['daemon', action, '--format', 'json'], {
      cwd: '/project', version: '1', stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
      connect: async options => { expect(options.start).toBe('never'); calls++; return { status: 'not-running' }; },
      batch: async () => { throw new Error('Unexpected batch'); },
    });
    expect([exit, calls, stdout.length, stderr]).toEqual([0, 1, 1, []]);
    expect(JSON.parse(stdout[0])).toEqual({ schemaVersion: 'ramify.daemon-status/1', running: false, record: null });
  });
});

describe('resident command grammar', () => {
  it.each([
    { argv: ['check'], expected: { command: 'check', format: 'human', batch: false } },
    { argv: ['check', '--batch'], expected: { command: 'check', format: 'human', batch: true } },
    { argv: ['check', '--format', 'json', '--root', 'a project', '--batch'],
      expected: { command: 'check', format: 'json', root: 'a project', batch: true } },
    { argv: ['check', '--batch', '--root', '../project', '--format', 'json'],
      expected: { command: 'check', format: 'json', root: '../project', batch: true } },
    { argv: ['watch'], expected: { command: 'watch', format: 'human' } },
    { argv: ['watch', '--root', '../project', '--format', 'json'],
      expected: { command: 'watch', format: 'json', root: '../project' } },
    { argv: ['watch', '--format', 'json', '--root', 'a project'],
      expected: { command: 'watch', format: 'json', root: 'a project' } },
    { argv: ['daemon', 'status'], expected: { command: 'daemon', action: 'status', format: 'human' } },
    { argv: ['daemon', 'status', '--format', 'json'], expected: { command: 'daemon', action: 'status', format: 'json' } },
    { argv: ['daemon', 'stop'], expected: { command: 'daemon', action: 'stop', format: 'human' } },
    { argv: ['daemon', 'stop', '--format', 'json'], expected: { command: 'daemon', action: 'stop', format: 'json' } },
  ])('preserves the complete selection for $argv', ({ argv, expected }) => {
    expect(parseArguments(argv)).toEqual(expected);
  });

  it.each([
    { argv: ['watch', '--batch'] }, { argv: ['watch', '--root'] },
    { argv: ['watch', '--root', '--format', 'json'] }, { argv: ['watch', '--root', ''] },
    { argv: ['watch', '--root', 'a', '--root', 'b'] },
    { argv: ['watch', '--format', 'json', '--format', 'json'] },
    { argv: ['watch', '--format', 'human'] }, { argv: ['watch', '--format'] },
    { argv: ['watch', '--help'] }, { argv: ['watch', 'file.ts'] },
    { argv: ['daemon'] }, { argv: ['daemon', 'start'] },
    { argv: ['daemon', '--format', 'json', 'status'] },
    { argv: ['daemon', 'status', '--root', '.'] }, { argv: ['daemon', 'stop', '--batch'] },
    { argv: ['daemon', 'status', '--format', 'xml'] }, { argv: ['daemon', 'stop', '--format'] },
    { argv: ['daemon', 'stop', '--format', 'json', '--format', 'json'] },
    { argv: ['daemon', 'status', 'stop'] }, { argv: ['daemon', 'stop', '--help'] },
    { argv: ['check', '--format', 'json', '--format', 'json'] },
  ])('rejects unsupported or ambiguous grammar $argv', ({ argv }) => {
    expect(() => parseArguments(argv)).toThrow();
  });
});
