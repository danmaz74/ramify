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
    const stopped = await operations.stop({ runId: 'run-A', operationId: 'delayed', sessionId: P.sessionId });
    expect(stopped.status).toBe('stopped'); expect(stopped.point).toBeNull(); expect(stopped.reason).toMatch(/unknown/);
    const settledRecord = await store.read('run-A', 'operation:delayed');
    late.resolve(); await new Promise(resolve => setTimeout(resolve, 10));
    expect(await handle.receipt).toEqual(stopped); expect(await store.read('run-A', 'operation:delayed')).toEqual(settledRecord); expect(accepted).toBe(0); expect(effects).toBe(1);
    expect(await (await operations.retry({ runId: 'run-A', operationId: 'delayed', bindings: bound })).receipt).toEqual(stopped);
    expect(await operations.inspect('run-A', P.sessionId)).toBeNull();
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
    let scripts = 0; let calls = 0; const messages: string[] = [];
    const agent = createScriptedAgent(spec => { scripts++; messages.push(spec.prompt); expect(spec.systemPrompt).toBe('Role A\nGeneral task protocol.'); return [{ kind: 'tool', tool: 'read', input: {} }, { kind: 'submit', input: { orientation: 'A' } }]; });
    const operations = agent.bindSessionStore(memoryStore()); const P = await operations.create(create);
    const b = bindings({ tools: [{ ...tools[0]!, execute: async () => { calls++; return { text: 'scripted read' }; } }] });
    const T1 = await (await operations.continue(continuation(P.sessionId, P.point!, 'one', b))).receipt;
    expect(T1.outcome).toEqual({ kind: 'submitted', input: { orientation: 'A' } });
    const next = { ...task, message: 'Assignment A' }; const nextBindings = { ...b, task: next };
    const T2 = await (await operations.continue(continuation(P.sessionId, T1.point!, 'two', nextBindings))).receipt;
    expect(T2.turn).toBe(2); expect(messages).toEqual(['Orient A', 'Assignment A']); expect(scripts).toBe(2); expect(calls).toBe(2);
  });
  it('exposes the same lifecycle on the scripted factory', async () => {
    const agent = createScriptedAgent([], { sessionStore: memoryStore(), operationScript: [{ kind: 'submit', input: { orientation: 'A' } }] });
    const newlyBound = agent.bindSessionStore(memoryStore());
    expect((await newlyBound.create(create)).status).toBe('completed');
    const P = await agent.sessionOperations!.create(create);
    expect((await (await agent.sessionOperations!.continue(continuation(P.sessionId, P.point!, 't'))).receipt).outcome).toEqual({ kind: 'submitted', input: { orientation: 'A' } });
  });
});
