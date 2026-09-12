import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { CheckParams, ServiceResult } from '../../../../src/interfaces/service.js';
import type { CheckOutcome } from '../../../daemon/src/context-types.js';
import type { ConnectionState, DisconnectReason, RecoveryOutcome, ServiceConnection, ServiceConnector } from '../../../daemon/src/interfaces/daemon.js';
import type { CheckDocument } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

/** A real quick service answers the check, then the connection loses delivery.
 * Only that delivery fault and the terminal recovery disposition are injected. */
export async function exhaustedRecoveryWitness(reason: 'unavailable' | 'stopped' | 'incompatible') {
  const assertions: { label: string; actual: unknown; expected: unknown; passed: boolean }[] = [];
  const equal = (label: string, actual: unknown, expected: unknown): void => {
    const assertion = { label, actual, expected, passed: false };
    assertions.push(assertion);
    assert.deepEqual(actual, expected, label);
    assertion.passed = true;
  };
  const root = await mkdtemp(join(tmpdir(), 'ramify-exhausted-recovery-'));
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
  const originalBytes = 'export const value = 1;\n', laterBytes = 'export const value = 2;\n';
  const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const requests: CheckParams[] = [], starts: string[] = [], recoveries: string[] = [], events: string[] = [];
  const stdout: string[] = [], stderr: string[] = [];
  let batchCalls = 0, closeCalls = 0, closeContextCalls = 0, openCalls = 0;
  let connection: ServiceConnection | undefined, serviceReply: ServiceResult<CheckOutcome> | undefined;
  let lost = false;
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
    await writeFile(join(root, 'src/main.ts'), originalBytes);
    const connect: ServiceConnector = async options => {
      starts.push(options.start);
      const connected = await quick.connect(options);
      if (connected.status !== 'connected') return connected;
      connection = connected.connection;
      const actual = connected.connection;
      return { ...connected, connection: { ...actual,
        get state(): ConnectionState { return actual.state === 'closed' ? 'closed' : lost ? 'unavailable' : actual.state; },
        get reason(): DisconnectReason | null { return lost ? { kind: 'failure', message: 'Connection lost before check reply delivery' } : actual.reason; },
        async openContext(params, control) { openCalls++; return actual.openContext(params, control); },
        async check(params, control) {
          requests.push(structuredClone(params)); events.push('check-dispatched');
          serviceReply = await actual.check(params, control); events.push('service-replied');
          // A caller retry must retain the hash taken before this second write.
          await writeFile(join(root, 'src/main.ts'), laterBytes);
          lost = true; events.push('reply-lost');
          throw new Error('Injected connection failure after real check execution');
        },
        async recover(authorization): Promise<RecoveryOutcome> {
          recoveries.push(authorization); events.push('recovery-exhausted');
          if (reason === 'stopped') return { status: 'stopped', record: {
            schemaVersion: 'ramify.daemon-record/1', ...actual.daemon.instance,
            protocol: 'ramify.ipc/1', socket: '/quick', startedAt: quick.clock.now(), state: 'stopped',
            stopped: { at: quick.clock.now(), reason: 'explicit', requestId: 'recovery-stop' },
          } };
          return { status: 'unavailable', attempts: 3, reason: reason === 'incompatible'
            ? { kind: 'incompatible', client: 'ramify.ipc/1', daemon: 'ramify.ipc/2' }
            : { kind: 'failure', message: 'Reconnect and restart attempts exhausted' } };
        },
        async closeContext(params) { closeContextCalls++; return actual.closeContext(params); },
        async close() { closeCalls++; await actual.close(); events.push('connection-closed'); },
      } };
    };
    const exitCode = await runCli(['check', '--changed', 'src/main.ts', '--format', 'json', '--deadline', '5000'], {
      cwd: root, version: '0', connect,
      stdout(text) { stdout.push(text); events.push('stdout'); }, stderr(text) { stderr.push(text); },
      batch: async () => { batchCalls++; throw new Error('Unexpected batch fallback'); },
    });
    const document = stdout.length === 1 ? JSON.parse(stdout[0]) as CheckDocument : null;
    equal('one successful initial connection and context opening', [starts, openCalls], [['if-needed'], 1]);
    equal('one real check before reply loss', requests.length, 1);
    equal('real service completed a covering clean revision before reply loss',
      serviceReply?.ok && serviceReply.value.status === 'reported' && serviceReply.value.published
        ? [serviceReply.value.revision.outcome.execution, serviceReply.value.freshness.verified, serviceReply.value.delta.findings.length]
        : serviceReply, ['completed', true, 0]);
    equal('CLI sent the original bytes as a synchronized delta expectation',
      requests[0] ? [requests[0].scope, requests[0].freshness] : null,
      ['delta', { mode: 'synchronized', expect: [{ path: 'src/main.ts', sha256: hash(originalBytes) }] }]);
    equal('one automatic recovery with no further requests', recoveries, ['automatic']);
    equal('terminal recovery selects exit 2 without batch', [exitCode, batchCalls], [2, 0]);
    equal('exactly one stdout document with empty stderr', [stdout.length, stderr], [1, []]);
    equal('output is the compact terminal outcome', document ? [document.schemaVersion, document.outcome, document.reason, document.exitCode] : null,
      ['ramify.check/1', 'not-checked', reason, 2]);
    equal('lost response cannot claim a published result', document ? [document.revision, document.execution, document.checked, document.timings.daemon] : null,
      [null, null, null, null]);
    equal('output retains the original expectation without coverage', document?.changed,
      [{ path: 'src/main.ts', sha256: hash(originalBytes), covered: false }]);
    equal('disk changed after the original expectation was sent', hash(await readFile(join(root, 'src/main.ts'), 'utf8')), hash(laterBytes));
    equal('no findings are fabricated from a reply the client lost', document?.findings, []);
    equal('the disconnected connection is closed exactly once without a remote close request', [closeCalls, closeContextCalls, connection?.state], [1, 0, 'closed']);
    equal('cleanup finishes before the single output write', events,
      ['check-dispatched', 'service-replied', 'reply-lost', 'recovery-exhausted', 'connection-closed', 'stdout']);
    const status = await quick.service.daemonStatus();
    equal('real daemon status remains readable after connection cleanup', status.ok, true);
    if (status.ok) {
      equal('no connection or subscription remains', [status.value.connections, status.value.subscriptions], [0, 0]);
      equal('one retained context has no pending request or request lease', status.value.contexts.map(context =>
        [context.pending.requests, context.pending.analysisRunning, context.leases.requests, context.leases.subscriptions]), [[0, false, 0, 0]]);
    }
    return { reason, passed: true, assertions, document, requests, events };
  } finally {
    try {
      await quick.dispose();
      equal('quick disposal releases its watcher handles and timers', [quick.watcher.active, quick.clock.pending], [0, 0]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
}
