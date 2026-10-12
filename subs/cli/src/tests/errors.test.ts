import { describe, expect, it } from 'vitest';
import type { ServiceErrorCode } from '../../../../src/interfaces/service.js';
import type { DisconnectReason } from '../../../daemon/src/interfaces/daemon.js';
import { CliFailure, disconnectFailure, serviceFailure, withFailureOutput } from '../errors.js';
import type { AnalysisDiagnostic, StageExecution } from '../../../analysis/src/interfaces/analysis.js';
import type { CliEnvironment } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';
import { cliFailureDocumentSchema } from './response-schema.js';
import { overflow } from './recovery-contract-fixtures.js';

describe('CLI service and disconnect errors', () => {
  const diagnostics: readonly AnalysisDiagnostic[] = ['first', 'second'].map((name, index) => ({
    id: `producer:${name}`, category: 'missing-export', code: 'missing-export', message: `Missing ${name}`,
    location: { file: 'module.ramify', start: 30 + index, end: 35 + index, line: 3, column: 12 + index },
    related: [{ file: 'src/api.ts', start: 0, end: 9, line: 1, column: 1 }],
    importer: null, original: null, accessId: null,
  }));
  const stages: readonly StageExecution[] = [{ stage: 'link', status: 'invalid', blockedBy: [], diagnosticIds: diagnostics.map(item => item.id) }];

  it('FR09 retains typed evidence outside scalar details and keeps the exact service cause', () => {
    const source = { code: 'internal-error' as const, message: 'Compiler stopped', details: { requestId: 'q' }, diagnostics, stages };
    const failure = serviceFailure(source);
    expect(failure.cause).toBe(source);
    expect(failure.evidence).toEqual({ diagnostics, stages });
    expect(Object.keys(failure.evidence)).toEqual(['diagnostics', 'stages']);
    expect(failure.evidence.diagnostics).toBe(diagnostics);
    expect(serviceFailure({ code: 'internal-error', message: 'No report', details: {} }).evidence).toEqual({});
    expect(serviceFailure({ code: 'internal-error', message: 'Empty supplied evidence', details: {}, diagnostics: [], stages: [] }).evidence)
      .toEqual({ diagnostics: [], stages: [] });
  });

  it('FR10 keeps a formatter throw attached to its original no-report failure', () => {
    const cause = { reason: 'unsupported-setup', message: 'Setup is unsupported', diagnostics, stages, recovery: overflow };
    let observed: unknown;
    try { withFailureOutput(cause, () => { throw new Error('Formatter crashed'); }); }
    catch (error) { observed = error; }
    expect(observed).toBeInstanceOf(CliFailure);
    expect(observed).toMatchObject({ code: 'output-failure', message: 'Formatter crashed; original unsupported-setup: Setup is unsupported',
      cause, evidence: { diagnostics, stages, recovery: overflow } });
    expect((observed as CliFailure).cause).toBe(cause);
    expect(Object.keys((observed as CliFailure).evidence)).toEqual(['diagnostics', 'stages', 'recovery']);
  });

  it('FR09 FR10 generic CLI/2 retains full records and stages for a no-report failure', async () => {
    const stdout: string[] = [];
    const failure = serviceFailure({ code: 'internal-error', message: 'Compiler stopped', details: {}, diagnostics, stages, recovery: overflow });
    const exit = await runCli(['check', '--batch', '--format', 'json'], { cwd: '/project', version: '1',
      connect: async () => { throw new Error('Unexpected connection'); }, batch: async () => { throw failure; },
      stdout: text => { stdout.push(text); }, stderr: () => { throw new Error('Unexpected stderr'); } });
    expect(exit).toBe(2);
    expect(cliFailureDocumentSchema.parse(JSON.parse(stdout[0]!))).toEqual({ schemaVersion: 'ramify.cli/2', status: 'unavailable', exitCode: 2, stages, recovery: overflow,
      diagnostics: [{ category: 'execution', code: 'internal-error', message: 'Compiler stopped' }, ...diagnostics] });
  });

  it('FR22 human no-report failure leads with operation, primary and related locations, then observed history', async () => {
    const stderr: string[] = [];
    const failure = serviceFailure({ code: 'internal-error', message: 'Compiler stopped', details: {}, diagnostics, stages, recovery: overflow });
    const exit = await runCli(['check', '--batch'], { cwd: '/project', version: '1',
      connect: async () => { throw new Error('Unexpected connection'); }, batch: async () => { throw failure; },
      stdout: () => { throw new Error('Unexpected stdout'); }, stderr: text => { stderr.push(text); } });
    const text = stderr.join('');
    expect(exit).toBe(2);
    expect(text).toMatch(/^Check failed \(internal-error\)\./);
    expect(text.indexOf('module.ramify:3:12')).toBeLessThan(text.indexOf('Related: src/api.ts:1:1'));
    expect(text.indexOf('Related: src/api.ts:1:1')).toBeLessThan(text.indexOf('No result was claimed.'));
    expect(text).toContain('Observed changed paths: src/other.ts, subs/provider/src/api.ts.');
  });

  it('FR10 an unwritable failure document preserves the original reason and every diagnostic on stderr', async () => {
    const stderr: string[] = [];
    const failure = new CliFailure('unsupported-setup', 'Setup is unsupported', { reason: 'unsupported-setup' }, { diagnostics, stages });
    const exit = await runCli(['check', '--batch', '--format', 'json'], { cwd: '/project', version: '1',
      connect: async () => { throw new Error('Unexpected connection'); }, batch: async () => { throw failure; },
      stdout: () => { throw new Error('stdout broken'); }, stderr: text => { stderr.push(text); } });
    expect(exit).toBe(2);
    expect(stderr.join('')).toContain('Check failed (unsupported-setup).');
    expect(stderr.join('')).toContain('Missing first'); expect(stderr.join('')).toContain('Missing second');
  });

  it('FR10 an unwritable ownership failure retains its acquisition records', async () => {
    const stderr: string[] = [];
    const exit = await runCli(['ownership', '--format', 'json'], { cwd: '/project', version: '1',
      connect: async () => { throw new Error('Unexpected connection'); }, batch: async () => { throw new Error('Unexpected analysis'); },
      ownershipBatch: async () => ({ status: 'invalid', exitCode: 1, root: '/project', diagnostics, stages }),
      stdout: () => { throw new Error('stdout broken'); }, stderr: text => { stderr.push(text); } });
    expect(exit).toBe(2);
    expect(stderr.join('')).toContain('original ownership-invalid: Ownership invalid');
    expect(stderr.join('')).toContain('Missing first'); expect(stderr.join('')).toContain('Missing second');
  });

  it('FR10 a human refusal formatter throw still reports the original operation cause', async () => {
    const stderr: string[] = [], stdout: string[] = [];
    const badDiagnostic: AnalysisDiagnostic = { ...diagnostics[0]!, get message(): string { throw new Error('Diagnostic formatter crashed'); } };
    const exit = await runCli(['affected', 'missing', '--batch'], { cwd: '/project', version: '1',
      connect: async () => { throw new Error('Unexpected connection'); }, batch: async () => { throw new Error('Unexpected analysis'); },
      affectedBatch: async () => ({ status: 'unavailable', reason: 'analysis-failed', message: 'Original compiler fault',
        unknownModules: [], exitCode: 2, diagnostics: [badDiagnostic] }),
      stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); } });
    expect([exit, stdout]).toEqual([2, []]);
    expect(stderr.join('')).toContain('Diagnostic formatter crashed');
    expect(stderr.join('')).toContain('original analysis-failed: Original compiler fault');
  });
  const serviceCodes: readonly ServiceErrorCode[] = ['invalid-request', 'unsupported-operation', 'unknown-context',
    'expired-generation', 'resource-unavailable', 'unknown-subscription', 'wrong-instance', 'stopping',
    'cancelled', 'internal-error', 'incompatible'];
  it.each(serviceCodes)('preserves %s and its cause, translating stopping to stopped', code => {
    const source = { code, message: 'Service rejected request req/1', details: { requestId: 'req/1', active: false } };
    const error = serviceFailure(source);
    expect(error).toBeInstanceOf(CliFailure);
    expect([error.code, error.message, error.cause]).toEqual([code === 'stopping' ? 'stopped' : code, source.message, source]);
  });

  const disconnects: readonly { reason: DisconnectReason; code: string; message: string }[] = [
    { reason: { kind: 'explicit-stop', requestId: 'req/2' }, code: 'stopped', message: 'daemon stopped explicitly (request req/2)' },
    { reason: { kind: 'explicit-stop', requestId: null }, code: 'stopped', message: 'daemon stopped explicitly' },
    { reason: { kind: 'idle-exit' }, code: 'stopped', message: 'daemon exited while idle' },
    { reason: { kind: 'failure', message: 'socket lost' }, code: 'unavailable', message: 'daemon unavailable: socket lost' },
    { reason: { kind: 'slow-consumer' }, code: 'unavailable', message: 'this client fell behind' },
    { reason: { kind: 'incompatible', daemon: 'ramify.ipc/0', client: 'ramify.ipc/2' }, code: 'incompatible',
      message: 'daemon protocol ramify.ipc/0 client ramify.ipc/2' },
    { reason: { kind: 'rejected', code: 'resource-unavailable', message: 'daemon connection limit reached' },
      code: 'resource-unavailable', message: 'daemon connection limit reached' },
    { reason: { kind: 'rejected', code: 'stopping', message: 'daemon is stopping' }, code: 'stopped', message: 'daemon is stopping' },
    { reason: { kind: 'closed' }, code: 'unavailable', message: "daemon released this client's lease" },
  ];
  it.each(disconnects)('renders $reason.kind without losing its disposition', ({ reason, code, message }) => {
    const error = disconnectFailure(reason);
    expect([error.code, error.message, error.cause]).toEqual([code, message, reason]);
  });

  for (const format of ['human', 'json']) it(`retains translated errors in ${format} while unexpected exceptions stay internal`, async () => {
    for (const [failure, expected] of [
      [serviceFailure({ code: 'stopping', message: 'daemon stopped explicitly (request req/3)', details: {} }), 'stopped'],
      [serviceFailure({ code: 'resource-unavailable', message: 'all contexts leased', details: {} }), 'resource-unavailable'],
      [Object.assign(new Error('untranslated exception'), { code: 'stopped' }), 'internal-error'],
    ] as const) {
      const stdout: string[] = [], stderr: string[] = [];
      let calls = 0;
      const environment: CliEnvironment = { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
        stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
        // Exercise the command exception boundary only; this supplies no service.
        batch: async () => { calls++; throw failure; },
      };
      const exit = await runCli(['check', '--batch', ...(format === 'json' ? ['--format', 'json'] : [])], environment);
      expect([exit, calls]).toEqual([2, 1]);
      if (format === 'json') {
        expect(stderr).toEqual([]);
        expect(stdout).toEqual([JSON.stringify({ schemaVersion: 'ramify.cli/2', status: 'unavailable',
          diagnostics: [{ category: 'execution', code: expected, message: failure.message }], exitCode: 2 }) + '\n']);
      } else {
        expect(stdout).toEqual([]);
        expect(stderr).toEqual([`Check failed (${expected}).\n  [${expected}]: ${failure.message}\nNo result was claimed.\n`]);
      }
    }
  });

  it.each([['--help'], ['check', '--batch', '--format', 'json']])('keeps output failures above translated errors for %s', async (...argv) => {
    const stderr: string[] = [];
    const failure = serviceFailure({ code: 'stopping', message: 'test stop', details: {} });
    const exit = await runCli(argv, { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: () => { throw failure; }, stderr: text => { stderr.push(text); }, batch: async () => { throw failure; } });
    expect(exit).toBe(2);
    expect(stderr.join('')).toMatch(/Output failed|output-failure/);
    if (argv[0] === 'check') expect(stderr.join('')).toContain('Check failed (stopped).');
  });

  it('keeps an interruption above a translated error and publishes no document', async () => {
    const controller = new AbortController();
    const stdout: string[] = [], stderr: string[] = [];
    const exit = await runCli(['check', '--batch', '--format', 'json'], { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); }, batch: async () => {
        controller.abort(); throw disconnectFailure({ kind: 'failure', message: 'cancelled socket' });
      } }, { signal: controller.signal });
    expect([exit, stdout, stderr]).toEqual([130, [], ['Interrupted; no result claimed.\n']]);
  });
});
