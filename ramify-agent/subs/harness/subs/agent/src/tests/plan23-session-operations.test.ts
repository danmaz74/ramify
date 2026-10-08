import { describe, expect, it } from 'vitest';
import { createSessionOperations } from '../session-operations.js';
import { SessionDriverUnavailableError } from '../interfaces/session-operations.js';
import { createScriptedAgent, createScriptedSessionDriver } from '../scripted.js';
import type { AgentSessionPoint, ContinueSessionInput, SessionExecutionBindings, SessionExecutionPolicy, SessionOperationDriver, SessionStore, SessionStoreRecord, SessionTaskInput, SessionToolDeclaration } from '../interfaces/session-operations.js';

const policy: SessionExecutionPolicy = { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { write: true }, validator: { version: 1 }, destination: { record: 'A' } };
const tools: SessionToolDeclaration[] = [
  { name: 'read', description: 'Read', inputSchema: { type: 'object' }, mutating: false },
  { name: 'write', description: 'Write', inputSchema: { type: 'object' }, mutating: true },
  { name: 'submit_orientation', description: 'Orientation', inputSchema: { type: 'object' }, mutating: false },
];
const task: SessionTaskInput = { role: 'architect', message: 'Orient A', submissionTool: 'submit_orientation', environment: { workingDirectory: '/A', candidate: 'C0', snapshot: 'S0', limits: { max: 10 } }, policyIdentity: 'p1', validatorIdentity: 'v1', destinationIdentity: 'd1' };
function bindings(overrides: Partial<SessionExecutionBindings> = {}): SessionExecutionBindings {
  return { task, policy, tools: [{ ...tools[0]!, execute: async () => ({ text: 'A' }) }, { ...tools[1]!, execute: async () => ({ text: 'written' }) }], submission: { name: 'submit_orientation', accept: async () => ({ accepted: true }) }, currentAuthority: async () => true, onEvent: () => {}, publish: async () => {}, ...overrides };
}
function memoryStore(): SessionStore {
  const records = new Map<string, SessionStoreRecord>(); const payloads = new Map<string, Uint8Array>();
  const key = (runId: string, id: string) => JSON.stringify([runId, id]);
  return {
    async read(runId, id) { return structuredClone(records.get(key(runId, id)) ?? null); },
    async putPayload(bytes) { const id = Buffer.from(bytes).toString('base64'); payloads.set(id, new Uint8Array(bytes)); return id; },
    async getPayload(id) { return payloads.get(id) ?? null; },
    async commit(input) {
      for (const expected of input.expected) if ((records.get(key(input.runId, expected.id))?.revision ?? null) !== expected.revision) return { kind: 'conflict', reason: 'CAS' };
      for (const record of input.records) records.set(key(input.runId, record.id), structuredClone(record));
      return { kind: 'committed' };
    },
  };
}
const create = { runId: 'run-A', operationId: 'create', initialInstructions: 'Role A\nGeneral task protocol.', declarations: tools, activate: tools.map(item => item.name), policy };
function continuation(sessionId: string, expectedPoint: AgentSessionPoint, operationId: string, bound = bindings()): ContinueSessionInput {
  return { runId: 'run-A', operationId, sessionId, expectedPoint, task: bound.task, policy: bound.policy, additions: [], toolChange: { add: [], activate: [], inactivate: [] }, bindings: bound };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function observation(promise: Promise<unknown>) { let ended = false; void promise.then(() => { ended = true; }, () => { ended = true; }); return () => ended; }
async function flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); }

describe('Plan 23 F1 high-level session operations', () => {
  it('durably fences typed unavailable provider history while leaving historic settled points forkable', async () => {
    let dispatches = 0; const store = memoryStore();
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; throw new SessionDriverUnavailableError('Opaque request prefix is corrupt'); } } });
    const P = await operations.create(create);
    const end = await (await operations.continue(continuation(P.sessionId, P.point!, 'unsafe'))).receipt;
    expect(end).toMatchObject({ status: 'unavailable', point: null, reason: 'Opaque request prefix is corrupt' });
    const rebuilt = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } } });
    expect(await (await rebuilt.retry({ runId: 'run-A', operationId: 'unsafe', bindings: bindings() })).receipt).toEqual(end);
    expect(await rebuilt.inspect('run-A', P.sessionId)).toBeNull(); expect(dispatches).toBe(1);
    expect((await rebuilt.fork({ runId: 'run-A', operationId: 'safe-old', sourcePoint: P.point! })).status).toBe('completed');
  });
  it('original-operation lookup refuses corrupt points and envelopes without dispatch or acceptance', async () => {
    let dispatches = 0; const store = memoryStore();
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } } });
    await operations.create(create);
    const original = (await store.read('run-A', 'operation:create'))!;
    for (const patch of [{ runId: 'other' }, { id: 'operation:other' }, { body: { ...original.body, snapshot: { ...(original.body['snapshot'] as object), currentPoint: { sessionId: original.body['sessionId'], turn: 0, kind: 'invented', checkpoint: '' } } } }]) {
      const corrupt = { ...original, ...patch };
      const reader: SessionStore = { ...store, read: async () => corrupt };
      const reopened = createSessionOperations({ sessionStore: reader, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } } });
      await expect(reopened.operationIdentity('run-A', 'create')).rejects.toThrow('Corrupt');
    }
    expect(dispatches).toBe(0);
  });
  it('S01/S02 retains exact role, turn/checkpoint lineage and isolated siblings', async () => {
    const store = memoryStore(); let dispatches = 0;
    const driver: SessionOperationDriver = { dispatch: async (input, runtime) => { dispatches++; expect(input.session.initialInstructions).toBe('Role A\nGeneral task protocol.'); return createScriptedSessionDriver([{ kind: 'submit', input: { orientation: 'A' } }]).dispatch(input, runtime); } };
    const operations = createSessionOperations({ sessionStore: store, driver });
    const P = await operations.create(create);
    expect(await operations.create(create)).toEqual(P);
    const T1 = await (await operations.continue(continuation(P.sessionId, P.point!, 'orient'))).receipt;
    expect(T1.turn).toBe(1);
    const C1 = await operations.appendContext({ runId: 'run-A', operationId: 'brief-b', sessionId: P.sessionId, expectedPoint: T1.point!, additions: [{ key: 'brief-b', kind: 'brief', text: 'B', revision: 'r1' }] });
    expect(C1.point?.turn).toBe(1); expect(C1.turn).toBeNull(); expect(C1.point?.checkpoint).not.toBe(T1.point?.checkpoint);
    const L = await operations.fork({ runId: 'run-A', operationId: 'fork-L', sourcePoint: T1.point! });
    const R = await operations.fork({ runId: 'run-A', operationId: 'fork-R', sourcePoint: C1.point! });
    expect(await operations.fork({ runId: 'run-A', operationId: 'fork-L', sourcePoint: T1.point! })).toEqual(L);
    expect(new Set([P.sessionId, L.sessionId, R.sessionId]).size).toBe(3);
    expect((await operations.inspect('run-A', L.sessionId))?.additions).toEqual([]);
    expect((await operations.inspect('run-A', R.sessionId))?.additions.map(item => item.text)).toEqual(['B']);
    const l2 = await (await operations.continue(continuation(L.sessionId, L.point!, 'l2'))).receipt;
    const r2 = await (await operations.continue(continuation(R.sessionId, R.point!, 'r2'))).receipt;
    expect(l2.turn).toBe(2); expect(r2.turn).toBe(2); expect(l2.point?.sessionId).not.toBe(r2.point?.sessionId);
    expect((await operations.fork({ runId: 'run-A', operationId: 'wrong-sibling', sourcePoint: { ...l2.point!, sessionId: R.sessionId } })).status).toBe('unavailable');
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'orient'))).receipt).toEqual(T1);
    expect(dispatches).toBe(3);
    expect((await operations.inspect('run-A', P.sessionId, T1.point!))?.additions).toEqual([]);
    const C2 = await operations.appendContext({ runId: 'run-A', operationId: 'brief-c', sessionId: P.sessionId, expectedPoint: C1.point!, additions: [{ key: 'brief-c', kind: 'brief', text: 'C', revision: 'r2' }] });
    await (await operations.continue(continuation(P.sessionId, C2.point!, 'parent2'))).receipt;
    expect((await operations.inspect('run-A', R.sessionId))?.additions.map(item => item.text)).toEqual(['B']);
  });
  it('S04 serializes two advances and permits old settled forks while parent active', async () => {
    const gate = deferred(); const operations = createSessionOperations({ sessionStore: memoryStore(), driver: createScriptedSessionDriver([{ kind: 'await', until: () => gate.promise }, { kind: 'end' }]) });
    const P = await operations.create(create);
    const [a, b] = await Promise.all([operations.continue(continuation(P.sessionId, P.point!, 'a')), operations.continue(continuation(P.sessionId, P.point!, 'b'))]);
    const fork = await operations.fork({ runId: 'run-A', operationId: 'fork-active', sourcePoint: P.point! });
    expect(fork.status).toBe('completed'); expect(fork.point?.turn).toBe(0);
    gate.resolve(); const receipts = await Promise.all([a.receipt, b.receipt]);
    expect(receipts.map(item => item.status).sort()).toEqual(['completed', 'conflict']);
    expect((await operations.continue(continuation(P.sessionId, P.point!, 'stale'))).receipt).resolves.toMatchObject({ status: 'conflict' });
    expect((await operations.create({ ...create, initialInstructions: 'Different' })).status).toBe('conflict');
  });
  it('standalone activation keeps declarations and inactive calls never reach handlers', async () => {
    let writes = 0; let accepts = 0;
    const store = memoryStore();
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) { expect(await runtime.callTool('w', 'write', {})).toMatchObject({ isError: true }); expect(await runtime.callTool('old-submit', 'submit_orientation', {})).toMatchObject({ isError: true }); return { kind: 'ended' }; } } });
    const P = await operations.create(create);
    const changed = await operations.changeTools({ runId: 'run-A', operationId: 'readonly', sessionId: P.sessionId, expectedPoint: P.point!, toolChange: { add: [{ name: 'submit_review', description: 'Review', inputSchema: {}, mutating: false }], activate: ['submit_review'], inactivate: ['write', 'submit_orientation'] } });
    expect(changed.point?.turn).toBe(0);
    const original = await operations.inspect('run-A', P.sessionId, P.point!); expect(original?.activeTools).toContain('write');
    const bound = bindings({ task: { ...task, submissionTool: 'submit_review' }, tools: [{ ...tools[1]!, execute: async () => { writes++; return { text: 'bad' }; } }], submission: { name: 'submit_review', accept: async () => { accepts++; return { accepted: true }; } } });
    const end = await (await operations.continue(continuation(P.sessionId, changed.point!, 'read-only-task', bound))).receipt;
    expect(end.status).toBe('completed'); expect(writes).toBe(0); expect(accepts).toBe(0);
    expect((await operations.inspect('run-A', P.sessionId))?.declarations.map(item => item.name)).toContain('write');
    const conflict = await operations.changeTools({ runId: 'run-A', operationId: 'replace', sessionId: P.sessionId, expectedPoint: end.point!, toolChange: { add: [{ ...tools[0]!, description: 'Changed' }], activate: [], inactivate: [] } });
    expect(conflict.status).toBe('conflict');
    const before = (await operations.inspect('run-A', P.sessionId))?.declarations.length;
    await operations.changeTools({ runId: 'run-A', operationId: 'same', sessionId: P.sessionId, expectedPoint: end.point!, toolChange: { add: [tools[0]!], activate: [], inactivate: [] } });
    expect((await operations.inspect('run-A', P.sessionId))?.declarations.length).toBe(before);
  });
  it('S05 Stop fences late effect completion and acceptance without inventing a reusable point', async () => {
    const entered = deferred(); const late = deferred(); let accepted = 0; let effects = 0;
    const store = memoryStore(); const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'tool', tool: 'write', input: {} }, { kind: 'submit', input: { orientation: 'late' } }]) });
    const P = await operations.create(create);
    const bound = bindings({ tools: [{ ...tools[1]!, execute: async () => { effects++; entered.resolve(); await late.promise; return { text: 'actually wrote' }; } }], submission: { name: 'submit_orientation', accept: async () => { accepted++; return { accepted: true }; } } });
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'delayed', bound)); await entered.promise;
    const stopping = operations.stop({ runId: 'run-A', operationId: 'delayed', sessionId: P.sessionId });
    const stopEnded = observation(stopping); const idle = handle.settled(); const idleEnded = observation(idle);
    const stopped = await handle.receipt;
    expect(stopped.status).toBe('stopped'); expect(stopped.point).toBeNull(); expect(stopped.reason).toMatch(/unknown/);
    const settledRecord = await store.read('run-A', 'operation:delayed');
    await flush(); expect(stopEnded()).toBe(false); expect(idleEnded()).toBe(false); expect(settledRecord?.body['quiescent']).not.toBe(true);
    late.resolve(); expect(await stopping).toEqual(stopped); expect(await idle).toEqual(stopped);
    const drained = await store.read('run-A', 'operation:delayed');
    expect(drained?.body).toEqual({ ...settledRecord!.body, quiescent: true }); expect(accepted).toBe(0); expect(effects).toBe(1);
    expect(await (await operations.retry({ runId: 'run-A', operationId: 'delayed', bindings: bound })).receipt).toEqual(stopped);
    expect(await operations.inspect('run-A', P.sessionId)).toBeNull();
  });
  it('waits for an interrupted mutation hook without rewriting its terminal effect evidence', async () => {
    const entered = deferred(); const release = deferred(); const store = memoryStore(); let submissions = 0;
    const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'tool', tool: 'write', input: {} }, { kind: 'submit', input: {} }]) });
    const P = await operations.create(create);
    const bound = bindings({ afterMutation: async () => { entered.resolve(); await release.promise; return { text: 'late check' }; }, submission: { name: 'submit_orientation', accept: async () => { submissions++; return { accepted: true }; } } });
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'hook', bound)); await entered.promise;
    const stop = handle.stop(); const idle = handle.settled(); const idleEnded = observation(idle); const stopEnded = observation(stop);
    const receipt = await handle.receipt; const fenced = await store.read('run-A', 'operation:hook');
    expect(receipt.point).toBeNull(); expect(fenced?.body['effects']).toMatchObject([{ phase: 'completed' }, { phase: 'intent' }]);
    await flush(); expect(idleEnded()).toBe(false); expect(stopEnded()).toBe(false);
    release.resolve(); expect(await stop).toEqual(receipt); expect(await idle).toEqual(receipt);
    expect((await store.read('run-A', 'operation:hook'))?.body).toEqual({ ...fenced!.body, quiescent: true }); expect(submissions).toBe(0);
  });
  it('drains a tool admitted by a driver that returns without awaiting it before publishing a point', async () => {
    const entered = deferred(); const release = deferred(); const returned = deferred(); const store = memoryStore();
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_input, runtime) { void runtime.callTool('orphan', 'write', {}); await entered.promise; returned.resolve(); return { kind: 'ended' }; } } });
    const P = await operations.create(create); let hooks = 0;
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'orphan', bindings({ tools: [{ ...tools[1]!, execute: async () => { entered.resolve(); await release.promise; return { text: 'write finished' }; } }], afterMutation: async () => { hooks++; return null; } })));
    const receiptEnded = observation(handle.receipt); const idleEnded = observation(handle.settled()); await returned.promise; await flush();
    expect(receiptEnded()).toBe(false); expect(idleEnded()).toBe(false); expect((await store.read('run-A', 'operation:orphan'))?.body['phase']).toBe('dispatched');
    release.resolve(); const receipt = await handle.settled(); expect(receipt.status).toBe('completed'); expect(receipt.point).not.toBeNull(); expect(hooks).toBe(1);
    expect((await store.read('run-A', 'operation:orphan'))?.body).toMatchObject({ quiescent: true, effects: [{ phase: 'completed' }, { phase: 'completed' }] });
  });
  it('shares terminal drainage across factories by persisted owner token and never redispatches', async () => {
    const entered = deferred(); const release = deferred(); const store = memoryStore(); let dispatches = 0;
    const driver: SessionOperationDriver = { async dispatch(_input, runtime) { dispatches++; await runtime.callTool('shared', 'write', {}); return { kind: 'ended' }; } };
    const operations = createSessionOperations({ sessionStore: store, driver }); const other = createSessionOperations({ sessionStore: store, driver });
    const P = await operations.create(create); const bound = bindings({ tools: [{ ...tools[1]!, execute: async () => { entered.resolve(); await release.promise; return { text: 'late' }; } }] });
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'shared', bound)); await entered.promise;
    const stop = other.stop({ runId: 'run-A', operationId: 'shared', sessionId: P.sessionId }); const value = await handle.receipt;
    const duplicate = await other.retry({ runId: 'run-A', operationId: 'shared', bindings: bindings() }); expect(await duplicate.receipt).toEqual(value);
    const duplicateIdle = duplicate.settled(); const duplicateStop = duplicate.stop(); const terminalStop = other.stop({ runId: 'run-A', operationId: 'shared', sessionId: P.sessionId });
    const observed = [stop, duplicateIdle, duplicateStop, terminalStop].map(observation); await flush(); expect(observed.map(ended => ended())).toEqual([false, false, false, false]);
    release.resolve(); expect(await Promise.all([stop, duplicateIdle, duplicateStop, terminalStop])).toEqual([value, value, value, value]); expect(dispatches).toBe(1);
  });
  it('attests ordinary completed quiescence durably so another live server can reuse the terminal receipt', async () => {
    const store = memoryStore(); const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'submit', input: { ok: true } }]) });
    const P = await operations.create(create); const handle = await operations.continue(continuation(P.sessionId, P.point!, 'ordinary')); const receipt = await handle.settled();
    const terminal = (await store.read('run-A', 'operation:ordinary'))!; expect(terminal.body['quiescent']).toBe(true); expect(terminal.body['receipt']).toEqual(receipt);
    await store.commit({ runId: 'run-A', expected: [{ id: terminal.id, revision: terminal.revision }], records: [{ ...terminal, revision: terminal.revision + 1, body: { ...terminal.body, owner: { token: 'foreign-completed-owner', pid: 999999 } } }], payloads: [] });
    let probes = 0; let dispatches = 0;
    const other = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } }, isExecutionOwnerAlive: async () => { probes++; return true; } });
    const retry = await other.retry({ runId: 'run-A', operationId: 'ordinary', bindings: bindings({ currentAuthority: async () => false }) });
    expect(await retry.receipt).toEqual(receipt); expect(await retry.settled()).toEqual(receipt); expect(await retry.stop()).toEqual(receipt); expect(probes).toBe(0); expect(dispatches).toBe(0);
    const current = (await store.read('run-A', 'operation:ordinary'))!;
    const { quiescent: _marker, ...withoutMarker } = current.body; void _marker;
    await store.commit({ runId: 'run-A', expected: [{ id: current.id, revision: current.revision }], records: [{ ...current, revision: current.revision + 1, body: withoutMarker }], payloads: [] });
    const old = await other.retry({ runId: 'run-A', operationId: 'ordinary', bindings: bindings() }); expect(await old.receipt).toEqual(receipt);
    await expect(old.settled()).rejects.toThrow('quiescence is unavailable'); await expect(old.stop()).rejects.toThrow('quiescence is unavailable'); expect(dispatches).toBe(0);
    const dead = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([]), isExecutionOwnerAlive: async () => false });
    expect(await (await dead.retry({ runId: 'run-A', operationId: 'ordinary', bindings: bindings() })).settled()).toEqual(receipt);
  });
  it('tracks detached provider persistence through its store write and final operation append', async () => {
    const entered = deferred(); const release = deferred(); const store = memoryStore(); const put = store.putPayload;
    store.putPayload = async bytes => { if (new TextDecoder().decode(bytes) === 'native-orphan') { entered.resolve(); await release.promise; } return put(bytes); };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_input, runtime) { void runtime.persistPayload('native-orphan', new TextEncoder().encode('native-orphan')); await entered.promise; return { kind: 'ended' }; } } });
    const P = await operations.create(create); const handle = await operations.continue(continuation(P.sessionId, P.point!, 'payload')); const ended = observation(handle.settled()); const receiptEnded = observation(handle.receipt);
    await entered.promise; await flush(); expect(ended()).toBe(false); expect(receiptEnded()).toBe(false); release.resolve(); const receipt = await handle.settled();
    expect(receipt.status).toBe('completed'); expect((await store.read('run-A', 'operation:payload'))?.body).toMatchObject({ quiescent: true, provider: [{ key: 'native-orphan' }] });
  });
  it('waits for admitted guard work and terminal publication independently of receipt', async () => {
    const entered = deferred(); const release = deferred(); const store = memoryStore(); let executed = 0;
    const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'tool', tool: 'write', input: {} }]) });
    const P = await operations.create(create); const handle = await operations.continue(continuation(P.sessionId, P.point!, 'guard', bindings({ guard: async () => { entered.resolve(); await release.promise; return { allow: true }; }, tools: [{ ...tools[1]!, execute: async () => { executed++; return { text: 'forbidden late write' }; } }] })));
    await entered.promise; const stop = handle.stop(); const value = await handle.receipt; const ended = observation(handle.settled()); await flush(); expect(ended()).toBe(false);
    release.resolve(); expect(await stop).toEqual(value); expect(executed).toBe(0);
    const publishing = deferred(); const published = deferred(); const other = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const Q = await other.create({ ...create, operationId: 'create-publisher' });
    const publisher = await other.continue(continuation(Q.sessionId, Q.point!, 'publisher', bindings({ publish: async () => { publishing.resolve(); await published.promise; } })));
    await publishing.promise; const terminal = await store.read('run-A', 'operation:publisher'); expect(terminal?.body['phase']).toBe('terminal'); expect(terminal?.body['quiescent']).not.toBe(true);
    const retry = await operations.retry({ runId: 'run-A', operationId: 'publisher', bindings: bindings() }); expect(await retry.receipt).toEqual(terminal?.body['receipt']);
    const idle = publisher.settled(); const retryIdle = retry.settled(); const observed = [idle, retryIdle].map(observation); await flush(); expect(observed.map(ended => ended())).toEqual([false, false]);
    published.resolve(); expect(await idle).toEqual(await publisher.receipt); expect(await retryIdle).toEqual(await publisher.receipt);
  });
  it('S06 enforces actual policy values and current authority before dispatch', async () => {
    let calls = 0;
    const store = memoryStore(); const driver: SessionOperationDriver = { async dispatch() { calls++; return { kind: 'ended' }; } };
    const operations = createSessionOperations({ sessionStore: store, driver }); const P = await operations.create(create);
    const altered = bindings({ policy: { ...policy, authority: { write: 'wider' } } });
    const input = continuation(P.sessionId, P.point!, 'bad', altered);
    const conflict = await (await operations.continue({ ...input, policy })).receipt;
    expect(conflict.status).toBe('conflict'); expect(calls).toBe(0);
    const denied = await (await operations.continue(continuation(P.sessionId, P.point!, 'denied', bindings({ currentAuthority: async () => false })))).receipt;
    expect(denied.status).toBe('failed'); expect(calls).toBe(0);
    expect(await (await operations.retry({ runId: 'run-A', operationId: 'denied', bindings: bindings() })).receipt).toEqual(denied);
  });
  it('checks an executed mutating handler that throws, retaining uncertain completion', async () => {
    let hooks = 0; const store = memoryStore();
    const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'tool', tool: 'write', input: {} }]) });
    const P = await operations.create(create);
    const bound = bindings({ tools: [{ ...tools[1]!, execute: async () => { throw new Error('external tool failed'); } }], afterMutation: async call => { hooks++; expect(call.failed).toBe(true); return { text: 'failure check retained' }; } });
    const result = await (await operations.continue(continuation(P.sessionId, P.point!, 'throwing-write', bound))).receipt;
    expect(hooks).toBe(1); expect(result.status).toBe('unavailable'); expect(result.point).toBeNull();
    const record = await store.read('run-A', 'operation:throwing-write');
    expect(record?.body['effects']).toMatchObject([{ tool: 'write', phase: 'intent' }, { tool: 'afterMutation:write', phase: 'completed', result: { text: 'failure check retained' } }]);
  });
  it('binds existing Script functions to durable tasks, handlers and designated submission', async () => {
    let scripts = 0; let calls = 0; let accepted = 0;
    const messages: string[] = []; const emitted: unknown[] = [];
    const agent = createScriptedAgent(spec => { scripts++; messages.push(spec.prompt); expect(spec.systemPrompt).toBe('Role A\nGeneral task protocol.'); return [{ kind: 'tool', tool: 'read', input: {} }, { kind: 'submit', input: { orientation: 'A' } }]; });
    const store = memoryStore(); const operations = agent.bindSessionStore(store); const P = await operations.create(create);
    const b = bindings({
      tools: [{ ...tools[0]!, execute: async () => { calls++; return { text: 'scripted read' }; } }],
      submission: { name: 'submit_orientation', accept: async (value, signal) => { accepted++; expect(signal.aborted).toBe(false); expect(value).toEqual({ orientation: 'A' }); return { accepted: true }; } },
      onEvent: event => { if (event.type === 'message' && event.role === 'user') emitted.push(event.blocks); },
    });
    const T1 = await (await operations.continue(continuation(P.sessionId, P.point!, 'one', b))).receipt;
    expect(T1.outcome).toEqual({ kind: 'submitted', input: { orientation: 'A' } });
    const next = { ...task, message: 'Assignment A' }; const nextBindings = { ...b, task: next };
    const T2 = await (await operations.continue(continuation(P.sessionId, T1.point!, 'two', nextBindings))).receipt;
    expect(T2.turn).toBe(2); expect(T2.outcome).toEqual({ kind: 'submitted', input: { orientation: 'A' } });
    // Script perception includes inherited model-visible text. Neither the
    // captured current spec nor the emitted user message redelivers that text.
    expect(messages).toEqual(['Orient A', 'Orient A\n\nAssignment A']);
    expect(agent.sessions.map(record => record.spec.prompt)).toEqual(['Orient A', 'Assignment A']);
    expect(emitted).toEqual([[{ type: 'text', text: 'Orient A' }], [{ type: 'text', text: 'Assignment A' }]]);
    expect(agent.sessions.map(record => ({ role: record.spec.role, cwd: record.spec.scope.workingDirectory, submission: record.spec.submission.name })))
      .toEqual(Array(2).fill({ role: 'architect', cwd: '/A', submission: 'submit_orientation' }));
    expect((await store.read('run-A', 'operation:one'))?.body['input']).toMatchObject({ task, policy });
    expect((await store.read('run-A', 'operation:two'))?.body['input']).toMatchObject({ task: next, policy });
    expect(await (await operations.retry({ runId: 'run-A', operationId: 'two', bindings: nextBindings })).receipt).toEqual(T2);
    expect(scripts).toBe(2); expect(calls).toBe(2); expect(accepted).toBe(2);
  });
  it('exposes the same lifecycle on the scripted factory', async () => {
    const agent = createScriptedAgent([], { sessionStore: memoryStore(), operationScript: [{ kind: 'submit', input: { orientation: 'A' } }] });
    const newlyBound = agent.bindSessionStore(memoryStore());
    expect((await newlyBound.create(create)).status).toBe('completed');
    const P = await agent.sessionOperations!.create(create);
    expect((await (await agent.sessionOperations!.continue(continuation(P.sessionId, P.point!, 't'))).receipt).outcome).toEqual({ kind: 'submitted', input: { orientation: 'A' } });
  });
});

describe('Plan 23 original execution observation identities', () => {
  it('prepares the durable original executing turn before every event and terminal lookup has zero effects', async () => {
    const prepared: unknown[] = []; const events: unknown[] = []; let dispatches = 0; let accepts = 0;
    const gate = deferred();
    const operations = createSessionOperations({ sessionStore: memoryStore(), driver: { async dispatch(input, runtime) {
      dispatches++; expect(prepared).toEqual([input.identity]);
      runtime.onEvent({ type: 'context-observed', tokens: null, window: 100 });
      const verdict = await runtime.submit('submit-original', { orientation: 'A' });
      return verdict.accepted ? { kind: 'submitted', input: { orientation: 'A' } } : { kind: 'ended' };
    } } });
    expect(await operations.operationIdentity('run-A', 'missing')).toBeNull();
    const P = await operations.create(create);
    const bound = bindings({ prepared: async value => { prepared.push(value); await gate.promise; },
      onEvent: event => events.push(event.execution), submission: { name: 'submit_orientation', accept: async () => { accepts++; return { accepted: true }; } } });
    const running = await operations.continue(continuation(P.sessionId, P.point!, 'original', bound));
    await flush(); expect(dispatches).toBe(0); expect(events).toEqual([]);
    const expected = { runId: 'run-A', operationId: 'original', sessionId: P.sessionId, turn: 1, sourcePoint: P.point };
    expect(await operations.operationIdentity('run-A', 'original')).toEqual(expected);
    gate.resolve(); const receipt = await running.receipt;
    expect(receipt.outcome?.kind).toBe('submitted'); expect(events).toEqual([expected]);
    const throwing = bindings({ prepared: async () => { throw new Error('terminal must not prepare'); }, onEvent: () => { throw new Error('terminal must not observe'); }, submission: { name: 'submit_orientation', accept: async () => { throw new Error('terminal must not accept twice'); } } });
    expect(await (await operations.retry({ runId: 'run-A', operationId: 'original', bindings: throwing })).receipt).toEqual(receipt);
    expect(await operations.operationIdentity('run-A', 'original')).toEqual(expected); expect(dispatches).toBe(1); expect(accepts).toBe(1);
  });
  it('keeps checkpoint and sibling origins distinct even where their next executing turn number is equal', async () => {
    const operations = createSessionOperations({ sessionStore: memoryStore(), driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const P = await operations.create(create); const first = await (await operations.continue(continuation(P.sessionId, P.point!, 'first'))).receipt;
    const C = await operations.appendContext({ runId: 'run-A', operationId: 'C', sessionId: P.sessionId, expectedPoint: first.point!, additions: [{ key: 'brief', kind: 'brief', revision: 'r1', text: 'B' }] });
    const L = await operations.fork({ runId: 'run-A', operationId: 'L', sourcePoint: first.point! });
    const R = await operations.fork({ runId: 'run-A', operationId: 'R', sourcePoint: C.point! });
    await (await operations.continue(continuation(L.sessionId, L.point!, 'left'))).receipt;
    await (await operations.continue(continuation(R.sessionId, R.point!, 'right'))).receipt;
    const left = await operations.operationIdentity('run-A', 'left'); const right = await operations.operationIdentity('run-A', 'right');
    expect(left?.turn).toBe(2); expect(right?.turn).toBe(2); expect(left?.sessionId).not.toBe(right?.sessionId); expect(left?.sourcePoint).toEqual(L.point); expect(right?.sourcePoint).toEqual(R.point);
    expect((await operations.inspect('run-A', L.sessionId))?.parent).toEqual(first.point); expect((await operations.inspect('run-A', R.sessionId))?.parent).toEqual(C.point);
  });
});
