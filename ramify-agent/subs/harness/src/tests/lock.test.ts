import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { acquireProjectLock, lockPath, ProjectLockError } from '../store/lock.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { deadPid } from './helpers/runs.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const path = () => join(directory.path, lockPath);
const readRecord = async () => JSON.parse(await readFile(path(), 'utf8')) as { pid: number; token: string };

test('an unreadable lock is refused', async () => {
  await acquireProjectLock(directory.path);
  await writeFile(path(), 'not json');
  await expect(acquireProjectLock(directory.path)).rejects.toThrow(/cannot be read/);
});

test('every held check reads the current validated token and retains its Promise contract', async () => {
  const lock = await acquireProjectLock(directory.path);
  const original = await readFile(path(), 'utf8');
  const record = JSON.parse(original);
  const held = lock.held();
  expect(held).toBeInstanceOf(Promise);
  expect(await held).toBe(true);
  await writeFile(path(), JSON.stringify({ ...record, token: 'other-acquisition' }));
  expect(await lock.held()).toBe(false);
  await writeFile(path(), original);
  expect(await lock.held()).toBe(true);
  await writeFile(path(), 'not json');
  expect(await lock.held()).toBe(false);
  await writeFile(path(), JSON.stringify({ ...record, pid: 'invalid-pid' }));
  expect(await lock.held()).toBe(false);
  await rm(path());
  expect(await lock.held()).toBe(false);
  await writeFile(path(), original);
  expect(await lock.held()).toBe(true);
  await lock.release();
  expect(existsSync(path())).toBe(false);
  expect(await lock.held()).toBe(false);
});
