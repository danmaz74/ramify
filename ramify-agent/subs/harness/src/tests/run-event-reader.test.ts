import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runEventsOnDisk, runPath } from './helpers/runs.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  try { expect(spawnAttempts()).toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Event reader fixture teardown failed');
});
const first = { sequence: 1, jobId: 'reader-run', at: '2026-10-08T00:00:00Z', type: 'job-interrupted', data: { message: 'A stated interrupted run' } };
const second = { sequence: 2, jobId: 'reader-run', at: '2026-10-08T00:00:01Z', type: 'job-stopped', data: { settled: true } };
const line = (event: typeof first | typeof second) => JSON.stringify({ event });
async function fixture() {
  const directory = await temporaryDirectory(); cleanups.push(directory.remove);
  const path = runPath(directory.path, 'reader-plan', 'reader-run', 'events.jsonl');
  await mkdir(dirname(path), { recursive: true });
  return { root: directory.path, path };
}

test('the run event reader returns every complete written record without launching a process', async () => {
  const { root, path } = await fixture();
  await writeFile(path, `${line(first)}\n${line(second)}\n`);
  expect(await runEventsOnDisk(root, 'reader-plan', 'reader-run')).toEqual([first, second]);
});

test('the run event reader defers only the unfinished final append and leaves its bytes intact', async () => {
  const { root, path } = await fixture();
  for (const tail of ['{"event":', line(second)]) {
    const bytes = `${line(first)}\n${tail}`;
    await writeFile(path, bytes);
    expect(await runEventsOnDisk(root, 'reader-plan', 'reader-run')).toEqual([first]);
    expect(await readFile(path, 'utf8')).toBe(bytes);
  }
});

test('the run event reader rejects a corrupt completed record even when valid records follow it', async () => {
  const { root, path } = await fixture();
  await writeFile(path, `${line(first)}\n{"event":\n${line(second)}\n`);
  await expect(runEventsOnDisk(root, 'reader-plan', 'reader-run')).rejects.toMatchObject({ name: 'CorruptJsonLinesError', line: 2 });
});

test('the run event reader preserves missing-file refusal instead of answering an empty run', async () => {
  const { root } = await fixture();
  await expect(runEventsOnDisk(root, 'reader-plan', 'reader-run')).rejects.toMatchObject({ code: 'ENOENT' });
});
