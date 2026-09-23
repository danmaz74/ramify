import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createScriptedAgent, type Script } from '../../subs/agent/src/scripted.js';
import type { AgentPort, AgentSession, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { nodeProcessGroups, WriterBlockedError, WriterOwnership } from '../run/writer.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';
import { emptyAnalysis, initRepository, installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * Cancellation is not settlement.
 *
 * Settlement is the harness's own observation: the session idle, and every
 * process group it registered killed and confirmed gone. `stop()` resolving
 * is not evidence, and neither is an agent's statement. A release that could
 * not be confirmed blocks every writer and every gate that would follow, and
 * the run fails as `writer-unsettled`.
 *
 * The process groups below are real: a detached child that outlives its
 * parent, killed by its group and then confirmed gone.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A detached process that outlives its parent and ignores a polite signal. */
function detachedGroup(script: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => undefined);${script}`], { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('error', reject);
    // The child is its own group leader once it is spawned detached.
    setTimeout(() => resolve(child.pid!), 50);
  });
}

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
  test('a session that says it is idle while its process group runs is not settled', async () => {
    const pid = await detachedGroup('setTimeout(() => undefined, 60000)');
    const writer = new WriterOwnership({ settleMs: 300, pollMs: 20 });
    writer.acquire('inv-0001');
    writer.register('inv-0001', pid);

    // The group is killed and confirmed gone: that, with the idle session,
    // is what makes a settlement confirmed.
    const settled = await writer.release('inv-0001', session('settled'));
    expect(settled.confirmed).toBe(true);
    expect(settled.groupsKilled).toBe(1);
    expect(nodeProcessGroups.alive(pid)).toBe(false);
    expect(writer.blocked).toBeUndefined();
  });

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

  test('a write that still arrives while the group is being killed is recorded, not lost', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const late = join(directory.path, 'late.txt');
    const pid = await detachedGroup(`setTimeout(() => require('fs').writeFileSync(${JSON.stringify(late)}, 'x'), 40); setTimeout(() => undefined, 60000);`);

    const seen: string[][] = [[], ['late.txt']];
    const writer = new WriterOwnership({
      settleMs: 1000,
      pollMs: 10,
      // What the tree said before the groups were killed, and after.
      tree: { changed: async () => seen.shift() ?? ['late.txt'] },
    });
    writer.acquire('inv-0001');
    writer.register('inv-0001', pid);

    const settled = await writer.release('inv-0001', session('settled'));
    expect(settled.confirmed).toBe(true);
    expect(settled.lateWrites).toEqual(['late.txt']);
  });

  test('a second writer without an intervening release is a fault of the harness', () => {
    const writer = new WriterOwnership({ settleMs: 50 });
    writer.acquire('inv-0001');
    expect(() => writer.acquire('inv-0002')).toThrow(/holds the writer/);
    expect(writer.held).toBe('inv-0001');
  });

  test('a group nobody registers is a group nothing waits for', async () => {
    const pid = await detachedGroup('setTimeout(() => undefined, 60000)');
    cleanups.push(async () => nodeProcessGroups.kill(pid));
    const writer = new WriterOwnership({ settleMs: 50, pollMs: 10 });
    writer.acquire('inv-0001');
    const settled = await writer.release('inv-0001', session('settled'));
    expect(settled).toMatchObject({ confirmed: true, groupsKilled: 0 });
    expect(nodeProcessGroups.alive(pid)).toBe(true);
  });
});

describe('a run whose invocation is not confirmed settled', () => {
  /** The scripted fake, with sessions that never confirm they are idle. */
  function unsettling(script: Script): AgentPort {
    const scripted = createScriptedAgent(script);
    return {
      name: scripted.name,
      observations: scripted.observations,
      appendContext: (ref, key, text) => scripted.appendContext(ref, key, text),
      startSession(spec: SessionSpec): AgentSession {
        const started = scripted.startSession(spec);
        return {
          get outcome() { return started.outcome; },
          get start() { return started.start; },
          get ref() { return started.ref; },
          settled: async () => 'timed-out',
          stop: () => started.stop(),
        };
      },
    };
  }

  test('fails as writer-unsettled, and runs no gate against that tree', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    await initRepository(fixture.root);

    const { service } = await openRuns(fixture.root, { git: gitService, agent: unsettling([{ kind: 'submit', input: emptyAnalysis() }]) });
    cleanups.push(() => service.close().catch(() => undefined));

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('writer-unsettled');

    // The analysis was accepted; readiness never ran, so the run has no gate.
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted', 'session-finished', 'job-failed',
    ]);
    const outcome = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome.settled.confirmed).toBe(false);
    expect(outcome.ended).toBe('submitted');
  }, 180_000);

  test('a tree the run never checked is left exactly as it was', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    await initRepository(fixture.root);
    await writeFile(join(fixture.root, 'src', 'untouched.ts'), 'export const x = 1;\n');

    const { service } = await openRuns(fixture.root, { git: gitService, agent: unsettling([{ kind: 'submit', input: emptyAnalysis() }]) });
    cleanups.push(() => service.close().catch(() => undefined));
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    expect(await readFile(join(fixture.root, 'src', 'untouched.ts'), 'utf8')).toBe('export const x = 1;\n');
  }, 180_000);

  test('close retains the project lock when session settlement was not confirmed', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    await initRepository(fixture.root);

    const opened = await openRuns(fixture.root, { git: gitService, agent: unsettling([{ kind: 'submit', input: emptyAnalysis() }]) });
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
