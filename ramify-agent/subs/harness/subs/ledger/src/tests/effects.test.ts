import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { record, recordsMatchLog, testLedger, transaction } from './helpers/ledger.js';
import { temporaryDirectory } from './helpers/temporary.js';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
beforeEach(async () => { directory = await temporaryDirectory(); });
afterEach(async () => { await directory.remove(); });

const logOf = (): string => join(directory.path, 'events.jsonl');
const recordsOf = (): string => join(directory.path, 'records');

/** The effect marks in the log, in order, as evidence of what was appended. */
async function marks(): Promise<Array<{ key: string; phase: string }>> {
  const text = await readFile(logOf(), 'utf8');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as { effect?: { key: string; phase: string } }).effect)
    .filter((mark): mark is { key: string; phase: string } => mark !== undefined)
    .map((mark) => ({ key: mark.key, phase: mark.phase }));
}

describe('an external effect', () => {
  test('appends the intent, performs under the key, and appends the completion', async () => {
    const ledger = await testLedger(directory.path);
    const keys: string[] = [];
    const result = await ledger.effect({
      key: 'brief-append-1',
      intent: transaction(1, [record('intent', 1, { what: 'append the brief' })]),
      perform: async (key) => { keys.push(key); return { appended: key }; },
      complete: (value) => transaction(2, [record('completion', 1, value)]),
    });

    expect(result).toEqual({ appended: 'brief-append-1' });
    expect(keys).toEqual(['brief-append-1']);
    expect(await marks()).toEqual([
      { key: 'brief-append-1', phase: 'intent' },
      { key: 'brief-append-1', phase: 'completion' },
    ]);
    expect(ledger.version).toBe(2);
    expect(ledger.pendingEffects()).toEqual([]);
    expect(await recordsMatchLog(ledger, recordsOf())).toBe(2);
  });

  test('an effect that fails leaves its intent pending, and the failure reaches the caller', async () => {
    const ledger = await testLedger(directory.path);
    await expect(
      ledger.effect({
        key: 'start-invocation-7',
        intent: transaction(1, [record('intent', 1, { what: 'start inv-0007' })]),
        perform: async () => { throw new Error('the agent process died'); },
        complete: () => transaction(2),
      }),
    ).rejects.toThrow('the agent process died');

    expect(await marks()).toEqual([{ key: 'start-invocation-7', phase: 'intent' }]);
    expect(ledger.pendingEffects()).toEqual([
      { key: 'start-invocation-7', sequence: 1, at: ledger.replay()[0]!.at, event: { kind: 'step', step: 1 } },
    ]);
  });

  test('a crash between intent and completion: the intent is pending on load, and performing it again leaves one of each', async () => {
    const crashed = await testLedger(directory.path);
    await crashed
      .effect({
        key: 'release-writer-3',
        intent: transaction(1, [record('intent', 1, { what: 'release the writer' })]),
        perform: async () => { throw new Error('killed before the completion'); },
        complete: () => transaction(2),
      })
      .catch(() => undefined);

    // The crash: a fresh ledger on the same log.
    const reopened = await testLedger(directory.path);
    const pending = reopened.pendingEffects();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.key).toBe('release-writer-3');
    expect(pending[0]!.event).toEqual({ kind: 'step', step: 1 });

    let performed = 0;
    const result = await reopened.effect({
      key: pending[0]!.key,
      intent: transaction(1, [record('intent', 1, { what: 'release the writer' })]),
      perform: async (key) => { performed += 1; return `released:${key}`; },
      complete: (value) => transaction(2, [record('completion', 1, { value })]),
    });

    expect(result).toBe('released:release-writer-3');
    expect(performed).toBe(1);
    expect(await marks()).toEqual([
      { key: 'release-writer-3', phase: 'intent' },
      { key: 'release-writer-3', phase: 'completion' },
    ]);
    expect(reopened.pendingEffects()).toEqual([]);
    expect(reopened.version).toBe(2);
  });

  test('a completed effect is never performed again; its recorded result is returned', async () => {
    const ledger = await testLedger(directory.path);
    let performed = 0;
    const spec = {
      key: 'accepted-commit-4',
      intent: transaction(1),
      perform: async () => { performed += 1; return 'abc1234'; },
      complete: (value: string) => transaction(2, [record('commit', 1, { sha: value })]),
    };
    expect(await ledger.effect(spec)).toBe('abc1234');
    expect(await ledger.effect(spec)).toBe('abc1234');

    const reopened = await testLedger(directory.path);
    expect(await reopened.effect(spec)).toBe('abc1234');
    expect(performed).toBe(1);
    expect(await marks()).toEqual([
      { key: 'accepted-commit-4', phase: 'intent' },
      { key: 'accepted-commit-4', phase: 'completion' },
    ]);
  });

  test('several effects are pending independently, in the order their intents were appended', async () => {
    const ledger = await testLedger(directory.path);
    for (const key of ['one', 'two', 'three']) {
      await ledger
        .effect({ key, intent: transaction(1), perform: async () => { throw new Error('no'); }, complete: () => transaction(2) })
        .catch(() => undefined);
    }
    await ledger.effect({ key: 'two', intent: transaction(1), perform: async () => 2, complete: () => transaction(2) });

    expect(ledger.pendingEffects().map((one) => one.key)).toEqual(['one', 'three']);
  });

  test('a result with no JSON representation is refused', async () => {
    const ledger = await testLedger(directory.path);
    await expect(
      ledger.effect({
        key: 'undrawable',
        intent: transaction(1),
        perform: async () => (() => undefined) as unknown as string,
        complete: () => transaction(2),
      }),
    ).rejects.toThrow(TypeError);
  });

  test('a caller serialization is held for the intent and the completion, and released while the effect performs', async () => {
    const ledger = await testLedger(directory.path);
    let tail: Promise<unknown> = Promise.resolve();
    const serialize = <T>(work: () => Promise<T>): Promise<T> => {
      const result = tail.then(work);
      tail = result.catch(() => undefined);
      return result;
    };
    let release!: () => void;
    const performing = new Promise<void>(resolve => { release = resolve; });
    let performed!: () => void;
    const reached = new Promise<void>(resolve => { performed = resolve; });
    const effect = ledger.effect({
      key: 'slow-audit',
      intent: () => transaction(ledger.version + 1),
      perform: async () => { performed(); await performing; return 'audited'; },
      complete: () => transaction(ledger.version + 1),
      serialize,
    });
    await reached;
    // Another writer under the same serialization is not held up by the effect.
    await serialize(() => ledger.append(transaction(ledger.version + 1)));
    expect(ledger.version).toBe(2);
    release();
    expect(await effect).toBe('audited');
    expect(await marks()).toEqual([{ key: 'slow-audit', phase: 'intent' }, { key: 'slow-audit', phase: 'completion' }]);
    expect(ledger.version).toBe(3);
  });

  test('an ordinary append carries no effect mark', async () => {
    const ledger = await testLedger(directory.path);
    await ledger.append(transaction(1));
    expect(await marks()).toEqual([]);
    expect(ledger.pendingEffects()).toEqual([]);
  });
});
