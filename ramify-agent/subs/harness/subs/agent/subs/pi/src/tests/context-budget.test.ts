import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { ContextPolicy, ToolDefinition } from '../../../../src/interfaces/port.js';
import { startPi, validMap, workspace } from './helpers/session.js';
import { call, text } from './helpers/scripted-provider.js';

/*
 * Context observation and the context budget through the real pi adapter. An
 * observation follows every model and tool boundary; the size is always an
 * estimate; `null` is unknown and never room; and a session driven past its
 * budget loses its tools, gives one final response and ends
 * `context-budget-reached`.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const window = 10_000;
const piCompaction = { reserveTokens: 2_000, keepRecentTokens: 500 };

/** Reached at 5,000 tokens of a 10,000-token window, leaving 1,000 for the report. */
const budgeted: ContextPolicy = { compaction: 'forbidden', budgetTokens: null, budgetFraction: 0.6, reportReserveTokens: 1_000 };

const unbudgeted: ContextPolicy = { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };

const tester: ToolDefinition = {
  name: 'run_scope_tests', description: 'Runs the scoped tests',
  inputSchema: { type: 'object', properties: { suite: { type: 'string' } }, required: ['suite'], additionalProperties: false },
  execute: async () => ({ text: 'the scoped tests passed' }),
};

describe('context observation', () => {
  test('an observation follows every model and tool boundary, with the model\'s window', async () => {
    const harness = await startPi(cleanups, [
      call('run_scope_tests', { suite: 'unit' }, 'c-1'),
      call('submit_implementation_map', validMap, 'c-2'),
    ], { context: unbudgeted, contextWindow: window, tools: [tester] });
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });

    const shape = harness.events.map(event => (event.type === 'message' ? `message:${event.role}` : event.type));
    // Every assistant message and every finished tool call is followed by an observation.
    for (const [index, type] of shape.entries()) {
      if (type === 'message:assistant' || type === 'tool-finished') expect(shape[index + 1]).toBe('context-observed');
    }
    const observed = harness.events.filter(event => event.type === 'context-observed');
    expect(observed.length).toBeGreaterThanOrEqual(4);
    for (const event of observed) expect(event.window).toBe(window);
    expect(observed.every(event => event.tokens === null || typeof event.tokens === 'number')).toBe(true);
  });

  test('the size is unknown, and never room, between a compaction and the next assistant reply', async () => {
    const places = await workspace(cleanups);
    const allowed: ContextPolicy = { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };
    const replies = [
      text('I have looked around.', { input: 9_500, output: 20 }),
      text('a summary of the conversation so far'),
      text('a reply after the compaction', { input: 800, output: 20 }),
    ];
    const long = `Turn. ${'context '.repeat(400)}`;
    const first = await startPi(cleanups, replies, { reuse: places, context: allowed, contextWindow: window, compaction: piCompaction, prompt: long });
    await first.session.outcome;
    const second = await startPi(cleanups, replies, { reuse: places, context: allowed, contextWindow: window, compaction: piCompaction, prompt: long, session: { mode: 'continue', ref: first.session.ref } });
    await second.session.outcome;
    const third = await startPi(cleanups, replies, { reuse: places, context: allowed, contextWindow: window, compaction: piCompaction, prompt: long, session: { mode: 'continue', ref: second.session.ref } });
    await third.session.outcome;

    // After the compaction the session reports no size at all; the window is still known.
    const unknown = third.events.filter(event => event.type === 'context-observed').filter(event => event.tokens === null);
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown[0]!.window).toBe(window);
  }, 30_000);
});

describe('the context budget', () => {
  test('a session driven past its budget ends context-budget-reached with one final response', async () => {
    const harness = await startPi(cleanups, [
      // The first reply's usage alone crosses the budget.
      call('run_scope_tests', { suite: 'unit' }, 'c-1', { input: 5_000, output: 40 }),
      text('Partial report: the tests pass; the guard rules are not written yet.'),
      text('this reply is never requested'),
    ], { context: budgeted, contextWindow: window, compaction: piCompaction, tools: [tester] });

    const outcome = await harness.session.outcome;
    expect(outcome.kind).toBe('context-budget-reached');
    expect(outcome.kind === 'context-budget-reached' && outcome.tokens).toBe(5_040);
    expect(outcome.kind === 'context-budget-reached' && outcome.report)
      .toBe('Partial report: the tests pass; the guard rules are not written yet.');

    // The final response was asked for with no tools offered.
    expect(harness.toolNames(0)).toContain('run_scope_tests');
    expect(harness.toolNames(1)).toEqual([]);
    expect(harness.scripted.requests).toHaveLength(2);
    // A forbidden role reached its budget without compacting.
    expect(harness.events.filter(event => event.type === 'compaction')).toEqual([]);
    // Nothing was submitted, so a budget return is never a completion.
    expect(harness.judged).toEqual([]);
  }, 20_000);

  test('a session under its budget ends as it otherwise would', async () => {
    const harness = await startPi(cleanups, [
      call('run_scope_tests', { suite: 'unit' }, 'c-1', { input: 1_000, output: 20 }),
      call('submit_implementation_map', validMap, 'c-2'),
    ], { context: budgeted, contextWindow: window, compaction: piCompaction, tools: [tester] });
    await expect(harness.session.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
    expect(harness.toolNames(1)).toContain('run_scope_tests');
  }, 20_000);

  test('an accepted submission is the outcome even when the budget was reached in the same turn', async () => {
    const harness = await startPi(cleanups, [
      call('submit_implementation_map', validMap, 'c-1', { input: 6_000, output: 40 }),
      text('nothing more'),
    ], { context: budgeted, contextWindow: window, compaction: piCompaction, tools: [tester] });
    await expect(harness.session.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
  }, 20_000);
});
