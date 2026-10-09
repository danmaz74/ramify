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

describe('exhaustive filesystem fault injection', () => {
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

});
