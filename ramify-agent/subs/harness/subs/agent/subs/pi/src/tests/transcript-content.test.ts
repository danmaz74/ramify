import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { AgentEvent, MessageEvent } from '../../../../src/interfaces/port.js';
import { startPi, validMap } from './helpers/session.js';
import { calls, type Reply } from './helpers/scripted-provider.js';

/*
 * ST06: the port carries the whole conversation from pi's events. The first
 * prompt, every assistant block and every tool result arrive as messages,
 * with the optional detail pi reports and null for what it does not. pi's
 * session file is read here only to show that the events hold everything
 * it holds, apart from the opaque provider data they leave out.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const rates = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
const cost = { input: 0.003, output: 0.003, cacheRead: 0, cacheWrite: 0.001125, total: 0.007125 };

const messages = (events: readonly AgentEvent[]): MessageEvent[] => events.filter((event): event is MessageEvent => event.type === 'message');

/** The message entries of pi's own session file, as pi wrote them. */
function piFileMessages(sessionDirectory: string): Array<{ role: string; toolCallId?: string; content: unknown }> {
  const file = readdirSync(sessionDirectory).find(name => name.endsWith('.jsonl'));
  if (file === undefined) throw new Error('pi wrote no session file');
  return readFileSync(join(sessionDirectory, file), 'utf8').split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as { type: string; message?: { role: string; toolCallId?: string; content: unknown } })
    .flatMap(entry => (entry.type === 'message' && entry.message !== undefined ? [entry.message] : []));
}

describe('ST06: transcript content through the port', () => {
  test('one scripted pi session: the first prompt, every assistant block, every tool result by call ID, and pi\'s optional detail', async () => {
    let seen: readonly AgentEvent[] = [];
    let promptBeforeModel: boolean | undefined;
    const thinkingReply: Reply = {
      kind: 'reply',
      blocks: [
        { type: 'thinking', thinking: 'The map needs the module file first.', signature: 'opaque-signature-one' },
        { type: 'thinking', thinking: '[Reasoning redacted]', signature: 'opaque-signature-two', redacted: true },
        { type: 'text', text: 'Reading the module first.' },
        { type: 'toolCall', name: 'read', arguments: { path: 'module.ramify' }, id: 'c-read' },
        { type: 'toolCall', name: 'grep', arguments: { pattern: 'demo', path: 'module.ramify' }, id: 'c-grep' },
      ],
      usage: { input: 1_000, output: 200, cacheWrite: 300, cacheWrite1h: 100, reasoning: 120, cost },
      detail: { responseModel: 'scripted-1-2026', providerThinkingLevel: 'high' },
    };
    const harness = await startPi(cleanups, [
      () => {
        promptBeforeModel = seen.some(event => event.type === 'message' && event.role === 'user');
        return thinkingReply;
      },
      // A transient provider error, which pi retries on its own.
      { kind: 'error', message: '529 overloaded' },
      calls({ type: 'toolCall', name: 'submit_implementation_map', arguments: validMap, id: 'c-submit' }),
    ], { prompt: 'Map the module.', cost: rates, retryDelayMs: 1 });
    seen = harness.events;
    await expect(harness.session.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });

    const all = messages(harness.events);
    // The first prompt is the first event, reported before the model was called.
    expect(harness.events[0]).toEqual({ type: 'message', role: 'user', blocks: [{ type: 'text', text: 'Map the module.' }] });
    expect(promptBeforeModel).toBe(true);

    // Every assistant block, in order; thinking with its visibility, and no signature.
    const assistant = all.filter(event => event.role === 'assistant');
    expect(assistant).toHaveLength(3);
    expect(assistant[0]).toEqual({
      type: 'message', role: 'assistant',
      blocks: [
        { type: 'thinking', visibility: 'unmarked', text: 'The map needs the module file first.' },
        { type: 'thinking', visibility: 'redacted', text: '' },
        { type: 'text', text: 'Reading the module first.' },
        { type: 'tool-call', callId: 'c-read', tool: 'read', input: { path: 'module.ramify' }, action: { kind: 'read', path: 'module.ramify', range: null } },
        { type: 'tool-call', callId: 'c-grep', tool: 'grep', input: { pattern: 'demo', path: 'module.ramify' }, action: { kind: 'search', pattern: 'demo', path: 'module.ramify', glob: null } },
      ],
      text: 'Reading the module first.',
      usage: { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 300, total: 1_500 },
      detail: {
        model: 'scripted/scripted-1-2026', thinkingLevel: 'high', stopReason: 'tool-use', error: null,
        reasoningTokens: 120, cost, cacheWrites: { short: 200, long: 100 },
      },
    });

    // The failed call, then pi's retry and its success.
    expect(assistant[1]).toMatchObject({
      blocks: [], text: '',
      detail: { model: 'scripted/scripted-1', stopReason: 'error', error: '529 overloaded', reasoningTokens: null, cacheWrites: null, thinkingLevel: null },
    });
    const retries = harness.events.filter(event => event.type === 'retry');
    expect(retries).toEqual([
      { type: 'retry', phase: 'started', attempt: 1, maxAttempts: 2, delayMs: 1, errorText: '529 overloaded' },
      { type: 'retry', phase: 'ended', attempt: 1, succeeded: true, errorText: null },
    ]);
    expect(harness.events.indexOf(retries[0]!)).toBeGreaterThan(harness.events.indexOf(assistant[1]!));
    expect(harness.events.indexOf(retries[1]!)).toBeGreaterThan(harness.events.indexOf(assistant[2]!));

    // Every tool result names a call an earlier assistant message made.
    const results = all.filter(event => event.role === 'tool-result');
    expect(results.map(event => [event.callId, event.tool, event.isError])).toEqual([
      ['c-read', 'read', false], ['c-grep', 'grep', false], ['c-submit', 'submit_implementation_map', false],
    ]);
    for (const result of results) {
      const made = assistant.findIndex(message => message.blocks.some(block => block.type === 'tool-call' && block.callId === result.callId));
      expect(made).toBeGreaterThanOrEqual(0);
      expect(harness.events.indexOf(assistant[made]!)).toBeLessThan(harness.events.indexOf(result));
    }
    expect(results[0]!.blocks).toEqual([{ type: 'text', text: expect.stringContaining('module demo') }]);
    expect(results[2]!.blocks).toEqual([{ type: 'text', text: 'The submission was accepted and recorded.' }]);

    // The events hold every conversation message pi's own file holds, and none
    // of its opaque data. pi also records its own prompt and tool state as
    // system messages, which the spec's prompt replaces on every request.
    const recorded = piFileMessages(harness.sessionDirectory);
    expect(recorded.some(message => message.role === 'system')).toBe(true);
    const file = recorded.filter(message => message.role !== 'system');
    expect(all.map(event => event.role)).toEqual(file.map(message => (message.role === 'toolResult' ? 'tool-result' : message.role)));
    expect(results.map(event => event.callId)).toEqual(file.flatMap(message => (message.role === 'toolResult' ? [message.toolCallId] : [])));
    expect(JSON.stringify(file)).toContain('opaque-signature-one');
    const carried = JSON.stringify(harness.events);
    expect(carried).not.toContain('opaque-signature');
    expect(carried).not.toContain('[Reasoning redacted]');
  }, 30_000);

  test('detail pi does not report is null, and a model pi has no rates for has no cost', async () => {
    const harness = await startPi(cleanups, [{
      kind: 'reply',
      blocks: [{ type: 'text', text: 'Submitting.' }, { type: 'toolCall', name: 'submit_implementation_map', arguments: validMap, id: 'c-submit' }],
      usage: { input: 50, output: 5 },
    }]);
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });
    const first = messages(harness.events).find(event => event.role === 'assistant');
    if (first?.role !== 'assistant') throw new Error('no assistant message');
    expect(first.usage).toEqual({ input: 50, output: 5, cacheRead: 0, cacheWrite: 0, total: 55 });
    // The model is pi's, and so is the stop reason; nothing else was reported.
    expect(first.detail).toEqual({
      model: 'scripted/scripted-1', thinkingLevel: null, stopReason: 'tool-use', error: null,
      reasoningTokens: null, cost: null, cacheWrites: null,
    });
    expect(first.blocks.map(block => block.type)).toEqual(['text', 'tool-call']);
    expect(harness.events.some(event => event.type === 'retry')).toBe(false);
  }, 30_000);
});
