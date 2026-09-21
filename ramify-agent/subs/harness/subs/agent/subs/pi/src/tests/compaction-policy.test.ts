import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { AgentEvent, ContextPolicy } from '../../../../src/interfaces/port.js';
import { startPi, workspace, type PiHarness } from './helpers/session.js';
import { text } from './helpers/scripted-provider.js';

/*
 * The guard this iteration owns on the pi side: compaction is port policy,
 * never prompt text. Two sessions over the same files cross pi's own
 * threshold; the second compacts when the policy allows it and does not when
 * the policy forbids it. Neither policy says anything to the agent.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const window = 10_000;
/** pi's own thresholds for this window: it compacts above `window - reserveTokens`. */
const piCompaction = { reserveTokens: 2_000, keepRecentTokens: 500 };

const allowed: ContextPolicy = { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };
const forbidden: ContextPolicy = { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };

/** A turn long enough that a later compaction has something to summarize. */
const turn = (number: number): string => `Turn ${number}. ${'context '.repeat(400)}`;

/**
 * Two sessions over the same files under one policy. The first turn reports
 * usage past pi's threshold; the second session is where pi would compact.
 */
async function twoTurns(context: ContextPolicy): Promise<PiHarness> {
  const places = await workspace(cleanups);
  const replies = [
    text('I have looked around.', { input: 9_500, output: 20 }),
    text('a summary of the conversation so far'),
    text('a reply after the compaction', { input: 800, output: 20 }),
  ];
  const first = await startPi(cleanups, replies, { reuse: places, context, contextWindow: window, compaction: piCompaction, prompt: turn(1) });
  await first.session.outcome;
  const second = await startPi(cleanups, replies, {
    reuse: places, context, contextWindow: window, compaction: piCompaction, prompt: turn(2),
    session: { mode: 'continue', ref: first.session.ref },
  });
  await second.session.outcome;
  return second;
}

const compactions = (events: readonly AgentEvent[]) => events.filter(event => event.type === 'compaction');

describe('compaction is port policy', () => {
  test('a role whose policy allows it compacts, and the compaction is observed', async () => {
    const session = await twoTurns(allowed);
    const events = compactions(session.events);
    expect(events.map(event => [event.phase, event.reason])).toEqual([['started', 'threshold'], ['ended', 'threshold']]);
    const ended = events[1]!;
    expect(ended.aborted).toBe(false);
    expect(ended.errorText).toBeUndefined();
    // The sizes come from the event: the session reports none between a
    // compaction and the next assistant reply.
    expect(typeof ended.tokensBefore).toBe('number');
    expect(typeof ended.tokensAfter).toBe('number');
    expect(ended.tokensAfter!).toBeLessThan(ended.tokensBefore!);
  }, 30_000);

  test('a role whose policy forbids it passes the same threshold without compacting', async () => {
    const session = await twoTurns(forbidden);
    expect(compactions(session.events)).toEqual([]);
    // The threshold really was crossed: the context is observed past it.
    const observed = session.events.filter(event => event.type === 'context-observed').map(event => event.tokens);
    expect(observed.some(tokens => tokens !== null && tokens > window - piCompaction.reserveTokens)).toBe(true);
    // And the model was never asked for a summary.
    expect(session.scripted.requests).toHaveLength(1);
  }, 30_000);

  test('neither policy says anything to the agent', async () => {
    for (const context of [allowed, forbidden]) {
      const session = await startPi(cleanups, [text('done')], {
        context: { ...context, budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 16_000 },
        contextWindow: window,
        compaction: piCompaction,
        systemPrompt: 'You are the engineer. Exactly this prompt.',
      });
      await session.session.outcome;
      const request = session.scripted.requests[0]!;
      // The system prompt is the spec's, exactly; the adapter adds nothing.
      expect(request.systemPrompt).toBe('You are the engineer. Exactly this prompt.');
      const sent = `${request.systemPrompt ?? ''}\n${session.requestText(0)}`.toLowerCase();
      for (const term of ['compact', 'budget', 'context window', 'reserve', 'token']) {
        expect(sent).not.toContain(term);
      }
    }
  }, 30_000);
});
