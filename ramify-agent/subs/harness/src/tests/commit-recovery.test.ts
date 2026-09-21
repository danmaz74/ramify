import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { commitRecord, recoverCommits } from '../jobs/commit.js';
import { commitEventSchema, logLines, logPathOf, openCommitLog, recordBytes, recordRef } from './helpers/commit.js';
import { temporaryDirectory } from './helpers/fixture.js';

/*
 * Rules 3 and 4 after a crash. A transition is wholly in the log or it did not
 * happen; the record files are materialized copies the load rewrites. Recovery
 * is one loop over the log for every record kind. It is given no agent, and
 * the scripted agent below is in scope only to assert that none is started.
 */

let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  directory = await temporaryDirectory();
});
afterEach(async () => {
  await directory.remove();
});

const started = (note = '') => commitEventSchema.parse({ type: 'run-started', note });
const planned = (note = '') => commitEventSchema.parse({ type: 'plan-accepted', note });
const accepted = (note = '') => commitEventSchema.parse({ type: 'iteration-accepted', note });

/** The three record kinds one transition each commits, as a run's layout holds them. */
const runRecord = recordRef('run/run.json', 'run-0001', 1, { policy: 'scope-size/1' });
const planRecord = recordRef('analysis/01/analysis.json', 'an-0001', 1, { entries: 2 });
const iterationRecord = recordRef('iterations/01/assignment.json', 'it-0001', 1, { scope: 'harness' });

/** Commits the three transitions and abandons the ledger, as a crash does. */
async function threeKinds(): Promise<void> {
  const log = await openCommitLog(directory.path);
  await commitRecord(log, { event: started(), records: [runRecord] });
  await commitRecord(log, { event: planned(), records: [planRecord] });
  await commitRecord(log, { event: accepted(), records: [iterationRecord] });
}

describe('a crash before a transition\'s log line leaves no trace', () => {
  test('a torn line is discarded, its record file was never written, and the repeat commits once', async () => {
    const first = await openCommitLog(directory.path);
    await commitRecord(first, { event: started(), records: [runRecord] });

    // The crash: the next line began and never finished, so no record file followed it.
    await appendFile(logPathOf(directory.path), '{"sequence":2,"at":"2026-09-20T00:00:00.000Z","event":{"type":"plan-acce');

    const second = await openCommitLog(directory.path);
    expect(second.replay().map(entry => entry.transaction.event.type)).toEqual(['run-started']);
    expect(await recoverCommits(second)).toEqual({ rewritten: [] });
    await expect(readFile(join(directory.path, planRecord.path), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    expect(await commitRecord(second, { event: planned(), records: [planRecord] })).toBe('committed');
    const lines = await logLines(directory.path);
    expect(lines.map(line => [line.sequence, line.event.type])).toEqual([[1, 'run-started'], [2, 'plan-accepted']]);
    expect(await readFile(join(directory.path, planRecord.path), 'utf8')).toBe(recordBytes(planRecord.body));
  });

  test('a log with no complete line leaves nothing to recover', async () => {
    await writeFile(logPathOf(directory.path), '{"sequence":1,"at":"2026-09-20T00');
    const log = await openCommitLog(directory.path);
    expect(log.version).toBe(0);
    expect(await recoverCommits(log)).toEqual({ rewritten: [] });
  });
});

describe('a crash after the line re-materializes every file', () => {
  test('one loop rewrites every record kind that is missing or differs, appending nothing', async () => {
    await threeKinds();
    const agent = createScriptedAgent([]);

    // The crash: one file never reached the disk, one was left half-written, one is intact.
    await rm(join(directory.path, runRecord.path));
    await writeFile(join(directory.path, planRecord.path), '{"schema":"ramify-agent.test-');

    const log = await openCommitLog(directory.path);
    const recovered = await recoverCommits(log);

    expect([...recovered.rewritten].sort()).toEqual([planRecord.path, runRecord.path].sort());
    for (const record of [runRecord, planRecord, iterationRecord]) {
      expect(await readFile(join(directory.path, record.path), 'utf8')).toBe(recordBytes(record.body));
    }
    expect(await logLines(directory.path)).toHaveLength(3);
    expect(log.version).toBe(3);
    expect(agent.sessions).toEqual([]);
  });

  test('a second recovery rewrites nothing', async () => {
    await threeKinds();
    await rm(join(directory.path, iterationRecord.path));

    const log = await openCommitLog(directory.path);
    expect((await recoverCommits(log)).rewritten).toEqual([iterationRecord.path]);
    expect(await recoverCommits(log)).toEqual({ rewritten: [] });
  });

  test('every transition repeated after recovery is already committed, so recovery makes no duplicate', async () => {
    await threeKinds();
    await rm(join(directory.path, runRecord.path));

    const agent = createScriptedAgent([]);
    const log = await openCommitLog(directory.path);
    await recoverCommits(log);

    expect(await commitRecord(log, { event: started(), records: [runRecord] })).toBe('already-committed');
    expect(await commitRecord(log, { event: planned(), records: [planRecord] })).toBe('already-committed');
    expect(await commitRecord(log, { event: accepted(), records: [iterationRecord] })).toBe('already-committed');

    const lines = await logLines(directory.path);
    expect(lines.map(line => line.event.type)).toEqual(['run-started', 'plan-accepted', 'iteration-accepted']);
    expect(agent.sessions).toEqual([]);
  });
});
