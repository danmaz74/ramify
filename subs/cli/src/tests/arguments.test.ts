import { describe, expect, it } from 'vitest';
import { runCli } from '../run-cli.js';
import { help, parseArguments } from '../arguments.js';

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
    expect(JSON.parse(stdout[0])).toEqual({ schemaVersion: 'ramify.daemon-status/2', running: false, record: null });
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
    { argv: ['explore'], expected: { command: 'explore' } },
    { argv: ['explore', '--root', 'a project'], expected: { command: 'explore', root: 'a project' } },
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
    { argv: ['explore', '--root'] }, { argv: ['explore', '--root', 'a', '--root', 'b'] },
    { argv: ['explore', '--batch'] }, { argv: ['explore', '--format', 'json'] },
    { argv: ['explore', '--help'] }, { argv: ['explore', 'file.ts'] },
  ])('rejects unsupported or ambiguous grammar $argv', ({ argv }) => {
    expect(() => parseArguments(argv)).toThrow();
  });
});

describe('snapshot-free JSON grammar', () => {
  it.each([
    { argv: ['check', '--format', 'json', '--no-snapshot'], expected: { command: 'check', format: 'json', batch: false, snapshot: false } },
    { argv: ['check', '--no-snapshot', '--batch', '--root', 'a project', '--format', 'json'],
      expected: { command: 'check', format: 'json', root: 'a project', batch: true, snapshot: false } },
  ])('selects a report without its snapshot for $argv', ({ argv, expected }) => {
    expect(parseArguments(argv)).toEqual(expected);
  });
  it.each([
    [['check', '--no-snapshot'], '--no-snapshot requires --format json'],
    [['check', '--batch', '--no-snapshot'], '--no-snapshot requires --format json'],
    [['check', '--format', 'json', '--no-snapshot', '--no-snapshot'], 'Duplicate option: --no-snapshot'],
    [['check', '--changed', 'a.ts', '--format', 'json', '--no-snapshot'], '--no-snapshot cannot be combined with --changed'],
    [['watch', '--format', 'json', '--no-snapshot'], 'Unsupported argument: --no-snapshot'],
    [['measure', '--format', 'json', '--no-snapshot'], 'Unsupported argument: --no-snapshot'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArguments(argv)).toThrow(message);
  });
  it('reports a usage error as a ramify.cli/1 document with exit 2 before dispatch', async () => {
    let calls = 0;
    const stdout: string[] = [];
    const exit = await runCli(['check', '--changed', 'a.ts', '--format', 'json', '--no-snapshot'], { cwd: '/project', version: '1',
      connect: async () => { calls++; throw new Error('Unexpected daemon connection'); }, stdout: text => { stdout.push(text); },
      stderr: text => { throw new Error(text); }, batch: async () => { calls++; throw new Error('Unexpected batch'); } });
    expect([exit, calls, stdout.length]).toEqual([2, 0, 1]);
    expect(JSON.parse(stdout[0])).toMatchObject({ schemaVersion: 'ramify.cli/1', exitCode: 2,
      diagnostics: [{ code: 'invalid-invocation', message: '--no-snapshot cannot be combined with --changed' }] });
  });
  it('documents the flag in help', () => {
    expect(help).toContain('[--format json [--no-snapshot]]');
    expect(help).toContain('--no-snapshot requires --format json and cannot accompany --changed.');
  });
});

describe('changed command grammar', () => {
  const revision = 'rev/1:00000000-0000-0000-0000-000000000001:7';
  it('consumes all changed paths up to a flag and retains the selected deadline and baseline', () => {
    expect(parseArguments(['check', '--since', revision, '--changed', './src/a.ts', 'src/b file.ts',
      '--deadline', '500', '--root', '../root', '--format', 'json'])).toEqual({ command: 'check',
      root: '../root', format: 'json', batch: false, changed: ['./src/a.ts', 'src/b file.ts'], since: revision, deadlineMs: 500 });
    expect(parseArguments(['check', '--changed', 'a.ts'])).toEqual({ command: 'check', format: 'human', batch: false, changed: ['a.ts'] });
  });
  it.each([
    ['check', '--changed'], ['check', '--changed', '--format', 'json'], ['check', '--changed', ''],
    ['check', '--changed', 'a.ts', '--changed', 'b.ts'], ['check', '--changed', 'a.ts', '--batch'],
    ['check', '--since', revision], ['check', '--deadline', '500'],
    ['check', '--changed', 'a.ts', '--since', 'rev/1:'], ['check', '--changed', 'a.ts', '--since', 'rev/1:made-up'],
    ['check', '--changed', 'a.ts', '--since', `${revision}\n`],
    ...['0', '-1', '600001', '1.5', 'Infinity', '1e3', '9007199254740993'].map(value => ['check', '--changed', 'a.ts', '--deadline', value]),
    ['check', '--changed', 'a.ts', '--deadline', '1', '--deadline', '2'],
    ['watch', '--changed', 'a.ts'], ['daemon', 'status', '--changed', 'a.ts'],
  ])('rejects %j before any service or batch operation', (...argv) => {
    expect(() => parseArguments(argv)).toThrow();
  });
  it('accepts the positive deadline boundaries', () => {
    for (const value of [1, 600_000]) expect(parseArguments(['check', '--changed', 'a.ts', '--deadline', String(value)]))
      .toMatchObject({ deadlineMs: value });
  });
});

describe('materialize command grammar', () => {
  it.each([
    { argv: ['materialize'], expected: { command: 'materialize', all: false } },
    { argv: ['materialize', '--all'], expected: { command: 'materialize', all: true } },
    { argv: ['materialize', '--from', 'subs/app'], expected: { command: 'materialize', all: false, from: 'subs/app' } },
    { argv: ['materialize', '--root', '../project'], expected: { command: 'materialize', all: false, root: '../project' } },
    { argv: ['materialize', '--root', '../project', '--from', 'subs/app'],
      expected: { command: 'materialize', all: false, root: '../project', from: 'subs/app' } },
    { argv: ['materialize', '--from', 'a project/subs/app', '--root', 'a root'],
      expected: { command: 'materialize', all: false, from: 'a project/subs/app', root: 'a root' } },
  ])('preserves the complete selection for $argv', ({ argv, expected }) => {
    expect(parseArguments(argv)).toEqual(expected);
  });

  it.each([
    { argv: ['materialize', '--all', '--from', 'subs/app'] }, { argv: ['materialize', '--from', 'subs/app', '--all'] },
    { argv: ['materialize', '--all', '--all'] }, { argv: ['materialize', '--from', 'a', '--from', 'b'] },
    { argv: ['materialize', '--root', 'a', '--root', 'b'] }, { argv: ['materialize', '--from', ''] },
    { argv: ['materialize', '--root', ''] }, { argv: ['materialize', '--from'] }, { argv: ['materialize', '--root'] },
    { argv: ['materialize', '--batch'] }, { argv: ['materialize', '--changed', 'a.ts'] },
    { argv: ['materialize', '--format', 'json'] }, { argv: ['materialize', '--since', 'rev/1:x:1'] },
    { argv: ['materialize', '--deadline', '500'] }, { argv: ['materialize', '--help'] },
    { argv: ['materialize', 'file.ts'] },
  ])('rejects unsupported or ambiguous grammar $argv', ({ argv }) => {
    expect(() => parseArguments(argv)).toThrow();
  });

  it.each([
    { argv: ['materialize', '--view', 'architect'], expected: { command: 'materialize', all: false, views: ['architect'] } },
    { argv: ['materialize', '--view', 'api', '--view', 'architect', '--all'], expected: { command: 'materialize', all: true, views: ['api', 'architect'] } },
    { argv: ['materialize', '--view', 'architect', '--from', 'subs/app', '--view', 'api'],
      expected: { command: 'materialize', all: false, from: 'subs/app', views: ['architect', 'api'] } },
    { argv: ['materialize', '--root', 'a root', '--view', 'api'], expected: { command: 'materialize', all: false, root: 'a root', views: ['api'] } },
  ])('AV24: accepts repeated --view values in the order given for $argv', ({ argv, expected }) => {
    expect(parseArguments(argv)).toEqual(expected);
  });

  it.each([
    { argv: ['materialize', '--view'], message: 'Missing value for --view' },
    { argv: ['materialize', '--view', '--all'], message: 'Missing value for --view' },
    { argv: ['materialize', '--view', ''], message: 'Missing value for --view' },
    { argv: ['materialize', '--view', 'other'], message: 'Unsupported view: other' },
    { argv: ['materialize', '--view', 'API'], message: 'Unsupported view: API' },
    { argv: ['materialize', '--view', 'api', '--view', 'api'], message: 'Duplicate view: api' },
    { argv: ['materialize', '--view', 'architect', '--view', 'api', '--view', 'architect'], message: 'Duplicate view: architect' },
    { argv: ['materialize', '--view', 'architect', '--all'], message: '--from and --all select the API view' },
    { argv: ['materialize', '--from', 'subs/app', '--view', 'architect'], message: '--from and --all select the API view' },
    { argv: ['check', '--view', 'api'], message: 'Unsupported argument: --view' },
  ])('AV24: rejects $argv', ({ argv, message }) => {
    expect(() => parseArguments(argv)).toThrow(message);
  });

  it('AV24: rejects invalid --view grammar before connecting, with exit 2', async () => {
    for (const argv of [['materialize', '--view', 'other'], ['materialize', '--view', 'api', '--view', 'api'], ['materialize', '--view', 'architect', '--all']]) {
      let calls = 0;
      const stderr: string[] = [];
      const exit = await runCli(argv, { cwd: '/project', version: '1',
        connect: async () => { calls++; throw new Error('Unexpected daemon connection'); }, stdout: () => {}, stderr: text => { stderr.push(text); },
        batch: async () => { calls++; throw new Error('Unexpected batch'); } });
      expect([exit, calls], argv.join(' ')).toEqual([2, 0]);
      expect(stderr.join(''), argv.join(' ')).toMatch(/^Error \[invalid-invocation\]: /);
    }
  });

  it('lists the materialize grammar and exit codes in --help without dispatching', async () => {
    const stdout: string[] = [];
    const exit = await runCli(['--help'], { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); }, batch: async () => { throw new Error('Unexpected batch'); } });
    expect(exit).toBe(0);
    expect(stdout.join('')).toContain('ramify materialize [--from <path>] [--all] [--root <dir>]');
    expect(stdout.join('')).toContain('ramify materialize --view <api|architect>... [--from <path> | --all] [--root <dir>]');
    expect(stdout.join('')).toContain('ramify explore [--root <dir>]');
  });

  it('rejects materialize before dispatch, like every other unsupported grammar', async () => {
    let calls = 0;
    const stderr: string[] = [];
    const exit = await runCli(['materialize', '--all', '--from', 'subs/app'], { cwd: '/project', version: '1',
      connect: async () => { calls++; throw new Error('Unexpected daemon connection'); }, stdout: () => {}, stderr: text => { stderr.push(text); },
      batch: async () => { calls++; throw new Error('Unexpected batch'); } });
    expect([exit, calls]).toEqual([2, 0]);
    expect(stderr.join('')).toContain('invalid-invocation');
  });
});

describe('measure command grammar', () => {
  it.each([
    { argv: ['measure'], expected: { command: 'measure', format: 'human' } },
    { argv: ['measure', '--format', 'json'], expected: { command: 'measure', format: 'json' } },
    { argv: ['measure', '--root', '../project'], expected: { command: 'measure', root: '../project', format: 'human' } },
    { argv: ['measure', '--format', 'json', '--root', 'a project'], expected: { command: 'measure', root: 'a project', format: 'json' } },
  ])('MM10: preserves the complete selection for $argv', ({ argv, expected }) => {
    expect(parseArguments(argv)).toEqual(expected);
  });

  it.each([
    ['measure', '--root'], ['measure', '--root', ''], ['measure', '--root', 'a', '--root', 'b'],
    ['measure', '--format'], ['measure', '--format', 'human'], ['measure', '--format', 'json', '--format', 'json'],
    ['measure', '--batch'], ['measure', '--changed', 'a.ts'], ['measure', '--deadline', '1'],
    ['measure', '--all'], ['measure', '--from', '.'], ['measure', '--view', 'api'], ['measure', '--help'], ['measure', 'file.ts'],
  ])('MM10: rejects unsupported or ambiguous grammar %j', (...argv) => {
    expect(() => parseArguments(argv)).toThrow();
  });

  it('MM10: lists measure grammar, behavior and exits in --help without dispatching', async () => {
    const stdout: string[] = [];
    const exit = await runCli(['--help'], { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); }, batch: async () => { throw new Error('Unexpected batch'); } });
    expect(exit).toBe(0);
    expect(stdout.join('')).toContain('ramify measure [--root <dir>] [--format json]');
    expect(stdout.join('')).toContain('whole-project daemon query');
    expect(stdout.join('')).toContain('measure: 0 one complete document');
  });
});

describe('affected command grammar', () => {
  const unexpected = { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
    batch: async () => { throw new Error('Unexpected batch'); }, affectedBatch: async () => { throw new Error('Unexpected affected batch'); } };

  it('A7-09:positional-ids: parses operands as module IDs in order', () => {
    expect(parseArguments(['affected', 'a', 'b'])).toEqual({ command: 'affected', format: 'human', batch: false,
      modules: ['a', 'b'], paths: [] });
  });

  it('A7-09:path-repeat: repeats --path beside module IDs, keeping each list in order', () => {
    expect(parseArguments(['affected', '--path', 'x', 'app/core', '--path', 'y', '--root', 'r'])).toEqual({ command: 'affected',
      root: 'r', format: 'human', batch: false, modules: ['app/core'], paths: ['x', 'y'] });
    expect(parseArguments(['affected', '--path', 'x', '--path', 'x'])).toEqual({ command: 'affected', format: 'human', batch: false,
      modules: [], paths: ['x', 'x'] });
  });

  it('A7-09:no-seed: requires a module ID or --path before any dispatch', async () => {
    for (const argv of [['affected'], ['affected', '--batch'], ['affected', '--root', 'r', '--format', 'json']]) {
      expect(() => parseArguments(argv), argv.join(' ')).toThrow('affected requires at least one module ID or --path');
    }
    const stdout: string[] = [];
    const exit = await runCli(['affected', '--format', 'json'], { ...unexpected, stdout: text => { stdout.push(text); },
      stderr: text => { throw new Error(text); } });
    expect([exit, stdout.length]).toEqual([2, 1]);
    expect(JSON.parse(stdout[0]!)).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 2,
      diagnostics: [{ category: 'invocation', code: 'invalid-invocation', message: 'affected requires at least one module ID or --path' }] });
  });

  it.each([
    ['affected', 'a', '--since', 'rev/1:00000000-0000-0000-0000-000000000000:1'], ['affected', 'a', '--changed', 'x.ts'],
    ['affected', 'a', '--deadline', '100'], ['affected', 'a', '--no-snapshot'], ['affected', 'a', '--view', 'api'],
    ['affected', 'a', '--all'], ['affected', 'a', '--from', '.'], ['affected', 'a', '-p', 'x'], ['affected', '--path'],
    ['affected', '--path', '--batch'], ['affected', '--path', ''], ['affected', 'a', '--batch', '--batch'],
    ['affected', 'a', '--root', 'r', '--root', 's'], ['affected', 'a', '--format', 'xml'], ['affected', 'a', '--format', 'json', '--format', 'json'],
    ['affected', 'a', ''], ['affected', '--help'],
  ])('A7-09:unknown-flag: rejects unsupported or ambiguous grammar %j', (...argv) => {
    expect(() => parseArguments(argv)).toThrow();
  });

  it('A7-09:unknown-flag: names --since and --changed as unsupported arguments before dispatch', async () => {
    for (const flag of ['--since', '--changed']) {
      const stderr: string[] = [];
      const exit = await runCli(['affected', 'a', flag, 'value'], { ...unexpected, stdout: text => { throw new Error(text); },
        stderr: text => { stderr.push(text); } });
      expect(exit).toBe(2);
      expect(stderr.join('')).toBe(`Error [invalid-invocation]: Unsupported argument: ${flag}\n`);
    }
  });

  it('A7-09:batch-with-format: parses --batch with either format', () => {
    expect(parseArguments(['affected', '--batch', '--format', 'json', '--path', 'src/a.ts'])).toEqual({ command: 'affected',
      format: 'json', batch: true, modules: [], paths: ['src/a.ts'] });
    expect(parseArguments(['affected', 'a', '--format', 'human', '--batch'])).toEqual({ command: 'affected',
      format: 'human', batch: true, modules: ['a'], paths: [] });
    expect(() => parseArguments(['affected', 'a', '--format', 'xml']))
      .toThrow('Unsupported format: xml. Use --format json or --format human, or omit it for human output.');
  });

  it('A7-09: lists affected grammar, forms and exits in --help without dispatching', async () => {
    const stdout: string[] = [];
    const exit = await runCli(['--help'], { ...unexpected, stdout: text => { stdout.push(text); }, stderr: text => { throw new Error(text); } });
    expect(exit).toBe(0);
    const text = stdout.join('');
    expect(text).toContain('ramify affected [<module-id>...] [--path <path>]... [--root <dir>] [--batch]\n                       [--format human|json]');
    expect(text).toContain('ramify.affected-cli/4');
    expect(text).toContain('affected: 0 one complete answer, including an all-modules answer, 1 the project');
    expect(text).toContain('2 unavailable (including\na project that cannot be found), pending, cold, supersession or incompatible\nservice');
    expect(help).toContain('--changed, --since and --deadline do not apply');
  });
});
