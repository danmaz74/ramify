import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { record, recordsMatchLog, testLedger, transaction } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const logOf = (): string => join(directory.path, 'events.jsonl');
const recordsOf = (): string => join(directory.path, 'records');

describe('a torn last line', () => {
  test('is truncated away at every byte offset, and the next append is valid', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1, [record('run', 1, { note: 'first' })]));
    await ledger.append(transaction(2, [record('run', 2, { note: 'second' })]));
    await ledger.append(transaction(3, [record('run', 3, { note: 'third, the one that is torn' })]));

    const whole = await readFile(logOf());
    const lastLineStart = whole.lastIndexOf(0x0a, whole.byteLength - 2) + 1;
    expect(lastLineStart).toBeGreaterThan(0);

    // Every offset that leaves part of the last line, and the one that leaves none of it.
    const offsets = Array.from({ length: whole.byteLength - lastLineStart }, (_unused, index) => lastLineStart + index);
    expect(offsets.length).toBeGreaterThan(80);

    for (const offset of offsets) {
      await writeFile(logOf(), whole.subarray(0, offset));

      const reopened = await testLedger(directory.path);
      expect(reopened.version).toBe(2);
      expect(reopened.replay()).toHaveLength(2);
      expect(reopened.replay().map((entry) => entry.transaction.event.step)).toEqual([1, 2]);

      // The torn bytes are gone: what is on disk is exactly the two complete lines.
      expect(await readFile(logOf())).toEqual(whole.subarray(0, lastLineStart));

      const committed = await reopened.append(transaction(3, [record('run', 3, { note: 'rewritten' })]));
      expect(committed.sequence).toBe(3);

      const again = await testLedger(directory.path);
      expect(again.version).toBe(3);
      expect(again.replay().map((entry) => entry.sequence)).toEqual([1, 2, 3]);
      await again.materialize();
      await recordsMatchLog(again, recordsOf());
    }

    // The count is reported, so the coverage this test claims is visible in its output.
    console.log(`torn-line: ${offsets.length} byte offsets covered across a ${whole.byteLength - lastLineStart}-byte last line`);
  }, 120_000);

  test('a last line that parses but has no newline is still torn', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1));
    await ledger.append(transaction(2));
    const whole = await readFile(logOf());
    await writeFile(logOf(), whole.subarray(0, whole.byteLength - 1));

    const reopened = await testLedger(directory.path);
    expect(reopened.version).toBe(1);
    expect(reopened.replay()).toHaveLength(1);
  });
});
