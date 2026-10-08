import { declaringScenarios } from './helpers/declarations.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type Script } from '../../subs/agent/src/scripted.js';
import type { AgentPort, AgentSession, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { WriterBlockedError, WriterOwnership } from '../run/writer.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';
import { emptyAnalysis, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { settlementBoundaries } from './helpers/settlement-boundaries.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * Cancellation is not settlement.
 *
 * Settlement is the harness's own observation: the session idle, and every
 * process group it registered killed and confirmed gone. `stop()` resolving
 * is not evidence, and neither is an agent's statement. A release that could
 * not be confirmed blocks every writer and every gate that would follow, and
 * the run fails as `writer-unsettled`.
 *
 * The ordinary cases use declared group controls. The detached process
 * witnesses live in writer-settlement.boundary.test.ts.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
  try { expectNoProcesses(); } catch (error) { failures.push(error); } finally { forgetExternalTools(); }
  if (failures.length) throw new AggregateError(failures, 'fixture cleanup failed');
});

/** A session that reports whatever the test says it reports. */
function session(idle: 'settled' | 'timed-out'): AgentSession {
  return {
    outcome: Promise.resolve({ kind: 'ended' as const }),
    start: { mode: 'fresh' as const },
    ref: 'test',
    settled: async () => idle,
    stop: async () => undefined,
  };
}

describe('the harness confirms settlement itself', () => {

  test('a group that cannot be confirmed gone leaves the release unconfirmed, and blocks what follows', async () => {
    const alive = new Set([4242]);
    const writer = new WriterOwnership({
      settleMs: 100,
      pollMs: 10,
      // A group the harness cannot kill: it asks, and it is still there.
      groups: { alive: pid => alive.has(pid), kill: () => undefined },
    });
    writer.acquire('inv-0001');
    writer.register('inv-0001', 4242);

    const settled = await writer.release('inv-0001', session('settled'));
    expect(settled.confirmed).toBe(false);
    expect(settled.groupsKilled).toBe(0);
    expect(writer.isUnsettled).toBe(true);
    expect(writer.blocked).toContain('left 1 process group running');

    // Nothing later clears it: no writer and no gate may follow.
    expect(() => writer.acquire('inv-0002')).toThrow(WriterBlockedError);
    expect(() => writer.requireSettled('The gate cannot run')).toThrow(/no writer and no gate may follow/);
  });

  test('a session that never becomes idle is not settled, although nothing is left running', async () => {
    const writer = new WriterOwnership({ settleMs: 50, pollMs: 10 });
    writer.acquire('inv-0001');
    const settled = await writer.release('inv-0001', session('timed-out'));
    expect(settled.confirmed).toBe(false);
    expect(writer.blocked).toContain('did not become idle');
  });

  test('a second writer without an intervening release is a fault of the harness', () => {
    const writer = new WriterOwnership({ settleMs: 50 });
    writer.acquire('inv-0001');
    expect(() => writer.acquire('inv-0002')).toThrow(/holds the writer/);
    expect(writer.held).toBe('inv-0001');
  });

});

describe('a run whose invocation is not confirmed settled', () => {
  /** The scripted fake, with sessions that never confirm they are idle. */
  function unsettling(script: Script): AgentPort {
    const scripted = createScriptedAgent(declaringScenarios(script));
    return {
      name: scripted.name,
      support: scripted.support,
      bindSessionStore(store) {
        const operations = scripted.bindSessionStore(store);
        return { ...operations, async continue(input) {
          const handle = await operations.continue(input);
          return { ...handle, settled: async () => new Promise(() => undefined) };
        } };
      },
    };
  }

  test('fails as writer-unsettled, and runs no gate against that tree', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const boundaries = settlementBoundaries(fixture.root);
    cleanups.push(async () => boundaries.assertComplete());

    const { service } = await openRuns(fixture.root, { ...boundaries.options, agent: unsettling([{ kind: 'submit', input: emptyAnalysis() }]) });
    cleanups.push(() => service.close().catch(() => undefined));

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('writer-unsettled');

    // The analysis was accepted; readiness never ran, so the run has no gate.
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    // Its three sessions are the intake, the initial architect and the check.
    const session = ['session-opened', 'invocation-started', 'invocation-prepared', 'invocation-prepared', 'invocation-ended'];
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'document-manifest-committed', ...session, ...session, ...session, 'analysis-accepted', 'session-finished', 'job-failed',
    ]);
    expect(events.filter(event => event.type === 'invocation-prepared').map(event => event.data.invocation))
      .toEqual(['inv-0001', 'inv-0001', 'inv-0002', 'inv-0002', 'inv-0003', 'inv-0003']);
    for (const invocation of ['inv-0001', 'inv-0002', 'inv-0003']) {
      const outcome = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.outcome(invocation)), 'utf8')) as InvocationOutcome;
      expect(outcome.settled.confirmed, invocation).toBe(false);
      expect(outcome.ended, invocation).toBe('submitted');
    }
  }, 180_000);

  test('a tree the run never checked is left exactly as it was', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const boundaries = settlementBoundaries(fixture.root);
    cleanups.push(async () => boundaries.assertComplete());
    await writeFile(join(fixture.root, 'src', 'untouched.ts'), 'export const x = 1;\n');

    const { service } = await openRuns(fixture.root, { ...boundaries.options, agent: unsettling([{ kind: 'submit', input: emptyAnalysis() }]) });
    cleanups.push(() => service.close().catch(() => undefined));
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    expect(await readFile(join(fixture.root, 'src', 'untouched.ts'), 'utf8')).toBe('export const x = 1;\n');
  }, 180_000);

  test('close retains the project lock when session settlement was not confirmed', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const boundaries = settlementBoundaries(fixture.root);
    cleanups.push(async () => boundaries.assertComplete());

    const opened = await openRuns(fixture.root, { ...boundaries.options, agent: unsettling([{ kind: 'submit', input: emptyAnalysis() }]) });
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);

    await expect(opened.service.close()).rejects.toThrow('settlement was not confirmed');
    expect(await opened.lock.held()).toBe(true);
    // Settlement is a durable safety result, not transient backpressure: a
    // retry cannot release ownership without a separate recovery contract.
    await expect(opened.service.close()).rejects.toThrow('settlement was not confirmed');
    expect(await opened.lock.held()).toBe(true);
  }, 180_000);
});
