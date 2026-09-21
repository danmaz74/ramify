import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { commitRecord, readCommitted, type CommittedSchema } from '../jobs/commit.js';
import { commitEventSchema, openCommitLog, recordRef } from './helpers/commit.js';
import { temporaryDirectory } from './helpers/fixture.js';

/*
 * Rule 9: a reader of a record returns valid, unsupported version or invalid,
 * and the last two are failures with evidence, never an absent record.
 */

const testRecordSchema: CommittedSchema<{ schema: string; id: string; revision: number; policy: string }> = {
  schema: 'ramify-agent.test-record/1',
  body: z.object({
    schema: z.literal('ramify-agent.test-record/1'),
    id: z.string().min(1),
    revision: z.int().positive(),
    policy: z.string().min(1),
  }),
};

let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  directory = await temporaryDirectory();
});
afterEach(async () => {
  await directory.remove();
});

const started = () => commitEventSchema.parse({ type: 'run-started', note: '' });

/** Writes a record file by hand, as a foreign writer or an earlier version of the harness would. */
async function writeByHand(path: string, text: string): Promise<void> {
  await mkdir(join(directory.path, 'run'), { recursive: true });
  await writeFile(join(directory.path, path), text);
}

describe('reading a committed record', () => {
  test('a record the schema accepts is valid, with its value', async () => {
    const log = await openCommitLog(directory.path);
    const record = recordRef('run/run.json', 'run-0001', 1, { policy: 'scope-size/1' });
    await commitRecord(log, { event: started(), records: [record] });

    const read = await readCommitted(log, 'run/run.json', testRecordSchema);
    expect(read.kind).toBe('valid');
    if (read.kind !== 'valid') throw new Error('unreachable');
    expect(read.value).toEqual({ schema: 'ramify-agent.test-record/1', id: 'run-0001', revision: 1, policy: 'scope-size/1' });
  });

  test('a record declaring another schema is unsupported-version, naming the schema it declares', async () => {
    const log = await openCommitLog(directory.path);
    await writeByHand('run/run.json', `${JSON.stringify({ schema: 'ramify-agent.test-record/2', id: 'run-0001', revision: 1, policy: 'scope-size/1' }, null, 2)}\n`);

    const read = await readCommitted(log, 'run/run.json', testRecordSchema);
    expect(read).toEqual({ kind: 'unsupported-version', schema: 'ramify-agent.test-record/2', path: 'run/run.json' });
  });

  test('a record the schema rejects is invalid, with one message per error and its path', async () => {
    const log = await openCommitLog(directory.path);
    await writeByHand('run/run.json', `${JSON.stringify({ schema: 'ramify-agent.test-record/1', id: '', revision: 0 }, null, 2)}\n`);

    const read = await readCommitted(log, 'run/run.json', testRecordSchema);
    expect(read.kind).toBe('invalid');
    if (read.kind !== 'invalid') throw new Error('unreachable');
    expect(read.path).toBe('run/run.json');
    expect(read.errors).toHaveLength(3);
    expect(read.errors.map(error => error.split(':')[0])).toEqual(['id', 'revision', 'policy']);
  });

  test('a record that is not a JSON value is invalid, not a crash', async () => {
    const log = await openCommitLog(directory.path);
    await writeByHand('run/run.json', '{"schema": "ramify-agent.test-record/1", "id"\n');

    const read = await readCommitted(log, 'run/run.json', testRecordSchema);
    expect(read.kind).toBe('invalid');
    if (read.kind !== 'invalid') throw new Error('unreachable');
    expect(read.errors[0]).toMatch(/not a JSON value/);
  });

  test('a record declaring no schema is invalid', async () => {
    const log = await openCommitLog(directory.path);
    await writeByHand('run/run.json', `${JSON.stringify({ id: 'run-0001', revision: 1, policy: 'scope-size/1' }, null, 2)}\n`);

    const read = await readCommitted(log, 'run/run.json', testRecordSchema);
    expect(read).toEqual({ kind: 'invalid', errors: ['the record declares no schema'], path: 'run/run.json' });
  });

  test('a missing record file is invalid with its evidence, never an absent record', async () => {
    const log = await openCommitLog(directory.path);
    const record = recordRef('run/run.json', 'run-0001', 1, { policy: 'scope-size/1' });
    await commitRecord(log, { event: started(), records: [record] });
    await rm(join(directory.path, 'run/run.json'));

    const read = await readCommitted(log, 'run/run.json', testRecordSchema);
    expect(read).toEqual({ kind: 'invalid', errors: ['the record file is missing'], path: 'run/run.json' });
  });

  test('every outcome of the union is produced by these cases', async () => {
    const log = await openCommitLog(directory.path);
    const kinds = new Set<string>();

    await commitRecord(log, { event: started(), records: [recordRef('run/run.json', 'run-0001', 1, { policy: 'scope-size/1' })] });
    kinds.add((await readCommitted(log, 'run/run.json', testRecordSchema)).kind);
    await writeByHand('run/run.json', `${JSON.stringify({ schema: 'ramify-agent.test-record/9' })}\n`);
    kinds.add((await readCommitted(log, 'run/run.json', testRecordSchema)).kind);
    await rm(join(directory.path, 'run/run.json'));
    kinds.add((await readCommitted(log, 'run/run.json', testRecordSchema)).kind);

    expect([...kinds].sort()).toEqual(['invalid', 'unsupported-version', 'valid']);
  });
});
