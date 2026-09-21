import { readdir, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { record, recordsMatchLog, testLedger, transaction } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const recordsOf = (): string => join(directory.path, 'records');

/** A log of three transactions, two of which revise the same record. */
async function populated(): Promise<Awaited<ReturnType<typeof testLedger>>> {
  const ledger = await testLedger(directory.path);
  await ledger.append(transaction(1, [record('run', 1, { status: 'started' })]));
  await ledger.append(transaction(2, [record('plan', 1, { title: 'a plan' })]));
  await ledger.append(transaction(3, [record('run', 2, { status: 'working' })]));
  return ledger;
}

describe('materialize', () => {
  test('rewrites a record file that was deleted', async () => {
    const ledger = await populated();
    await rm(join(recordsOf(), 'run', '02.json'));
    expect((await ledger.materialize()).rewritten).toEqual(['run/02.json']);
    await recordsMatchLog(ledger, recordsOf());
  });

  test('rewrites a record file that was truncated', async () => {
    const ledger = await populated();
    await truncate(join(recordsOf(), 'plan', '01.json'), 3);
    expect((await ledger.materialize()).rewritten).toEqual(['plan/01.json']);
    await recordsMatchLog(ledger, recordsOf());
  });

  test('rewrites a record file that was edited by hand', async () => {
    const ledger = await populated();
    await writeFile(join(recordsOf(), 'run', '01.json'), '{\n  "status": "edited"\n}\n');
    expect((await ledger.materialize()).rewritten).toEqual(['run/01.json']);
    expect(JSON.parse(await readFile(join(recordsOf(), 'run', '01.json'), 'utf8'))).toEqual({ status: 'started' });
  });

  test('is idempotent: a second run rewrites nothing', async () => {
    const ledger = await populated();
    await rm(join(recordsOf(), 'run', '01.json'));
    await rm(join(recordsOf(), 'plan', '01.json'));
    expect((await ledger.materialize()).rewritten).toEqual(['run/01.json', 'plan/01.json']);
    expect((await ledger.materialize()).rewritten).toEqual([]);
    expect((await ledger.materialize()).rewritten).toEqual([]);
  });

  test('rewrites nothing after an ordinary append, which already materialized', async () => {
    const ledger = await populated();
    expect((await ledger.materialize()).rewritten).toEqual([]);
  });

  test('a reopened ledger materializes the whole log from nothing', async () => {
    await populated();
    await rm(recordsOf(), { recursive: true, force: true });

    const reopened = await testLedger(directory.path);
    expect((await reopened.materialize()).rewritten).toEqual(['run/01.json', 'plan/01.json', 'run/02.json']);
    expect(await recordsMatchLog(reopened, recordsOf())).toBe(3);
    expect((await reopened.materialize()).rewritten).toEqual([]);
  });

  test('touches only paths the log names, and removes none it did not write', async () => {
    const ledger = await populated();
    await writeFile(join(recordsOf(), 'a-note-someone-left.txt'), 'kept');
    await rm(join(recordsOf(), 'run', '01.json'));
    expect((await ledger.materialize()).rewritten).toEqual(['run/01.json']);
    expect((await readdir(recordsOf())).sort()).toEqual(['a-note-someone-left.txt', 'plan', 'run']);
    expect(await readFile(join(recordsOf(), 'a-note-someone-left.txt'), 'utf8')).toBe('kept');
  });

  test('a record revised twice at one path holds the last body', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1, [{ path: 'run/item.json', id: 'run', revision: 1, body: { n: 1 } }]));
    await ledger.append(transaction(2, [{ path: 'run/item.json', id: 'run', revision: 2, body: { n: 2 } }]));
    await rm(join(recordsOf(), 'run', 'item.json'));
    expect((await ledger.materialize()).rewritten).toEqual(['run/item.json']);
    expect(JSON.parse(await readFile(join(recordsOf(), 'run', 'item.json'), 'utf8'))).toEqual({ n: 2 });
  });
});
