import { describe, expect, test } from 'vitest';
import { assistantText, noMessageDetail } from '../interfaces/port.js';
import type { AgentEvent, MessageDetail, MessageEvent } from '../interfaces/port.js';
import { createScriptedAgent } from '../scripted.js';
import { probeSpec } from './helpers/spec.js';

/*
 * ST06 on the scripted fake: it reports the required core of every session,
 * the prompt, each assistant message with its tool calls and each tool
 * result, and the optional detail its script chooses. What a script leaves
 * out is reported absent, as null, and never as zero.
 */

const messages = (events: readonly AgentEvent[]): MessageEvent[] => events.filter((event): event is MessageEvent => event.type === 'message');

const detail: MessageDetail = {
  model: 'scripted/thinker-2', thinkingLevel: 'high', stopReason: 'end', error: null, reasoningTokens: 40,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0.005, total: 0.035 }, cacheWrites: { short: 100, long: 50 },
};

describe('the fake reports every message', () => {
  test('the prompt first, then each call as an assistant message and its result by call ID', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'read', input: { path: 'module.ramify' } },
      { kind: 'tool', tool: 'echo', input: { word: 'hi' } },
      { kind: 'submit', input: { done: true } },
    ]);
    const probe = probeSpec();
    await expect(agent.startSession(probe.spec).outcome).resolves.toEqual({ kind: 'submitted', input: { done: true } });

    expect(probe.events[0]).toEqual({ type: 'message', role: 'user', blocks: [{ type: 'text', text: 'do the work' }] });
    const all = messages(probe.events);
    const calls = all.flatMap(event => (event.role === 'assistant' ? event.blocks.filter(block => block.type === 'tool-call') : []));
    expect(calls).toEqual([
      { type: 'tool-call', callId: 'call-1', tool: 'read', input: { path: 'module.ramify' }, action: { kind: 'read', path: 'module.ramify', range: null } },
      { type: 'tool-call', callId: 'call-2', tool: 'echo', input: { word: 'hi' }, action: { kind: 'harness' } },
      { type: 'tool-call', callId: 'call-3', tool: 'submit', input: { done: true }, action: { kind: 'harness' } },
    ]);
    const results = all.flatMap(event => (event.role === 'tool-result' ? [event] : []));
    expect(results.map(event => [event.callId, event.tool, event.isError, event.blocks])).toEqual([
      ['call-1', 'read', false, []],
      ['call-2', 'echo', false, [{ type: 'text', text: '{"word":"hi"}' }]],
      ['call-3', 'submit', false, [{ type: 'text', text: 'The submission was accepted.' }]],
    ]);
    // A call's assistant message precedes its start, and its result follows its end.
    for (const { callId } of results) {
      const at = (predicate: (event: AgentEvent) => boolean) => probe.events.findIndex(predicate);
      const made = at(event => event.type === 'message' && event.role === 'assistant' && event.blocks.some(block => block.type === 'tool-call' && block.callId === callId));
      const started = at(event => event.type === 'tool-started' && event.callId === callId);
      const finished = at(event => event.type === 'tool-finished' && event.callId === callId);
      const result = at(event => event.type === 'message' && event.role === 'tool-result' && event.callId === callId);
      expect([made < started, started < finished, finished < result]).toEqual([true, true, true]);
    }
    // A call's own message reports no detail, and no usage.
    const first = all.find(event => event.role === 'assistant');
    expect(first).toMatchObject({ text: '(calls read)', usage: null, detail: noMessageDetail });
  });

  test('optional detail a script supplies is reported, and what it leaves out is null', async () => {
    const agent = createScriptedAgent([
      {
        kind: 'message', text: 'Thought it through.', usage: { input: 900, output: 60, cacheRead: 0, cacheWrite: 150, total: 1_110 },
        blocks: [
          { type: 'thinking', visibility: 'full', text: 'First the module, then the map.' },
          { type: 'thinking', visibility: 'redacted', text: '' },
        ],
        detail,
      },
      { kind: 'message', text: 'Partly reported.', detail: { model: 'scripted/plain-1', reasoningTokens: 0 } },
      { kind: 'message', text: 'Nothing reported.' },
      { kind: 'end' },
    ]);
    const probe = probeSpec();
    await agent.startSession(probe.spec).outcome;
    const assistant = messages(probe.events).flatMap(event => (event.role === 'assistant' ? [event] : []));

    expect(assistant[0]).toEqual({
      type: 'message', role: 'assistant',
      blocks: [
        { type: 'thinking', visibility: 'full', text: 'First the module, then the map.' },
        { type: 'thinking', visibility: 'redacted', text: '' },
        { type: 'text', text: 'Thought it through.' },
      ],
      text: 'Thought it through.',
      usage: { input: 900, output: 60, cacheRead: 0, cacheWrite: 150, total: 1_110 },
      detail,
    });
    // Zero reasoning tokens is reported as zero; what is left out is null.
    expect(assistant[1]!.detail).toEqual({ ...noMessageDetail, model: 'scripted/plain-1', reasoningTokens: 0 });
    expect(assistant[2]).toMatchObject({ blocks: [{ type: 'text', text: 'Nothing reported.' }], usage: null, detail: noMessageDetail });
  });

  test('a retry: the failed message, then its start and end', async () => {
    const agent = createScriptedAgent([
      { kind: 'retry', errorText: '529 overloaded', maxAttempts: 3, delayMs: 2_000 },
      { kind: 'retry', errorText: 'rate limited', attempt: 2, succeeded: false },
      { kind: 'end' },
    ]);
    const probe = probeSpec();
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.slice(1)).toEqual([
      { type: 'message', role: 'assistant', blocks: [], text: '', usage: null, detail: { ...noMessageDetail, stopReason: 'error', error: '529 overloaded' } },
      { type: 'retry', phase: 'started', attempt: 1, maxAttempts: 3, delayMs: 2_000, errorText: '529 overloaded' },
      { type: 'retry', phase: 'ended', attempt: 1, succeeded: true, errorText: null },
      { type: 'message', role: 'assistant', blocks: [], text: '', usage: null, detail: { ...noMessageDetail, stopReason: 'error', error: 'rate limited' } },
      { type: 'retry', phase: 'started', attempt: 2, maxAttempts: null, delayMs: null, errorText: 'rate limited' },
      { type: 'retry', phase: 'ended', attempt: 2, succeeded: false, errorText: 'rate limited' },
    ]);
  });

  test('compaction sizes a script leaves out are null', async () => {
    const agent = createScriptedAgent([{ kind: 'compaction', reason: 'overflow' }, { kind: 'end' }]);
    const probe = probeSpec();
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.filter(event => event.type === 'compaction')).toEqual([
      { type: 'compaction', phase: 'started', reason: 'overflow' },
      { type: 'compaction', phase: 'ended', reason: 'overflow', tokensBefore: null, tokensAfter: null, aborted: false, errorText: null },
    ]);
  });

  test('a message\'s display text is its text, or the tools it calls', () => {
    const read = { type: 'tool-call' as const, callId: 'c', tool: 'read', input: {}, action: { kind: 'other' as const } };
    expect(assistantText([{ type: 'thinking', visibility: 'full', text: 'hmm' }, { type: 'text', text: ' Done. ' }, read])).toBe('Done.');
    expect(assistantText([read, { ...read, tool: 'grep' }])).toBe('(calls read, grep)');
    expect(assistantText([{ type: 'thinking', visibility: 'unmarked', text: 'only thinking' }])).toBe('');
  });

  test('an executor that declares no thinking or retries says so, and reports neither', async () => {
    const agent = createScriptedAgent([
      { kind: 'message', text: 'Done.', blocks: [{ type: 'thinking', visibility: 'full', text: 'hidden' }] },
      { kind: 'retry', errorText: '529 overloaded' },
      { kind: 'end' },
    ], {
      support: {
        thinking: { available: false, reason: 'This executor reports no thinking.' },
        retries: { available: false, reason: 'This executor does not say when it retries.' },
      },
    });
    expect(agent.support.thinking).toEqual({ available: false, reason: 'This executor reports no thinking.' });
    expect(agent.support.retries).toEqual({ available: false, reason: 'This executor does not say when it retries.' });
    const probe = probeSpec();
    await agent.startSession(probe.spec).outcome;
    const assistant = messages(probe.events).flatMap(event => (event.role === 'assistant' ? [event] : []));
    expect(assistant[0]!.blocks).toEqual([{ type: 'text', text: 'Done.' }]);
    expect(assistant[1]!.detail.error).toBe('529 overloaded');
    expect(probe.events.some(event => event.type === 'retry')).toBe(false);
  });
});
