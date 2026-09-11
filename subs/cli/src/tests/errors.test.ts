import { describe, expect, it } from 'vitest';
import type { ServiceErrorCode } from '../../../../src/interfaces/service.js';
import type { DisconnectReason } from '../../../daemon/src/interfaces/daemon.js';
import { CliFailure, disconnectFailure, serviceFailure } from '../errors.js';
import type { CliEnvironment } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

describe('CLI service and disconnect errors', () => {
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
    { reason: { kind: 'incompatible', daemon: 'ramify.ipc/2', client: 'ramify.ipc/1' }, code: 'incompatible',
      message: 'daemon protocol ramify.ipc/2 client ramify.ipc/1' },
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
        expect(stdout).toEqual([JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable',
          diagnostics: [{ category: 'execution', code: expected, message: failure.message }], exitCode: 2 }) + '\n']);
      } else {
        expect(stdout).toEqual([]);
        expect(stderr).toEqual([`Error [${expected}]: ${failure.message}\n`]);
      }
    }
  });

  it.each([['--help'], ['check', '--batch', '--format', 'json']])('keeps output failures above translated errors for %s', async (...argv) => {
    const stderr: string[] = [];
    const failure = serviceFailure({ code: 'stopping', message: 'test stop', details: {} });
    const exit = await runCli(argv, { cwd: '/project', version: '1', connect: async () => { throw new Error('Unexpected daemon connection'); },
      stdout: () => { throw failure; }, stderr: text => { stderr.push(text); }, batch: async () => { throw failure; } });
    expect(exit).toBe(2);
    expect(stderr.join('')).toContain('Error [output-failure]:');
    expect(stderr.join('')).not.toContain('Error [stopped]:');
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
