import { afterEach, beforeAll, expect, test } from 'vitest';
import { nativeText, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
test('a session under its budget settles normally with observed context', async () => {
  const f = await preservingPi(cleanups, [[nativeText('Done')]]); const result = await (await f.operations.continue(f.input())).settled();
  expect(result.outcome?.kind).toBe('ended'); expect(f.events.some(event => event.type === 'context-observed')).toBe(true); f.native.verify();
});
test('a hard context limit returns explicit unfinished failure without a synthetic final report or another request', async () => {
  const policy = { context: { compaction: 'forbidden' as const, budgetTokens: 1, budgetFraction: null, reportReserveTokens: 0 }, authority: {}, validator: {}, destination: {} };
  const f = await preservingPi(cleanups, [[nativeText('Ordinary text is not an accepted return')]], { policy }); const result = await (await f.operations.continue(f.input())).settled();
  expect(result.outcome).toMatchObject({ kind: 'context-budget-reached' }); expect(result.outcome).not.toHaveProperty('report'); expect(f.judged).toEqual([]); expect(f.native.dispatches()).toBe(1); f.native.verify();
});
