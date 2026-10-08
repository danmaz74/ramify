import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { AgentSession } from '../../subs/agent/src/interfaces/port.js';
import { nodeProcessGroups, WriterOwnership } from '../run/writer.js';
import { temporaryDirectory } from './helpers/fixture.js';

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
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
  if (failures.length) throw new AggregateError(failures, 'fixture cleanup failed');
});

/** A detached process that outlives its parent and ignores a polite signal. */
function detachedGroup(script: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => undefined);${script}`], { detached: true, stdio: 'ignore' });
    child.unref();
    cleanups.push(async () => {
      const pid = child.pid;
      if (pid === undefined) return;
      await nodeProcessGroups.kill(pid);
      const end = Date.now() + 1000;
      while (nodeProcessGroups.alive(pid) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
      expect(nodeProcessGroups.alive(pid), 'owned detached group survives cleanup').toBe(false);
    });
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

describe('actual writer process settlement', () => {
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
