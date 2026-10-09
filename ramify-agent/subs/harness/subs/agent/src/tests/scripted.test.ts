import { invokeProbe, probeOperations, probeStore } from './helpers/spec.js';
import { describe, expect, test, vi } from 'vitest';
import type { AgentEvent, SessionSpec, SubmissionVerdict } from '../interfaces/port.js';
import { createScriptedAgent } from '../scripted.js';
import * as engine from '../session-operations.js';
import type { SessionStore, SessionTranscriptEntry } from '../interfaces/session-operations.js';

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
    const session = (await invokeProbe(agent, s));
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
    expect(agent.sessions[0]!.spec.prompt).toBe(s.prompt);
  });

  test('a rejected submission continues; a final rejection ends the session', async () => {
    const agent = createScriptedAgent([
      { kind: 'submit', input: 1 },
      { kind: 'submit', input: 2 },
      { kind: 'submit', input: 3 },
    ]);
    const { spec: s, judged, events } = spec([{ accepted: false, errors: ['bad'] }, { accepted: false, final: true, errors: ['too many'] }]);
    expect(await (await invokeProbe(agent, s)).outcome).toEqual({ kind: 'ended', message: 'too many' });
    expect(judged).toEqual([1, 2]);
    expect(events.filter(event => event.type === 'tool-finished')).toMatchObject([{ isError: true, errorText: 'bad' }, { isError: true }]);
  });

  test('failures, a script without a submission, and a throwing tool', async () => {
    expect(await (await invokeProbe(createScriptedAgent([{ kind: 'fail', error: 'crashed' }]), spec().spec)).outcome).toEqual({ kind: 'failed', error: 'crashed' });
    expect(await (await invokeProbe(createScriptedAgent([{ kind: 'end', message: 'bye' }]), spec().spec)).outcome).toEqual({ kind: 'ended', message: 'bye' });
    expect((await (await invokeProbe(createScriptedAgent([]), spec().spec)).outcome).kind).toBe('ended');
    const throwing = spec();
    throwing.spec.tools[0]!.execute = async () => { throw new Error('tool broke'); };
    expect(await (await invokeProbe(createScriptedAgent([{ kind: 'tool', tool: 'echo', input: {} }]), throwing.spec)).outcome)
      .toEqual({ kind: 'failed', error: 'tool broke' });
  });

  test('Stop ends a wait promptly', async () => {
    const session = (await invokeProbe(createScriptedAgent([{ kind: 'wait', ms: 60_000 }, { kind: 'submit', input: 1 }]), spec().spec));
    await session.stop();
    expect(await session.outcome).toEqual({ kind: 'stopped' });
  });

  test('an await step holds the script until its test releases it, and Stop ends it', async () => {
    let release: () => void = () => undefined;
    const { spec: s, events } = spec();
    const session = (await invokeProbe(createScriptedAgent([
      { kind: 'message', text: 'before' },
      { kind: 'await', until: () => new Promise<void>(resolve => { release = resolve; }) },
      { kind: 'message', text: 'after' },
      { kind: 'await', until: () => new Promise(() => undefined) },
      { kind: 'submit', input: 1 },
    ]), s));
    const texts = () => events.flatMap(event => (event.type === 'message' && event.role === 'assistant' ? [event.text] : []));
    await delay(20);
    expect(texts()).toEqual(['before']);
    release();
    await delay(20);
    expect(texts()).toEqual(['before', 'after']);
    await session.stop();
    expect(await session.outcome).toEqual({ kind: 'stopped' });
  });

  test('a hang ignores Stop and never settles', async () => {
    const session = (await invokeProbe(createScriptedAgent([{ kind: 'hang' }]), spec().spec));
    await delay(20);
    const settled = await Promise.race([session.stop().then(() => 'stopped'), delay(50).then(() => 'still running')]);
    expect(settled).toBe('still running');
  });

  test('a misbehaving session keeps going after Stop and submits late', async () => {
    const { spec: s, judged } = spec();
    const session = (await invokeProbe(createScriptedAgent([{ kind: 'stall', ms: 30, thenIgnoreStop: true }, { kind: 'submit', input: 'late' }]), s));
    await session.stop();
    expect(judged).toEqual([]);
    expect(await session.outcome).toEqual({ kind: 'stopped' });
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function beginDeclared(agent: ReturnType<typeof createScriptedAgent>, s: SessionSpec, store: SessionStore) {
  const operations = agent.bindSessionStore(store);
  const policy = { context: s.context, authority: {}, validator: {}, destination: {} };
  const definitions = [...s.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, mutating: tool.mutating ?? false })), { name: s.submission.name, description: s.submission.description, inputSchema: s.submission.inputSchema, mutating: false }];
  const P = await operations.create({ runId: 'batch-run', operationId: 'create', initialInstructions: s.systemPrompt, declarations: definitions, activate: definitions.map(item => item.name), policy });
  const task = { role: s.role, message: s.prompt, submissionTool: s.submission.name, environment: { workingDirectory: s.scope.workingDirectory, candidate: null, snapshot: null, limits: {} }, policyIdentity: 'original', validatorIdentity: 'original', destinationIdentity: 'original' };
  const bindings = { task, policy, tools: s.tools, submission: s.submission, currentAuthority: async () => true, onEvent: s.onEvent, publish: async () => {} };
  const handle = await operations.continue({ runId: 'batch-run', operationId: 'batch', sessionId: P.sessionId, expectedPoint: P.point!, task, policy, additions: [], toolChange: { add: [], activate: [], inactivate: [] }, bindings });
  return { operations, handle, P, bindings };
}

describe('scripted provider burst persistence', () => {
  test('publishes whole ordered bursts before effects and preserves every original opaque event and identity', async () => {
    const store = probeStore(); const commit = store.commit; const bursts: number[] = []; let previous = 0; const published = new Set<string>();
    store.commit = async input => {
      const result = await commit(input);
      for (const record of input.records) if (result.kind === 'committed' && record.id === 'operation:batch') {
        const refs = record.body['provider'] as SessionTranscriptEntry[];
        if (refs.length > previous) { bursts.push(refs.length - previous); previous = refs.length; for (const ref of refs) published.add(ref.key); }
      }
      return result;
    };
    const { spec: s, events, judged } = spec();
    s.tools[0]!.execute = async input => { expect(published.size).toBe(3); expect(events).toHaveLength(3); expect(input).toEqual({ x: 1 }); return { text: 'echoed' }; };
    const observed = { ...s, onEvent: (event: AgentEvent) => { expect(published.has(event.observation?.sourceId ?? '')).toBe(true); s.onEvent(event); } };
    const agent = createScriptedAgent([{ kind: 'tool', tool: 'echo', input: { x: 1 } }, { kind: 'submit', input: { done: true } }]);
    const turn = await beginDeclared(agent, observed, store); const receipt = await turn.handle.settled();
    expect(receipt.outcome).toEqual({ kind: 'submitted', input: { done: true } }); expect(judged).toEqual([{ done: true }]);
    expect(bursts).toEqual([3, 4, 2]);
    expect(events.map(event => event.type === 'message' ? event.role : event.type)).toEqual(['user', 'assistant', 'tool-started', 'tool-finished', 'tool-result', 'assistant', 'tool-started', 'tool-finished', 'tool-result']);
    expect(events.map(event => event.observation?.sourceId)).toEqual(['batch:event:0', 'batch:event:1', 'batch:event:2', 'batch:event:3', 'batch:event:4', 'batch:event:5', 'batch:event:6', 'batch:event:7', 'batch:event:8']);
    expect(events.filter(event => event.type === 'tool-started').map(event => event.callId)).toEqual(['batch:call-1', 'batch:call-2']);
    const snapshot = (await turn.operations.inspect('batch-run', turn.P.sessionId))!;
    const provider = snapshot.transcript.filter(entry => entry.kind === 'provider'); const bytes = await Promise.all(provider.map(entry => store.getPayload(entry.payloadId)));
    const texts = bytes.map(value => new TextDecoder().decode(value!));
    expect(texts[0]).toBe('{"type":"message","role":"user","blocks":[{"type":"text","text":"map the plan"}]}');
    expect(texts[2]).toBe('{"type":"tool-started","callId":"batch:call-1","tool":"echo","input":{"x":1},"action":{"kind":"harness"},"mutating":false}');
    expect(events.map(({ observation: _observation, execution: _execution, replayed: _replayed, ...event }) => JSON.stringify(event))).toEqual(texts);
    expect(events.filter(event => event.type === 'tool-finished').every(event => Object.hasOwn(event, 'errorText') && event.errorText === undefined)).toBe(true);
    const F = await turn.operations.fork({ runId: 'batch-run', operationId: 'fork-after', sourcePoint: receipt.point! });
    expect((await turn.operations.inspect('batch-run', F.sessionId))?.transcript).toEqual(snapshot.transcript);
    const before = events.length; expect(await (await turn.operations.retry({ runId: 'batch-run', operationId: 'batch', bindings: turn.bindings })).settled()).toEqual(receipt);
    expect(events).toHaveLength(before); expect(agent.sessions).toHaveLength(1);
  });
  test('automatically delivers durable messages during a held script and drains later queued events before the outcome', async () => {
    const store = probeStore(); const put = store.putPayload; const persisting = gate(); const releaseStore = gate(); const advanceScript = gate(); const releaseOutcome = gate(); const delivered = gate();
    store.putPayload = async bytes => { const value = JSON.parse(new TextDecoder().decode(bytes)) as { role?: string }; if (value.role === 'user') { persisting.resolve(); await releaseStore.promise; } return put(bytes); };
    const { spec: s, events } = spec();
    const observed = { ...s, onEvent: (event: AgentEvent) => { s.onEvent(event); if (event.type === 'message' && event.role === 'assistant' && event.text === 'after') delivered.resolve(); } };
    const agent = createScriptedAgent([{ kind: 'message', text: 'before' }, { kind: 'await', until: () => advanceScript.promise }, { kind: 'message', text: 'after' }, { kind: 'await', until: () => releaseOutcome.promise }]);
    const turn = await beginDeclared(agent, observed, store); await persisting.promise; advanceScript.resolve(); await Promise.resolve();
    expect(events).toEqual([]); releaseStore.resolve(); await delivered.promise;
    expect(events.filter(event => event.type === 'message').map(event => event.role === 'assistant' ? event.text : event.role)).toEqual(['user', 'before', 'after']);
    const stored = (await store.read('batch-run', 'operation:batch'))!;
    expect((stored.body['provider'] as SessionTranscriptEntry[]).map(entry => entry.key)).toEqual(['batch:event:0', 'batch:event:1', 'batch:event:2']);
    releaseOutcome.resolve(); expect((await turn.handle.settled()).status).toBe('completed');
  });
  test('detaches queued nested call input from mutation while preserving explicit undefined finish metadata', async () => {
    const store = probeStore(); const put = store.putPayload; const entered = gate(); const release = gate(); const raw = { nested: { text: 'announced' } };
    store.putPayload = async bytes => { const value = JSON.parse(new TextDecoder().decode(bytes)) as { role?: string }; if (value.role === 'user') { entered.resolve(); await release.promise; } return put(bytes); };
    const { spec: s, events } = spec(); let effects = 0;
    s.tools[0]!.execute = async input => { effects++; expect(input).toEqual({ nested: { text: 'later caller value' } }); return { text: 'echoed' }; };
    const turn = await beginDeclared(createScriptedAgent([{ kind: 'tool', tool: 'echo', input: raw }]), s, store);
    await entered.promise; raw.nested.text = 'later caller value'; release.resolve(); expect((await turn.handle.settled()).status).toBe('completed');
    const started = events.find(event => event.type === 'tool-started'); expect(started).toMatchObject({ input: { nested: { text: 'announced' } } });
    const snapshot = (await turn.operations.inspect('batch-run', turn.P.sessionId))!; const ref = snapshot.transcript.find(entry => entry.key === 'batch:event:2')!;
    expect(JSON.parse(new TextDecoder().decode((await store.getPayload(ref.payloadId))!))).toMatchObject({ input: { nested: { text: 'announced' } } });
    const finished = events.find(event => event.type === 'tool-finished')!; expect(Object.hasOwn(finished, 'errorText')).toBe(true); expect(finished).toHaveProperty('errorText', undefined); expect(effects).toBe(1);
  });
  test.each([new Error('First persistence failed'), undefined])('keeps the first persistence failure sticky and admits no dependent effects or events: %s', async failure => {
    const store = probeStore(); const put = store.putPayload; let attempts = 0; let effects = 0;
    store.putPayload = async bytes => { const value = JSON.parse(new TextDecoder().decode(bytes)) as { type?: string }; if (value.type === 'message') { attempts++; if (attempts === 2) throw failure; } return put(bytes); };
    const { spec: s, events, judged } = spec(); s.tools[0]!.execute = async () => { effects++; return { text: 'unexpected' }; };
    const turn = await beginDeclared(createScriptedAgent([{ kind: 'message', text: 'before tool' }, { kind: 'tool', tool: 'echo', input: {} }, { kind: 'submit', input: 'unexpected' }]), s, store);
    expect(await turn.handle.settled()).toMatchObject({ status: 'failed', reason: failure instanceof Error ? failure.message : 'undefined' });
    expect(events).toEqual([]); expect(judged).toEqual([]); expect(effects).toBe(0); expect(attempts).toBe(2);
    expect((await store.read('batch-run', 'operation:batch'))?.body).toMatchObject({ provider: [], effects: [], quiescent: true });
  });
  test('retains sequential old-runtime fallback with every burst durable before its first event or effect', async () => {
    const original = engine.createSessionOperations; const persisted: string[] = [];
    const replacement = vi.spyOn(engine, 'createSessionOperations').mockImplementation(options => original({ ...options, driver: { async dispatch(input, runtime) {
      const old = { ...runtime }; delete old.persistPayloads;
      return options.driver.dispatch(input, { ...old, async persistPayload(key, bytes) { const id = await runtime.persistPayload(key, bytes); persisted.push(key); return id; } });
    } } }));
    try {
      const { spec: s, events, judged } = spec();
      const observed = { ...s, onEvent: (event: AgentEvent) => { if (events.length === 0) expect(persisted).toEqual(['batch:event:0', 'batch:event:1', 'batch:event:2']); s.onEvent(event); } };
      s.tools[0]!.execute = async () => { expect(events).toHaveLength(3); return { text: 'echoed' }; };
      const turn = await beginDeclared(createScriptedAgent([{ kind: 'tool', tool: 'echo', input: {} }, { kind: 'submit', input: 'accepted' }]), observed, probeStore());
      expect((await turn.handle.settled()).outcome).toEqual({ kind: 'submitted', input: 'accepted' }); expect(judged).toEqual(['accepted']);
      expect(persisted).toEqual(['batch:event:0', 'batch:event:1', 'batch:event:2', 'batch:event:3', 'batch:event:4', 'batch:event:5', 'batch:event:6', 'batch:event:7', 'batch:event:8']); expect(events).toHaveLength(9);
    } finally { replacement.mockRestore(); }
  });
});
