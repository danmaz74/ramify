import { describe, expect, test } from 'vitest';
import type { AgentEvent, SessionSpec, SubmissionVerdict } from '../interfaces/port.js';
import { createScriptedAgent } from '../scripted.js';

function spec(verdicts: SubmissionVerdict[] = [{ accepted: true }]): { spec: SessionSpec; events: AgentEvent[]; judged: unknown[] } {
  const events: AgentEvent[] = [];
  const judged: unknown[] = [];
  return {
    events,
    judged,
    spec: {
      role: 'architect',
      scope: { workingDirectory: '/project' },
      systemPrompt: 'system',
      prompt: 'map the plan',
      session: { mode: 'fresh' },
      context: { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 },
      builtinTools: ['read', 'grep'],
      tools: [{
        name: 'echo',
        description: 'Echoes its input',
        inputSchema: { type: 'object' },
        execute: async input => ({ text: JSON.stringify(input) }),
      }],
      submission: {
        name: 'submit',
        description: 'Submit',
        inputSchema: { type: 'object' },
        accept: async input => {
          judged.push(input);
          return verdicts.shift() ?? { accepted: true };
        },
      },
      sessionDirectory: '/job/session',
      onEvent: event => events.push(event),
    },
  };
}

describe('the scripted agent', () => {
  test('replays tool calls and messages, then ends with the accepted submission', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'read', input: { path: 'module.ramify' } },
      { kind: 'tool', tool: 'echo', input: { x: 1 } },
      { kind: 'tool', tool: 'bash', input: {} },
      { kind: 'message', text: 'Done', usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, total: 12 } },
      { kind: 'submit', input: { map: 1 } },
      { kind: 'message', text: 'never' },
    ]);
    const { spec: s, events } = spec();
    const session = agent.startSession(s);
    expect(await session.outcome).toEqual({ kind: 'submitted', input: { map: 1 } });
    const shape = (event: AgentEvent) => (event.type === 'message' ? `${event.role}:${event.role === 'tool-result' ? event.tool : ''}` : event.type)
      + `${'tool' in event && event.type !== 'message' ? `:${event.tool}` : ''}${'isError' in event && event.isError ? '!' : ''}`;
    // Each call is an assistant message before it starts and a tool result after it finishes.
    expect(events.map(shape)).toEqual([
      'user:',
      'assistant:', 'tool-started:read', 'tool-finished:read', 'tool-result:read',
      'assistant:', 'tool-started:echo', 'tool-finished:echo', 'tool-result:echo',
      'assistant:', 'tool-started:bash', 'tool-finished:bash!', 'tool-result:bash!',
      'assistant:',
      'assistant:', 'tool-started:submit', 'tool-finished:submit', 'tool-result:submit',
    ]);
    expect(agent.sessions[0]!.spec).toBe(s);
  });

  test('a rejected submission continues; a final rejection ends the session', async () => {
    const agent = createScriptedAgent([
      { kind: 'submit', input: 1 },
      { kind: 'submit', input: 2 },
      { kind: 'submit', input: 3 },
    ]);
    const { spec: s, judged, events } = spec([{ accepted: false, errors: ['bad'] }, { accepted: false, final: true, errors: ['too many'] }]);
    expect(await agent.startSession(s).outcome).toEqual({ kind: 'ended', message: 'too many' });
    expect(judged).toEqual([1, 2]);
    expect(events.filter(event => event.type === 'tool-finished')).toMatchObject([{ isError: true, errorText: 'bad' }, { isError: true }]);
  });

  test('failures, a script without a submission, and a throwing tool', async () => {
    expect(await createScriptedAgent([{ kind: 'fail', error: 'crashed' }]).startSession(spec().spec).outcome).toEqual({ kind: 'failed', error: 'crashed' });
    expect(await createScriptedAgent([{ kind: 'end', message: 'bye' }]).startSession(spec().spec).outcome).toEqual({ kind: 'ended', message: 'bye' });
    expect((await createScriptedAgent([]).startSession(spec().spec).outcome).kind).toBe('ended');
    const throwing = spec();
    throwing.spec.tools[0]!.execute = async () => { throw new Error('tool broke'); };
    expect(await createScriptedAgent([{ kind: 'tool', tool: 'echo', input: {} }]).startSession(throwing.spec).outcome)
      .toEqual({ kind: 'failed', error: 'tool broke' });
  });

  test('Stop ends a wait promptly', async () => {
    const session = createScriptedAgent([{ kind: 'wait', ms: 60_000 }, { kind: 'submit', input: 1 }]).startSession(spec().spec);
    await session.stop();
    expect(await session.outcome).toEqual({ kind: 'stopped' });
  });

  test('a hang ignores Stop and never settles', async () => {
    const session = createScriptedAgent([{ kind: 'hang' }]).startSession(spec().spec);
    const settled = await Promise.race([session.stop().then(() => 'stopped'), delay(50).then(() => 'still running')]);
    expect(settled).toBe('still running');
  });

  test('a misbehaving session keeps going after Stop and submits late', async () => {
    const { spec: s, judged } = spec();
    const session = createScriptedAgent([{ kind: 'stall', ms: 30, thenIgnoreStop: true }, { kind: 'submit', input: 'late' }]).startSession(s);
    await session.stop();
    expect(judged).toEqual(['late']);
    expect(await session.outcome).toEqual({ kind: 'submitted', input: 'late' });
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
