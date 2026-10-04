import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { CheckOutcome } from '../../../daemon/src/context-types.js';
import type { DisconnectReason, ServiceConnection, ServiceConnector } from '../../../daemon/src/interfaces/daemon.js';
import type { CheckDocument } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

/** Exercise cleanup faults after a real quick-service reply, or cancellation
 * when connecting or completing asynchronous cleanup. */
export async function changedCleanupWitness(fault: 'close-context' | 'close-connection'
  | 'cancel-connect' | 'cancel-close-context' | 'cancel-close-connection') {
  const assertions: string[] = [];
  function equal(label: string, actual: unknown, expected: unknown): void {
    assert.deepEqual(actual, expected, label);
    assertions.push(label);
  }
  const root = await mkdtemp(join(tmpdir(), 'ramify-changed-cleanup-'));
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
  const controller = new AbortController();
  const stdout: string[] = [], stderr: string[] = [], events: string[] = [];
  const description = 'ramify 1\nroot module "InvalidName"\n';
  let connection: ServiceConnection | undefined;
  let received: Extract<CheckOutcome, { status: 'reported'; published: true }> | undefined;
  let closeCalls = 0, closeContextCalls = 0, openCalls = 0, checkCalls = 0, classificationCalls = 0, recoveries = 0, batchCalls = 0;
  let lost = false;
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'module.ramify'), 'ramify 1\nroot module fixture\n');
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
    await writeFile(join(root, 'src/main.ts'), 'export const value = 1;\n');
    if (fault !== 'cancel-connect') {
      const baseline: string[] = [];
      const exit = await runCli(['check', '--changed', 'module.ramify', '--format', 'json', '--deadline', '5000'], {
        cwd: root, version: '0', connect: quick.connect,
        stdout: text => { baseline.push(text); }, stderr: text => { throw new Error(text); },
        batch: async () => { throw new Error('Unexpected baseline batch'); },
      });
      equal('the real clean baseline completes before the cleanup fault',
        [exit, baseline.length, baseline.length === 1 ? JSON.parse(baseline[0]).findings : null], [0, 1, []]);
      if (fault === 'close-context' || fault === 'close-connection') {
        await writeFile(join(root, 'module.ramify'), description);
      }
    }
    const connect: ServiceConnector = async options => {
      const connected = await quick.connect(options);
      if (connected.status !== 'connected') return connected;
      connection = connected.connection;
      const actual = connected.connection;
      if (fault === 'cancel-connect') controller.abort();
      return { ...connected, connection: { ...actual,
        get reason(): DisconnectReason | null {
          return lost ? { kind: 'failure', message: 'Connection lost during cleanup' } : actual.reason;
        },
        async openContext(params, control) { openCalls++; return actual.openContext(params, control); },
        async check(params, control) {
          // The client's first request carries no content and is answered with the daemon's classification.
          const classifying = params.freshness.mode === 'synchronized' && !params.freshness.expect.length;
          if (classifying) classificationCalls++; else checkCalls++;
          const response = await actual.check(params, control);
          if (response.ok && response.value.status === 'reported' && response.value.published) received = response.value;
          events.push(classifying ? 'classification-received' : 'check-received');
          return response;
        },
        async recover(authorization) { recoveries++; return actual.recover(authorization); },
        async closeContext(params) {
          closeContextCalls++;
          const response = await actual.closeContext(params);
          events.push('context-closed');
          if (fault === 'cancel-close-context') controller.abort();
          if (fault === 'close-context') { lost = true; throw new Error('Lost closeContext reply'); }
          return response;
        },
        async close() {
          closeCalls++;
          await actual.close();
          events.push('connection-closed');
          if (fault === 'cancel-close-connection') controller.abort();
          if (fault === 'close-connection') { lost = true; throw new Error('Connection cleanup failed'); }
        },
      } };
    };
    const exitCode = await runCli(['check', '--changed', 'module.ramify', '--format', 'json', '--deadline', '5000'], {
      cwd: root, version: '0', connect,
      stdout(text) { stdout.push(text); events.push('stdout'); }, stderr(text) { stderr.push(text); },
      batch: async () => { batchCalls++; throw new Error('Unexpected batch'); },
    }, { signal: controller.signal });
    if (fault === 'cancel-connect') {
      equal('connection-completion cancellation exits 130 without stdout or a batch', [exitCode, stdout, batchCalls], [130, [], 0]);
      equal('interruption remains explicit', stderr, ['Interrupted; no result claimed.\n']);
      equal('no context, check or recovery starts after cancellation', [openCalls, checkCalls, recoveries, closeContextCalls], [0, 0, 0, 0]);
      equal('the acquired connection is closed exactly once', [closeCalls, connection?.state], [1, 'closed']);
    } else if (fault === 'cancel-close-context' || fault === 'cancel-close-connection') {
      equal('the real service supplied a completed clean covering revision before cleanup', received
        ? [received.revision.outcome.execution, received.freshness.verified, received.delta.findings] : null,
      ['completed', true, []]);
      equal('cancellation during cleanup exits 130 without stdout or a batch', [exitCode, stdout, batchCalls], [130, [], 0]);
      equal('interruption remains explicit', stderr, ['Interrupted; no result claimed.\n']);
      equal('cleanup finishes once without another check or recovery',
        [openCalls, classificationCalls, checkCalls, recoveries, closeContextCalls, closeCalls, connection?.state], [1, 1, 1, 0, 1, 1, 'closed']);
      equal('both cleanup operations finish without delivering the received result', events,
        ['classification-received', 'check-received', 'context-closed', 'connection-closed']);
    } else {
      equal('real service supplied an invalid covering revision', received
        ? [received.revision.outcome.execution, received.freshness.verified, received.delta.findings.map(item => item.code)] : null,
      ['invalid', true, ['invalid-name']]);
      assert(received);
      equal('cleanup failure exits 2 with exactly one document and no stderr or batch', [exitCode, stdout.length, stderr, batchCalls], [2, 1, [], 0]);
      const document = JSON.parse(stdout[0]) as CheckDocument;
      equal('cleanup failure remains explicit', [document.schemaVersion, document.outcome, document.reason, document.exitCode],
        ['ramify.check/2', 'not-checked', 'unavailable', 2]);
      equal('received diagnostics and new marks survive cleanup failure', document.findings, received.delta.findings);
      equal('the independently expected invalid name is marked new', document.findings.map(item => [item.code, item.new]), [['invalid-name', true]]);
      equal('received revision and execution evidence is preserved', [document.revision, document.execution, document.checked],
        [{ id: received.revision.revision, sequence: received.revision.sequence, path: received.revision.checked.path },
          'invalid', received.revision.checked]);
      equal('the received checked disposition remains tied to the original hash', document.paths.map(item =>
        [item.path, item.disposition, item.reason, item.disposition === 'checked' ? item.sha256 : undefined]),
      [['module.ramify', 'checked', 'content', createHash('sha256').update(description).digest('hex')]]);
      equal('remaining result metadata is preserved', [document.since, document.removed, document.warnings, document.coverage, document.timings.daemon],
        [received.delta.since, received.delta.removed, received.delta.warnings, received.delta.coverage, received.revision.timings]);
      equal('cleanup does not repeat the check or recover', [openCalls, classificationCalls, checkCalls, recoveries, closeContextCalls, closeCalls, connection?.state],
        [1, 1, 1, 0, 1, 1, 'closed']);
      equal('both cleanup steps run before the single output', events,
        ['classification-received', 'check-received', 'context-closed', 'connection-closed', 'stdout']);
    }
    const status = await quick.service.daemonStatus();
    equal('real service status remains available', status.ok, true);
    assert(status.ok);
    equal('no connection or subscription remains after the command', [status.value.connections, status.value.subscriptions], [0, 0]);
    equal('no request or lease remains', status.value.contexts.map(item =>
      [item.pending.requests, item.pending.analysisRunning, item.leases.requests, item.leases.subscriptions]),
    fault === 'cancel-connect' ? [] : [[0, false, 0, 0]]);
    return { fault, passed: true, assertions };
  } finally {
    try {
      await quick.dispose();
      equal('quick disposal releases watcher handles and timers', [quick.watcher.active, quick.clock.pending], [0, 0]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
}
