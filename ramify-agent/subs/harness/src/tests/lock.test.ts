import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { acquireProjectLock, lockPath, ProjectLockError } from '../store/lock.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { deadPid } from './helpers/jobs.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const path = () => join(directory.path, lockPath);
const readRecord = async () => JSON.parse(await readFile(path(), 'utf8')) as { pid: number; token: string };

test('the lock holds this process and is refused while a live process holds it', async () => {
  const lock = await acquireProjectLock(directory.path);
  expect(await readRecord()).toMatchObject({ pid: process.pid, token: lock.record.token });
  const refusal = await acquireProjectLock(directory.path).catch(error => error);
  expect(refusal).toBeInstanceOf(ProjectLockError);
  expect((refusal as ProjectLockError).holder?.pid).toBe(process.pid);
  expect(await lock.held()).toBe(true);
  await lock.release();
  expect(existsSync(path())).toBe(false);
});

test('a lock whose process is gone is taken over', async () => {
  const first = await acquireProjectLock(directory.path);
  await writeFile(path(), `${JSON.stringify({ pid: await deadPid(), startedAt: new Date().toISOString(), processStart: null, token: 'dead' })}\n`);
  expect(await first.held()).toBe(false);
  const second = await acquireProjectLock(directory.path);
  expect(await readRecord()).toMatchObject({ pid: process.pid, token: second.record.token });
  // The first acquisition no longer holds the lock and leaves it in place.
  await first.release();
  expect(await second.held()).toBe(true);
});

test.skipIf(!existsSync('/proc/self/stat'))('a reused process ID is told apart by its start time', async () => {
  await acquireProjectLock(directory.path);
  const record = await readRecord();
  await writeFile(path(), `${JSON.stringify({ ...record, processStart: '1', token: 'earlier-process' })}\n`);
  const lock = await acquireProjectLock(directory.path);
  expect(await lock.held()).toBe(true);
});

test('an unreadable lock is refused', async () => {
  await acquireProjectLock(directory.path);
  await writeFile(path(), 'not json');
  await expect(acquireProjectLock(directory.path)).rejects.toThrow(/cannot be read/);
});
