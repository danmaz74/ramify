import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
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
