import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { LedgerCorruptError } from '../ledger.js';
import { record, testLedger, transaction } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const logOf = (): string => join(directory.path, 'events.jsonl');

/** Three complete lines, as the ledger itself wrote them. */
async function threeLines(): Promise<string[]> {
  const ledger = await testLedger(directory.path);
  await ledger.append(transaction(1, [record('run', 1, { a: 1 })]));
  await ledger.append(transaction(2, [record('run', 2, { a: 2 })]));
  await ledger.append(transaction(3, [record('run', 3, { a: 3 })]));
  const text = await readFile(logOf(), 'utf8');
  return text.split('\n').filter((line) => line.length > 0);
}

/** Replaces the log with these lines and reports what opening it does. */
async function reopen(lines: string[]): Promise<LedgerCorruptError> {
  await writeFile(logOf(), lines.map((line) => `${line}\n`).join(''));
  const before = await readFile(logOf(), 'utf8');
  try {
    await testLedger(directory.path);
  } catch (error) {
    // A refused log is never shortened: the bytes are exactly as they were.
    expect(await readFile(logOf(), 'utf8')).toBe(before);
    return error as LedgerCorruptError;
  }
  throw new Error('the log was accepted');
}

describe('a log that cannot be replayed', () => {
  test('an invalid line in the middle names its path, its line and the reason', async () => {
    const lines = await threeLines();
    lines[1] = 'not json';
    const error = await reopen(lines);
    expect(error).toBeInstanceOf(LedgerCorruptError);
    expect(error.path).toBe(logOf());
    expect(error.line).toBe(2);
    expect(error.reason).toBe('not a JSON value');
    expect(error.text).toBe('not json');
    expect(error.message).toBe(`${logOf()}:2: not a JSON value`);
  });

  test('a line that is JSON but not a transaction', async () => {
    const lines = await threeLines();
    lines[1] = JSON.stringify({ sequence: 2, at: '2026-09-20T00:00:00.000Z' });
    const error = await reopen(lines);
    expect(error.line).toBe(2);
    expect(error.reason).toMatch(/^not a transaction line: /);
    expect(error.reason).toMatch(/records/);
  });

  test('a gap in the sequence', async () => {
    const lines = await threeLines();
    lines.splice(1, 1);
    const error = await reopen(lines);
    expect(error.line).toBe(2);
    expect(error.reason).toBe('sequence 3 where 2 was expected');
  });

  test('a sequence out of order', async () => {
    const lines = await threeLines();
    [lines[0], lines[1]] = [lines[1]!, lines[0]!];
    const error = await reopen(lines);
    expect(error.line).toBe(1);
    expect(error.reason).toBe('sequence 2 where 1 was expected');
  });

  test('a line the event schema rejects', async () => {
    const lines = await threeLines();
    const parsed = JSON.parse(lines[2]!) as { event: unknown };
    lines[2] = JSON.stringify({ ...parsed, event: { kind: 'step', step: 'three' } });
    const error = await reopen(lines);
    expect(error.line).toBe(3);
    expect(error.reason).toMatch(/^the event does not match the schema: /);
    expect(error.reason).toMatch(/step/);
    expect(error.text).toBe(lines[2]);
  });

  test('a record path that escapes the records root', async () => {
    const lines = await threeLines();
    const parsed = JSON.parse(lines[1]!) as { records: { path: string }[] };
    parsed.records[0]!.path = '../outside.json';
    lines[1] = JSON.stringify(parsed);
    const error = await reopen(lines);
    expect(error.line).toBe(2);
    expect(error.reason).toMatch(/resolves outside the records root|leaves the records root/);
  });

  test('a bad line is never a shorter history: the log is refused, not truncated', async () => {
    const lines = await threeLines();
    lines[1] = '{"sequence":2,';
    const error = await reopen(lines);
    expect(error.line).toBe(2);
    // The third line is still there, so no history was lost to the failure.
    expect((await readFile(logOf(), 'utf8')).split('\n').filter((line) => line.length > 0)).toHaveLength(3);
  });

  test('a bad line is never an empty log: the failure is thrown, not swallowed', async () => {
    await writeFile(logOf(), 'garbage\n');
    await expect(testLedger(directory.path)).rejects.toThrow(LedgerCorruptError);
    expect(await readFile(logOf(), 'utf8')).toBe('garbage\n');
  });
});
