import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { LedgerCorruptError, maximumLineBytes } from '../ledger.js';
import { record, recordsMatchLog, testLedger, transaction } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const logOf = (): string => join(directory.path, 'events.jsonl');
const recordsOf = (): string => join(directory.path, 'records');

describe('one line is one transaction', () => {
  test('an empty log is version 0 and replays nothing', async () => {
    const ledger = await testLedger(directory.path);
    expect(ledger.version).toBe(0);
    expect(ledger.replay()).toEqual([]);
    expect(ledger.pendingEffects()).toEqual([]);
  });

  test('an append writes one line holding the event and every record body', async () => {
    const ledger = await testLedger(directory.path);
    const committed = await ledger.append(transaction(1, [record('run', 1, { a: 1 }), record('plan', 1, { b: 2 })]));
    expect(committed.sequence).toBe(1);
    expect(Date.parse(committed.at)).not.toBeNaN();

    const lines = (await readFile(logOf(), 'utf8')).split('\n').filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as { sequence: number; at: string; event: unknown; records: unknown[] };
    expect(parsed.sequence).toBe(1);
    expect(parsed.at).toBe(committed.at);
    expect(parsed.event).toEqual({ kind: 'step', step: 1 });
    expect(parsed.records).toHaveLength(2);
  });

  test('the sequence is one more than the last, across a reopen', async () => {
    const first = await testLedger(directory.path);
    await first.append(transaction(1));
    await first.append(transaction(2));
    expect(first.version).toBe(2);

    const second = await testLedger(directory.path);
    expect(second.version).toBe(2);
    expect((await second.append(transaction(3))).sequence).toBe(3);
    expect(second.replay().map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect(second.replay().map((entry) => entry.transaction.event.step)).toEqual([1, 2, 3]);
  });

  test('an appended record is materialized at once', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1, [record('run', 1, { status: 'started' })]));
    expect(await readFile(join(recordsOf(), 'run', '01.json'), 'utf8')).toBe(`${JSON.stringify({ status: 'started' }, null, 2)}\n`);
    expect(await recordsMatchLog(ledger, recordsOf())).toBe(1);
  });

  test('concurrent appends are serialized, and the sequences are dense and ordered', async () => {
    const ledger = await testLedger(directory.path);
    const committed = await Promise.all(
      Array.from({ length: 20 }, (_unused, index) => ledger.append(transaction(index + 1, [record(`r${index}`, 1, { index })]))),
    );
    expect(committed.map((one) => one.sequence)).toEqual(Array.from({ length: 20 }, (_unused, index) => index + 1));

    const reopened = await testLedger(directory.path);
    expect(reopened.version).toBe(20);
    expect(reopened.replay().map((entry) => entry.sequence)).toEqual(Array.from({ length: 20 }, (_unused, index) => index + 1));
    expect(reopened.replay().map((entry) => entry.transaction.event.step)).toEqual(
      Array.from({ length: 20 }, (_unused, index) => index + 1),
    );
    expect(await recordsMatchLog(reopened, recordsOf())).toBe(20);
  });
});

describe('what an append refuses before writing anything', () => {
  test('a line over the size bound; the log is unchanged', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1, [record('run', 1, { a: 1 })]));
    const before = await readFile(logOf(), 'utf8');

    const oversized = 'x'.repeat(maximumLineBytes + 1024);
    await expect(ledger.append(transaction(2, [record('big', 1, { oversized })]))).rejects.toThrow(RangeError);
    await expect(ledger.append(transaction(2, [record('big', 1, { oversized })]))).rejects.toThrow(/over the 8388608-byte line bound/);

    expect(await readFile(logOf(), 'utf8')).toBe(before);
    expect(ledger.version).toBe(1);
    expect((await ledger.append(transaction(2))).sequence).toBe(2);
  });

  test.each([
    ['a parent escape', '../outside.json'],
    ['a deep escape', 'run/../../outside.json'],
    ['an absolute path', '/etc/passwd'],
    ['the records root itself', '.'],
    ['a directory', 'run/'],
  ])('a record path that escapes the records root: %s', async (_name, path) => {
    const ledger = await testLedger(directory.path);
    await expect(ledger.append({ event: { kind: 'step', step: 1 }, records: [{ path, id: 'x', revision: 1, body: {} }] })).rejects.toThrow(
      TypeError,
    );
    expect(ledger.version).toBe(0);
    expect(await readFile(logOf(), 'utf8').catch(() => '')).toBe('');
  });
});

describe('a second writer on one log', () => {
  test('a sequence this ledger did not write fails its next append', async () => {
    const first = await testLedger(directory.path);
    await first.append(transaction(1));

    const second = await testLedger(directory.path);
    await second.append(transaction(2));

    await expect(first.append(transaction(3))).rejects.toThrow(LedgerCorruptError);
    await expect(first.append(transaction(3))).rejects.toThrow(/another writer appended to it/);
  });
});

describe('replay', () => {
  test('is pure and idempotent: the same entries, and no writes', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1, [record('run', 1, { a: 1 })]));
    const before = await readFile(logOf(), 'utf8');
    expect(ledger.replay()).toEqual(ledger.replay());
    expect(await readFile(logOf(), 'utf8')).toBe(before);
  });
});
