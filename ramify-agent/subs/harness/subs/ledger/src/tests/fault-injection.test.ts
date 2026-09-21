import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { InjectedFault, record, recordsMatchLog, testLedger, transaction, instrument, type FaultPoint } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const recordsOf = (): string => join(directory.path, 'records');
const logOf = (): string => join(directory.path, 'events.jsonl');

/** The transaction every run of this test interrupts. */
const interrupted = (): ReturnType<typeof transaction> =>
  transaction(3, [record('run', 3, { note: 'the interrupted one' }), record('plan', 1, { note: 'committed with it' })]);

/** Two transactions already in the log, as the state a crash interrupts. */
async function priorState(): Promise<void> {
  const ledger = await testLedger(directory.path);
  await ledger.append(transaction(1, [record('run', 1, { note: 'first' })]));
  await ledger.append(transaction(2, [record('run', 2, { note: 'second' })]));
}

describe('a fault at every file system operation of one append', () => {
  test('leaves the whole transaction or none of it, and materialize repairs every record file', async () => {
    // 1. Count the fault points by running the append with nothing failing.
    await priorState();
    const points: FaultPoint[] = [];
    const counting = instrument((point) => { points.push(point); });
    const observed = await testLedger(directory.path, counting);
    await observed.append(interrupted());
    const total = points.length;
    expect(total).toBeGreaterThan(5);
    const named = points.map((point) => point.replace(directory.path, '').replace(/\.[0-9]+\.[0-9a-f]+\.tmp$/, '.tmp'));
    console.log(`fault-injection: ${total} fault points in one append: ${named.join(', ')}`);

    await directory.remove();

    // 2. Fail each one in turn, from the same prior state.
    for (let target = 1; target <= total; target += 1) {
      directory = await temporaryDirectory();
      await priorState();

      const faulting = instrument((point, index) => {
        if (index === target) throw new InjectedFault(point, index);
      });
      const ledger = await testLedger(directory.path, faulting);
      let threw: unknown = null;
      try {
        await ledger.append(interrupted());
      } catch (error) {
        threw = error;
      }
      if (threw !== null) expect(threw).toBeInstanceOf(InjectedFault);

      // The crash: everything is read back through a fresh ledger on the real file system.
      const reopened = await testLedger(directory.path);
      const history = reopened.replay();
      expect(history.length === 2 || history.length === 3).toBe(true);
      expect(history.map((entry) => entry.sequence)).toEqual(Array.from({ length: history.length }, (_u, i) => i + 1));
      if (history.length === 3) {
        expect(history[2]!.transaction.event).toEqual({ kind: 'step', step: 3 });
        expect(history[2]!.transaction.records.map((body) => body.path)).toEqual(['run/03.json', 'plan/01.json']);
      }

      await reopened.materialize();
      await recordsMatchLog(reopened, recordsOf());

      // And the ledger goes on from there.
      const next = await reopened.append(transaction(9));
      expect(next.sequence).toBe(history.length + 1);

      await directory.remove();
    }

    directory = await temporaryDirectory();
  }, 120_000);

  test('a fault while a record file is written is not a failed transaction', async () => {
    await priorState();
    const faulting = instrument((point, index) => {
      // The log's own write and flush are operations 1 and 2; the first record file's write is the next.
      if (index === 3) throw new InjectedFault(point, index);
    });
    const ledger = await testLedger(directory.path, faulting);
    const committed = await ledger.append(interrupted());
    expect(committed.sequence).toBe(3);

    // The line is in the log, the record file is not yet there, and materialize repairs it.
    const reopened = await testLedger(directory.path);
    expect(reopened.version).toBe(3);
    await expect(readFile(join(recordsOf(), 'run', '03.json'), 'utf8')).rejects.toThrow(/ENOENT/);
    const repaired = await reopened.materialize();
    expect(repaired.rewritten).toContain('run/03.json');
    await recordsMatchLog(reopened, recordsOf());
  });

  test('a fault at the log write leaves no trace of the transaction', async () => {
    await priorState();
    const before = await readFile(logOf(), 'utf8');
    const faulting = instrument((point, index) => {
      if (index === 1) throw new InjectedFault(point, index);
    });
    const ledger = await testLedger(directory.path, faulting);
    await expect(ledger.append(interrupted())).rejects.toThrow(InjectedFault);
    expect(await readFile(logOf(), 'utf8')).toBe(before);

    const reopened = await testLedger(directory.path);
    expect(reopened.version).toBe(2);
    await expect(readFile(join(recordsOf(), 'plan', '01.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });
});
