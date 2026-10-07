import { mockGit } from './helpers/mock-git.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { copyCapabilityFixture } from './helpers/capability.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { openRuns, runPath } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('PB3-R01: old and unversioned raw jobs are refusal-only, before decoding, recovery, cleanup or launch', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const ids: string[] = [];
  const original = new Map<string, string>();
  for (const version of [undefined, ...Array.from({ length: 6 }, (_, index) => `run-policy/${index + 1}`)]) {
    const id = `20261007T160000Z-${String(ids.length).padStart(6, '0')}`; ids.push(id);
    const directory = runPath(fixture.root, 'need', id, ''); await mkdir(directory, { recursive: true });
    const files = { 'job.json': JSON.stringify({ kind: 'implementation', policy: version === undefined ? undefined : { version }, invalidBody: true }),
      'events.jsonl': 'intentionally invalid old ledger that must not be decoded\n', 'scratch.txt': 'old pending writer artifact\n' };
    for (const [file, text] of Object.entries(files)) { const path = join(directory, file); await writeFile(path, text); original.set(path, text); }
  }
  await mkdir(join(fixture.root, 'subs/a/src/tmp'), { recursive: true });
  await writeFile(join(fixture.root, 'subs/a/src/tmp/preserved.txt'), 'must survive refusal');
  let launches = 0;
  const ramify = new FakeRamifyCli();
  const opened = await openRuns(fixture.root, { production: true, git: mockGit(), ramify, script: () => { launches += 1; return []; } });
  cleanups.push(() => opened.service.close());
  expect(opened.recovery.skipped).toHaveLength(7);
  expect(opened.recovery.interrupted).toEqual([]);
  for (const id of ids) {
    expect(() => opened.service.getRun('need', id)).toThrow(/refused by run-policy\/7; a fresh run is required/u);
    expect(() => opened.service.recordOf('need', id)).toThrow(/fresh run/u);
    expect(() => opened.service.committed('need', id)).toThrow(/fresh run/u);
    await expect(opened.service.settled('need', id)).rejects.toThrow(/fresh run/u);
    await expect(opened.service.execute({ commandId: `resume-${id}`, type: 'respond-to-check-finding', expectedVersion: 0, payload: { planId: 'need', jobId: id, checkFinding: 'cf-0001', findingRevision: 1, responder: 'operator', request: 'decision-1', option: 'resume' } } as never)).rejects.toThrow(/fresh run/u);
    await expect(opened.service.execute({ commandId: `stop-${id}`, type: 'stop-job', expectedVersion: 0, payload: { planId: 'need', jobId: id } } as never)).rejects.toThrow(/fresh run/u);
  }
  for (const [path, text] of original) expect(await readFile(path, 'utf8')).toBe(text);
  expect(await readFile(join(fixture.root, 'subs/a/src/tmp/preserved.txt'), 'utf8')).toBe('must survive refusal');
  expect(launches).toBe(0); expect(ramify.calls).toEqual([]);
});
