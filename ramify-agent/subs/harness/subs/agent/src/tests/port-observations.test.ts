import { describe, expect, test } from 'vitest';
import { contextBudgetReached } from '../interfaces/port.js';
import type { AgentPort, PortObservations } from '../interfaces/port.js';
import { createScriptedAgent } from '../scripted.js';
import { probeSpec, unbounded } from './helpers/spec.js';

/*
 * The guard this iteration owns: usage, context size and compaction are port
 * events, an implementation that lacks one reports it unavailable with a
 * reason, and the scripted fake emits all of them. An observation an adapter
 * drops must not read as an empty context.
 */

const window = 40_000;

describe('observations are port events', () => {
  test('the scripted fake emits usage, context size and compaction for a session', async () => {
    const agent = createScriptedAgent([
      { kind: 'message', text: 'starting', usage: { input: 1_000, output: 20, cacheRead: 200, cacheWrite: 300, total: 1_520 } },
      { kind: 'context', tokens: 1_520, window },
      { kind: 'compaction', reason: 'threshold', tokensBefore: 1_520, tokensAfter: 400 },
      { kind: 'context', tokens: null, window },
      { kind: 'submit', input: { done: true } },
    ]);
    const probe = probeSpec();
    expect(await agent.startSession(probe.spec).outcome).toEqual({ kind: 'submitted', input: { done: true } });

    const usage = probe.events.filter(event => event.type === 'message').map(event => event.usage);
    expect(usage).toEqual([{ input: 1_000, output: 20, cacheRead: 200, cacheWrite: 300, total: 1_520 }]);
    expect(probe.events.filter(event => event.type === 'context-observed')).toEqual([
      { type: 'context-observed', tokens: 1_520, window },
      { type: 'context-observed', tokens: null, window },
    ]);
    expect(probe.events.filter(event => event.type === 'compaction')).toEqual([
      { type: 'compaction', phase: 'started', reason: 'threshold' },
      {
        type: 'compaction', phase: 'ended', reason: 'threshold',
        tokensBefore: 1_520, tokensAfter: 400, aborted: undefined, errorText: undefined,
      },
    ]);
  });

  test('every implementation states what it observes, and the fake observes all three', () => {
    const agent = createScriptedAgent([]);
    expect(Object.keys(agent.observations).sort()).toEqual(['compaction', 'context', 'usage']);
    expect(agent.observations).toEqual({ usage: { available: true }, context: { available: true }, compaction: { available: true } });
  });

  test('an implementation that lacks an observation reports it unavailable with a reason', () => {
    // A port that cannot size the context says so, rather than emitting nothing
    // and letting the silence read as room.
    const observations: PortObservations = {
      usage: { available: true },
      context: { available: false, reason: 'The provider reports no context window for this model.' },
      compaction: { available: false, reason: 'This implementation never compacts.' },
    };
    const partial: Pick<AgentPort, 'name' | 'observations'> = { name: 'partial', observations };
    const missing = Object.entries(partial.observations)
      .filter(([, value]) => !value.available)
      .map(([name, value]) => [name, (value as { reason: string }).reason]);
    expect(missing).toEqual([
      ['context', 'The provider reports no context window for this model.'],
      ['compaction', 'This implementation never compacts.'],
    ]);
    for (const [, reason] of missing) expect(reason).not.toBe('');
  });

  test('an unknown context size is never room: the budget cannot fire on it', async () => {
    const policy = { compaction: 'allowed' as const, budgetTokens: null, budgetFraction: 0.5, reportReserveTokens: 1_000 };
    expect(contextBudgetReached(policy, null, window)).toBe(false);
    expect(contextBudgetReached(policy, 18_999, window)).toBe(false);
    expect(contextBudgetReached(policy, 19_000, window)).toBe(true);
    // And with no window reported, the absolute figure is the budget.
    expect(contextBudgetReached({ ...policy, budgetTokens: 5_000 }, 4_500, null)).toBe(true);
    expect(contextBudgetReached({ ...unbounded }, 10_000_000, window)).toBe(false);

    const agent = createScriptedAgent([
      { kind: 'context', tokens: null, window },
      { kind: 'message', text: 'still working' },
      { kind: 'submit', input: 'done' },
    ]);
    const probe = probeSpec({ context: policy });
    expect(await agent.startSession(probe.spec).outcome).toEqual({ kind: 'submitted', input: 'done' });
  });

  test('a forbidden role compacts not at all, and the suppression is counted', async () => {
    const agent = createScriptedAgent([
      { kind: 'compaction', reason: 'threshold', tokensBefore: 9_000, tokensAfter: 800 },
      { kind: 'context', tokens: 9_000, window },
      { kind: 'end', message: 'done' },
    ]);
    const probe = probeSpec({ context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 } });
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.filter(event => event.type === 'compaction')).toEqual([]);
    expect(agent.sessions[0]!.suppressedCompactions).toBe(1);
    // The context is still observed: the policy governs compaction, not observation.
    expect(probe.events.filter(event => event.type === 'context-observed')).toHaveLength(1);
  });

  test('the policy is never prompt text', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const probe = probeSpec({ context: { compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 16_000 } });
    await agent.startSession(probe.spec).outcome;
    const sent = `${probe.spec.systemPrompt}\n${probe.spec.prompt}`;
    for (const term of ['compact', 'budget', 'token', 'context window', 'reserve']) {
      expect(sent.toLowerCase()).not.toContain(term);
    }
  });
});
