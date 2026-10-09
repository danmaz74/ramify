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
  it('captures fresh JSON policy and declarations without losing literal text or prototype-shaped keys', async () => {
    const shared = { title: 'quote " slash \\ newline\n emoji 😀 lone \ud800', nested: [null, true, -0, { value: 'original' }] };
    const dictionary = Object.create(null) as Record<string, unknown>;
    dictionary['__proto__'] = { safe: true }; dictionary['constructor'] = 'literal';
    const capturedPolicy = { ...policy, validator: { shared, dictionary } };
    const declaration = { ...tools[0]!, inputSchema: { shared } };
    const operations = createSessionOperations({ sessionStore: memoryStore(), driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const P = await operations.create({ ...create, policy: capturedPolicy, declarations: [declaration], activate: ['read'] });
    expect(P.status).toBe('completed');
    shared.title = 'changed'; (shared.nested[3] as { value: string }).value = 'changed';
    (dictionary['__proto__'] as { safe: boolean }).safe = false;
    const expectedShared = { title: 'quote " slash \\ newline\n emoji 😀 lone \ud800', nested: [null, true, 0, { value: 'original' }] };
    const snapshot = (await operations.inspect('run-A', P.sessionId))!;
    expect(snapshot.policy.validator).toEqual({ shared: expectedShared, dictionary: { ['__proto__']: { safe: true }, constructor: 'literal' } });
    expect(snapshot.declarations[0]?.inputSchema).toEqual({ shared: expectedShared });
    expect(Object.getPrototypeOf(snapshot.policy.validator['dictionary'])).toBe(Object.prototype);
    expect(Object.is((snapshot.policy.validator['shared'] as typeof shared).nested[2], -0)).toBe(false);
    (snapshot.declarations[0]!.inputSchema['shared'] as typeof shared).title = 'returned snapshot changed';
    expect((await operations.inspect('run-A', P.sessionId))?.declarations[0]?.inputSchema).toEqual({ shared: expectedShared });
  });
  it('keeps captured tasks and effect intent separate from driver and handler mutations', async () => {
    const store = memoryStore(); let calls = 0;
    const originalTask = { ...task, environment: { ...task.environment, limits: { max: 10 } } };
    const callInput = { nested: { label: 'before handler' }, values: [1, 2] };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(input, runtime) {
      expect(input.task).toEqual(originalTask);
      (input.task.environment['limits'] as { max: number }).max = 999;
      expect(await runtime.callTool('read-copy', 'read', callInput)).toEqual({ text: 'known result' });
      return { kind: 'ended' };
    } } });
    const P = await operations.create(create);
    const bound = bindings({ task: originalTask, tools: [{ ...tools[0]!, execute: async () => {
      calls++; callInput.nested.label = 'handler changed'; callInput.values.push(3); return { text: 'known result' };
    } }] });
    const end = await (await operations.continue(continuation(P.sessionId, P.point!, 'copy-task', bound))).settled();
    expect(end.status).toBe('completed');
    expect((await store.read('run-A', 'operation:copy-task'))?.body).toMatchObject({ input: { task: { environment: { limits: { max: 10 } } } }, effects: [{ input: { nested: { label: 'before handler' }, values: [1, 2] }, phase: 'completed' }] });
    expect(await (await operations.retry({ runId: 'run-A', operationId: 'copy-task', bindings: bound })).receipt).toEqual(end);
    expect(calls).toBe(1);
  });
  it('refuses shared policy mutation during current-authority rebinding before dispatch', async () => {
    const store = memoryStore(); let dispatches = 0;
    const validator = { version: 1 }; const mutablePolicy = { ...policy, validator };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } } });
    const P = await operations.create({ ...create, policy: mutablePolicy });
    const bound = bindings({ policy: mutablePolicy, currentAuthority: async () => { validator.version = 2; return true; } });
    const end = await (await operations.continue(continuation(P.sessionId, P.point!, 'changed-policy', bound))).settled();
    expect(end).toMatchObject({ status: 'failed', outcome: { kind: 'failed', error: expect.stringContaining('bindings differ') } });
    expect(dispatches).toBe(0);
    expect((await store.read('run-A', 'operation:changed-policy'))?.body['input']).toMatchObject({ policy: { validator: { version: 1 } } });
  });
  it('preserves JSON normalization and single custom invocations when reading exotic stored policy', async () => {
    const store = memoryStore(); const base = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const P = await base.create(create); const stored = (await store.read('run-A', `session:${P.sessionId}`))!;
    let getters = 0; let conversions = 0; let proxyReads = 0;
    const custom = { toJSON() { conversions++; return { converted: 'once' }; } };
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { getters++; return 'getter once'; } });
    const inherited = Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, { own: 'retained' });
    const proxy = new Proxy({ value: 'proxy once' }, { get(target, name, receiver) { if (name === 'value') proxyReads++; return Reflect.get(target, name, receiver); } });
    const value = { omitted: undefined, callable: () => 'ignored', symbolic: Symbol('ignored'), sparse: [, undefined, NaN, Infinity, -Infinity], date: new Date('2026-01-02T03:04:05.000Z'), custom, accessor, inherited, proxy, [Symbol('own key')]: 'ignored' };
    const snapshot = stored.body['snapshot'] as Record<string, unknown>;
    const reader: SessionStore = { ...store, async read(runId, id) { return id === `session:${P.sessionId}` ? { ...stored, body: { ...stored.body, snapshot: { ...snapshot, policy: { ...policy, validator: value } } } } : store.read(runId, id); } };
    const restored = createSessionOperations({ sessionStore: reader, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    expect((await restored.inspect('run-A', P.sessionId))?.policy.validator).toEqual({ sparse: [null, null, null, null, null], date: '2026-01-02T03:04:05.000Z', custom: { converted: 'once' }, accessor: { value: 'getter once' }, inherited: { own: 'retained' }, proxy: { value: 'proxy once' } });
    expect({ getters, conversions, proxyReads }).toEqual({ getters: 1, conversions: 1, proxyReads: 1 });
  });
  it('retains original JSON rejection for cyclic or BigInt policy without committing a session', async () => {
    const store = memoryStore(); const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const cycle: Record<string, unknown> = {}; cycle['self'] = cycle;
    await expect(operations.create({ ...create, policy: { ...policy, validator: cycle } })).rejects.toThrow(/circular/i);
    await expect(operations.create({ ...create, policy: { ...policy, validator: { amount: 1n } } })).rejects.toThrow(/BigInt/);
    expect(await store.read('run-A', 'operation:create')).toBeNull();
  });
  it.each([
    { name: 'getter', make: (called: () => void) => Object.defineProperty({}, 'value', { enumerable: true, get() { called(); return 'original'; } }), expected: { value: 'original' } },
    { name: 'toJSON', make: (called: () => void) => ({ toJSON() { called(); return { value: 'original' }; } }), expected: { value: 'original' } },
    { name: 'Proxy', make: (called: () => void) => new Proxy({ value: 'original' }, { getPrototypeOf() { throw new Error('Proxy introspection is not JSON behavior'); }, get(target, name, receiver) { if (name === 'value') called(); return Reflect.get(target, name, receiver); } }), expected: { value: 'original' } },
  ])('uses original JSON behavior once for a first-position $name in stored policy', async ({ make, expected }) => {
    const store = memoryStore(); const base = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const P = await base.create(create); const stored = (await store.read('run-A', `session:${P.sessionId}`))!;
    let calls = 0; const value = make(() => { calls++; });
    const snapshot = stored.body['snapshot'] as Record<string, unknown>;
    const reader: SessionStore = { ...store, async read(runId, id) { return id === `session:${P.sessionId}` ? { ...stored, body: { ...stored.body, snapshot: { ...snapshot, policy: { ...policy, validator: { first: value } } } } } : store.read(runId, id); } };
    const restored = createSessionOperations({ sessionStore: reader, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    expect((await restored.inspect('run-A', P.sessionId))?.policy.validator).toEqual({ first: expected });
    expect(calls).toBe(1);
  });
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
    for (const patch of [{ runId: 'other' }, { id: 'operation:other' }, { body: { ...original.body, kind: 'invented' } }, { body: { ...original.body, kind: 'continue', snapshot: { ...(original.body['snapshot'] as object), currentPoint: { sessionId: original.body['sessionId'], turn: Number.MAX_SAFE_INTEGER, kind: 'turn', checkpoint: 'original' } } } }, { body: { ...original.body, snapshot: { ...(original.body['snapshot'] as object), currentPoint: { sessionId: original.body['sessionId'], turn: 0, kind: 'invented', checkpoint: '' } } } }]) {
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

describe('primitive string encoding with current owning bindings', () => {
  it('retains exact warmed wire bytes for escaped values and prototype-shaped keys while refusing changed content', async () => {
    const store = memoryStore();
    const literal = 'line\n"\\😀\ud800';
    const validator = { ['__proto__']: 'safe', ['quote"key']: literal };
    const input = { ...create, operationId: 'cache-create', initialInstructions: literal, declarations: [], activate: [], policy: { ...policy, validator } };
    const operations = createSessionOperations({ sessionStore: store, driver: createScriptedSessionDriver([{ kind: 'end' }]) });
    const P = await operations.create(input);
    expect(await operations.create(input)).toEqual(P);
    const snapshot = (await operations.inspect('run-A', P.sessionId))!;
    const bytes = (await store.getPayload(snapshot.transcript[0]!.payloadId))!;
    expect(new TextDecoder().decode(bytes)).toBe(String.raw`{"activate":[],"declarations":[],"initialInstructions":"line\n\"\\😀\ud800","operationId":"cache-create","policy":{"authority":{"write":true},"context":{"budgetFraction":null,"budgetTokens":null,"compaction":"forbidden","reportReserveTokens":0},"destination":{"record":"A"},"validator":{"__proto__":"safe","quote\"key":"line\n\"\\😀\ud800"}},"runId":"run-A"}`);
    validator['quote"key'] = 'changed';
    expect(await operations.create(input)).toMatchObject({ status: 'conflict' });
    expect((await operations.inspect('run-A', P.sessionId))?.policy.validator).toEqual({ ['__proto__']: 'safe', ['quote"key']: literal });
  });
  it('reads a warmed binding getter again after current authority changes its value', async () => {
    const store = memoryStore(); let value = 'accepted literal'; let reads = 0; let dispatches = 0; let revoke = false; let readsAtAuthority = 0;
    const validator = Object.defineProperty({}, 'literal', { enumerable: true, get() { reads++; return value; } });
    const capturedPolicy = { ...policy, validator };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } } });
    const P = await operations.create({ ...create, policy: capturedPolicy });
    const bound = bindings({ policy: capturedPolicy, currentAuthority: async () => { if (revoke) { readsAtAuthority = reads; value = 'revoked literal'; } return true; } });
    const warm = await (await operations.continue(continuation(P.sessionId, P.point!, 'warm-getter', bound))).settled();
    expect(warm.status).toBe('completed'); expect(dispatches).toBe(1);
    revoke = true;
    const refused = await (await operations.continue(continuation(P.sessionId, warm.point!, 'changed-getter', bound))).settled();
    expect(refused).toMatchObject({ status: 'failed', reason: expect.stringContaining('bindings differ') });
    expect(reads).toBeGreaterThan(readsAtAuthority); expect(dispatches).toBe(1);
    expect((await store.read('run-A', 'operation:changed-getter'))?.body).toMatchObject({ input: { policy: { validator: { literal: 'accepted literal' } } }, effects: [] });
  });
  it.each(['entry pressure', 'oversized value'])('retains changed-value refusal after warmed %s', async mode => {
    const store = memoryStore(); let dispatches = 0; let revoke = false;
    const original = mode === 'oversized value' ? `${'x'.repeat(600_000)}original` : 'retained selection';
    const validator = { selected: original, literals: mode === 'entry pressure' ? Array.from({ length: 1_100 }, (_, index) => `distinct-${index}`) : ['known'] };
    const capturedPolicy = { ...policy, validator };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch() { dispatches++; return { kind: 'ended' }; } } });
    const P = await operations.create({ ...create, policy: capturedPolicy });
    const bound = bindings({ policy: capturedPolicy, currentAuthority: async () => { if (revoke) validator.selected = `${original} changed`; return true; } });
    const warm = await (await operations.continue(continuation(P.sessionId, P.point!, 'warm-pressure', bound))).settled();
    expect(warm.status).toBe('completed'); expect(dispatches).toBe(1);
    revoke = true;
    const refused = await (await operations.continue(continuation(P.sessionId, warm.point!, 'changed-pressure', bound))).settled();
    expect(refused).toMatchObject({ status: 'failed', reason: expect.stringContaining('bindings differ') }); expect(dispatches).toBe(1);
    expect((await store.read('run-A', 'operation:changed-pressure'))?.body).toMatchObject({ input: { policy: { validator: { selected: original, literals: validator.literals } } }, effects: [] });
  });
});

describe('ordered opaque provider payload batches', () => {
  it('captures all caller bytes and keys, retains each authority check, and deduplicates in first-entry order', async () => {
    const store = memoryStore(); const put = store.putPayload; const persisted: string[] = []; let authorities = 0;
    store.putPayload = async bytes => { const text = new TextDecoder().decode(bytes); if (text === 'A' || text === 'B') persisted.push(text); return put(bytes); };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      const entries = [{ key: 'first', bytes: new TextEncoder().encode('A') }, { key: 'second', bytes: new TextEncoder().encode('B') }, { key: 'first', bytes: new TextEncoder().encode('A') }];
      const before = (await store.read('run-A', 'operation:batch'))!; const checked = authorities;
      const pending = runtime.persistPayloads!(entries);
      entries[0]!.key = 'changed'; entries[1]!.bytes.fill(88); entries.splice(2, 1);
      expect(await pending).toEqual(['QQ==', 'Qg==', 'QQ==']);
      expect(authorities - checked).toBe(4);
      const after = (await store.read('run-A', 'operation:batch'))!;
      expect(after.revision).toBe(before.revision + 1);
      expect(after.body['provider']).toEqual([{ key: 'first', payloadId: 'QQ==', kind: 'provider' }, { key: 'second', payloadId: 'Qg==', kind: 'provider' }]);
      expect(await runtime.persistPayloads!([{ key: 'first', bytes: new TextEncoder().encode('A') }])).toEqual(['QQ==']);
      const duplicate = (await store.read('run-A', 'operation:batch'))!;
      expect(duplicate.revision).toBe(after.revision + 1); expect(duplicate.body['provider']).toEqual(after.body['provider']);
      return { kind: 'ended' };
    } } });
    const P = await operations.create(create);
    expect((await (await operations.continue(continuation(P.sessionId, P.point!, 'batch', bindings({ currentAuthority: async () => { authorities++; return true; } })))).settled()).status).toBe('completed');
    expect(persisted).toEqual(['A', 'B', 'A', 'A']);
  });
  it.each(['within batch', 'already published', 'ambiguous stored keys'])('refuses conflicting immutable keys %s without publishing a prefix', async mode => {
    const store = memoryStore();
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      if (mode !== 'within batch') await runtime.persistPayload('same', new TextEncoder().encode('original'));
      const before = (await store.read('run-A', 'operation:conflict'))!;
      const read = store.read;
      if (mode === 'ambiguous stored keys') {
        const conflictingId = await store.putPayload(new TextEncoder().encode('conflict'));
        store.read = async (run, id) => {
          const record = await read(run, id);
          return record && id === 'operation:conflict' ? { ...record, body: { ...record.body, provider: [...record.body['provider'] as unknown[], { key: 'same', payloadId: conflictingId, kind: 'provider' }] } } : record;
        };
      }
      const batch = mode === 'within batch'
        ? [{ key: 'new', bytes: new TextEncoder().encode('first') }, { key: 'new', bytes: new TextEncoder().encode('conflict') }]
        : [{ key: 'new', bytes: new TextEncoder().encode('first') }, { key: 'same', bytes: new TextEncoder().encode('conflict') }];
      await expect(runtime.persistPayloads!(batch)).rejects.toThrow('Provider payload key conflicts');
      store.read = read;
      expect(await store.read('run-A', 'operation:conflict')).toEqual(before);
      return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const end = await (await operations.continue(continuation(P.sessionId, P.point!, 'conflict'))).settled();
    expect(end.status).toBe('completed');
    expect((await operations.inspect('run-A', P.sessionId))?.transcript.filter(entry => entry.kind === 'provider').map(entry => entry.key)).toEqual(mode === 'within batch' ? [] : ['same']);
  });
  it('keeps all references unpublished when a later durable payload fails and starts no dependent effect', async () => {
    const store = memoryStore(); const put = store.putPayload; let effects = 0;
    store.putPayload = async bytes => { if (new TextDecoder().decode(bytes) === 'second') throw new Error('Second payload failed'); return put(bytes); };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      await runtime.persistPayloads!([{ key: 'a', bytes: new TextEncoder().encode('first') }, { key: 'b', bytes: new TextEncoder().encode('second') }]);
      await runtime.callTool('unlicensed', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'failed-put', bound))).settled()).toMatchObject({ status: 'failed', reason: 'Second payload failed' });
    expect((await store.read('run-A', 'operation:failed-put'))?.body).toMatchObject({ provider: [], effects: [], quiescent: true });
    expect(await store.getPayload('Zmlyc3Q=')).toEqual(new TextEncoder().encode('first')); expect(effects).toBe(0);
  });
  it('rechecks current authority after the last awaited write before publishing any references', async () => {
    const store = memoryStore(); const put = store.putPayload; let allowed = true; let effects = 0;
    store.putPayload = async bytes => { const id = await put(bytes); if (new TextDecoder().decode(bytes) === 'last') allowed = false; return id; };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      await runtime.persistPayloads!([{ key: 'a', bytes: new TextEncoder().encode('first') }, { key: 'b', bytes: new TextEncoder().encode('last') }]);
      await runtime.callTool('unlicensed', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ currentAuthority: async () => allowed, tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'late-authority', bound))).settled()).toMatchObject({ status: 'failed', reason: 'Current authority denied operation' });
    expect((await store.read('run-A', 'operation:late-authority'))?.body).toMatchObject({ provider: [], effects: [], quiescent: true }); expect(effects).toBe(0);
  });
  it('retains the original owner/CAS boundary for complete batch publication', async () => {
    const store = memoryStore(); const commit = store.commit; let effects = 0;
    store.commit = async input => input.records.some(record => record.id === 'operation:cas-batch' && (record.body['provider'] as unknown[])?.length === 2)
      ? { kind: 'conflict', reason: 'Independent CAS loss' } : commit(input);
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      await runtime.persistPayloads!([{ key: 'a', bytes: new TextEncoder().encode('first') }, { key: 'b', bytes: new TextEncoder().encode('last') }]);
      await runtime.callTool('unlicensed', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'cas-batch', bound))).settled()).toMatchObject({ status: 'failed', reason: 'Independent CAS loss' });
    expect((await store.read('run-A', 'operation:cas-batch'))?.body).toMatchObject({ provider: [], effects: [], quiescent: true }); expect(effects).toBe(0);
  });
  it('drains an admitted ignored-signal batch after Stop without publishing late references', async () => {
    const entered = deferred(); const release = deferred(); const store = memoryStore(); const put = store.putPayload; const attempted: string[] = [];
    store.putPayload = async bytes => { const text = new TextDecoder().decode(bytes); if (text === 'first' || text === 'second') attempted.push(text); if (text === 'first') { entered.resolve(); await release.promise; } return put(bytes); };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      void runtime.persistPayloads!([{ key: 'a', bytes: new TextEncoder().encode('first') }, { key: 'b', bytes: new TextEncoder().encode('second') }]).catch(() => undefined);
      await entered.promise; return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const handle = await operations.continue(continuation(P.sessionId, P.point!, 'stopped-batch'));
    await entered.promise; const stopping = handle.stop(); const idle = handle.settled(); const idleEnded = observation(idle); const stopEnded = observation(stopping);
    const fenced = await handle.receipt; expect(fenced).toMatchObject({ status: 'stopped', point: null });
    await flush(); expect(idleEnded()).toBe(false); expect(stopEnded()).toBe(false);
    expect((await store.read('run-A', 'operation:stopped-batch'))?.body).toMatchObject({ provider: [] });
    release.resolve(); expect(await idle).toEqual(fenced); expect(await stopping).toEqual(fenced);
    expect(attempted).toEqual(['first']); expect((await store.read('run-A', 'operation:stopped-batch'))?.body).toMatchObject({ provider: [], quiescent: true });
  });
  it.each(['authority revoked', 'Stop'])('rebinds a queued batch only after publication ownership: %s', async reason => {
    const store = memoryStore(); const commit = store.commit; const put = store.putPayload;
    const owned = deferred(); const release = deferred(); const written = deferred(); let allowed = true; let authorities = 0; let baseline = 0;
    store.commit = async input => {
      if (input.records.some(record => record.id === 'operation:queued-batch' && (record.body['provider'] as { key: string }[])?.length === 1 && (record.body['provider'] as { key: string }[])[0]?.key === 'blocker' && record.body['phase'] === 'dispatched')) { owned.resolve(); await release.promise; }
      return commit(input);
    };
    store.putPayload = async bytes => { const id = await put(bytes); if (new TextDecoder().decode(bytes) === 'last') written.resolve(); return id; };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      const first = runtime.persistPayload('blocker', new TextEncoder().encode('blocker'));
      await owned.promise; baseline = authorities;
      const batch = runtime.persistPayloads!([{ key: 'a', bytes: new TextEncoder().encode('first') }, { key: 'b', bytes: new TextEncoder().encode('last') }]);
      const outcomes = await Promise.allSettled([first, batch]);
      expect(outcomes[1]).toMatchObject({ status: 'rejected' }); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ currentAuthority: async () => { authorities++; return allowed; } });
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'queued-batch', bound));
    await written.promise; await flush(); expect(authorities - baseline).toBe(2);
    const stopping = reason === 'Stop' ? handle.stop() : null; if (reason === 'authority revoked') allowed = false;
    release.resolve(); const receipt = await handle.settled(); if (stopping) expect(await stopping).toEqual(receipt);
    expect(receipt.status).toBe(reason === 'Stop' ? 'stopped' : 'completed');
    expect((await store.read('run-A', 'operation:queued-batch'))?.body).toMatchObject({ provider: [{ key: 'blocker' }], quiescent: true });
  });
});

describe('batch-local immutable authority with final durable fencing', () => {
  it('retains every authority call and actual put while reading the full operation only at the batch boundaries and publication', async () => {
    const store = memoryStore(); const read = store.read; const put = store.putPayload;
    let inBatch = false; let reads = 0; let authorities = 0; let puts = 0;
    store.read = async (run, id) => { if (inBatch && id === 'operation:bounded-reads') reads++; return read(run, id); };
    store.putPayload = async bytes => { if (inBatch) puts++; return put(bytes); };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      const entries = ['A', 'B', 'C', 'D'].map(key => ({ key, bytes: new TextEncoder().encode(key) }));
      inBatch = true;
      const ids = await runtime.persistPayloads!(entries);
      expect(ids).toEqual(['QQ==', 'Qg==', 'Qw==', 'RA==']); expect({ reads, authorities, puts }).toEqual({ reads: 3, authorities: 5, puts: 4 });
      const first = (await read('run-A', 'operation:bounded-reads'))!;
      reads = authorities = puts = 0;
      expect(await runtime.persistPayloads!(entries)).toEqual(ids);
      expect({ reads, authorities, puts }).toEqual({ reads: 3, authorities: 5, puts: 4 });
      expect((await read('run-A', 'operation:bounded-reads'))?.revision).toBe(first.revision + 1);
      reads = authorities = puts = 0;
      expect(await runtime.persistPayloads!([])).toEqual([]);
      expect({ reads, authorities, puts }).toEqual({ reads: 2, authorities: 1, puts: 0 });
      expect((await read('run-A', 'operation:bounded-reads'))?.revision).toBe(first.revision + 2);
      inBatch = false; return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ currentAuthority: async () => { if (inBatch) authorities++; return true; } });
    expect((await (await operations.continue(continuation(P.sessionId, P.point!, 'bounded-reads', bound))).settled()).status).toBe('completed');
    expect((await store.read('run-A', 'operation:bounded-reads'))?.body).toMatchObject({ provider: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }], effects: [], quiescent: true });
  });
  it('refuses an authority callback that changes its argument and bindings together before the first immutable write', async () => {
    const store = memoryStore(); const put = store.putPayload; let inBatch = false; let puts = 0; let effects = 0;
    const validator = { literal: 'original' }; const boundPolicy = { ...policy, validator };
    store.putPayload = async bytes => { if (inBatch) puts++; return put(bytes); };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      inBatch = true; await runtime.persistPayloads!([{ key: 'A', bytes: new TextEncoder().encode('A') }]);
      await runtime.callTool('forbidden', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create({ ...create, policy: boundPolicy });
    const bound = bindings({ policy: boundPolicy, currentAuthority: async (_, original) => { if (inBatch) { expect(original.validator).toEqual({ literal: 'original' }); (original.validator as { literal: string }).literal = 'changed'; validator.literal = 'changed'; } return true; }, tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'joint-mutation', bound))).settled()).toMatchObject({ status: 'failed', reason: expect.stringContaining('bindings differ') });
    expect(puts).toBe(0); expect(effects).toBe(0);
    expect((await store.read('run-A', 'operation:joint-mutation'))?.body).toMatchObject({ input: { policy: { validator: { literal: 'original' } } }, provider: [], effects: [] });
  });
  it('supplies independent original callback arguments even when earlier callbacks mutate their copies', async () => {
    const store = memoryStore(); let inBatch = false; const seenTasks = new Set<SessionTaskInput>(); const seenPolicies = new Set<SessionExecutionPolicy>();
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      inBatch = true; await runtime.persistPayloads!([{ key: 'A', bytes: new TextEncoder().encode('A') }, { key: 'B', bytes: new TextEncoder().encode('B') }]);
      inBatch = false; return { kind: 'ended' };
    } } });
    const P = await operations.create(create);
    const bound = bindings({ currentAuthority: async (originalTask, originalPolicy) => {
      if (inBatch) {
        expect(originalTask).toEqual(task); expect(originalPolicy).toEqual(policy); expect(seenTasks.has(originalTask)).toBe(false); expect(seenPolicies.has(originalPolicy)).toBe(false);
        seenTasks.add(originalTask); seenPolicies.add(originalPolicy);
        (originalTask as { message: string }).message = 'callback-only change'; (originalPolicy.validator as { version: number }).version = 999;
      }
      return true;
    } });
    expect((await (await operations.continue(continuation(P.sessionId, P.point!, 'argument-copies', bound))).settled()).status).toBe('completed');
    expect(seenTasks.size).toBe(3); expect(seenPolicies.size).toBe(3);
    expect((await store.read('run-A', 'operation:argument-copies'))?.body).toMatchObject({ input: { task, policy }, provider: [{ key: 'A' }, { key: 'B' }] });
  });
  it('rejects a fresh nested binding change between entries while retaining only an orphan first blob', async () => {
    const store = memoryStore(); const put = store.putPayload; const validator = { version: 1 }; const boundPolicy = { ...policy, validator }; let effects = 0;
    store.putPayload = async bytes => { const id = await put(bytes); if (new TextDecoder().decode(bytes) === 'first') validator.version = 2; return id; };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      await runtime.persistPayloads!([{ key: 'A', bytes: new TextEncoder().encode('first') }, { key: 'B', bytes: new TextEncoder().encode('second') }]);
      await runtime.callTool('forbidden', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create({ ...create, policy: boundPolicy }); const bound = bindings({ policy: boundPolicy, tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'between-entries', bound))).settled()).toMatchObject({ status: 'failed', reason: expect.stringContaining('bindings differ') });
    expect(await store.getPayload('Zmlyc3Q=')).toEqual(new TextEncoder().encode('first')); expect(await store.getPayload('c2Vjb25k')).toBeNull(); expect(effects).toBe(0);
    expect((await store.read('run-A', 'operation:between-entries'))?.body).toMatchObject({ provider: [], effects: [] });
  });
  it.each(['remote owner', 'remote terminal'])('permits orphan intermediate bytes but refuses all publication after %s loss', async mode => {
    const store = memoryStore(); const put = store.putPayload; let effects = 0; const events: unknown[] = [];
    store.putPayload = async bytes => {
      const id = await put(bytes);
      if (new TextDecoder().decode(bytes) === 'first') {
        const prior = (await store.read('run-A', 'operation:remote-loss'))!;
        const changed = mode === 'remote owner' ? { ...prior.body, owner: { token: 'other-owner', pid: 999999 } } : { ...prior.body, phase: 'terminal', receipt: { runId: 'run-A', operationId: 'remote-loss', sessionId: prior.body['sessionId'], turn: 1, point: null, status: 'stopped', outcome: { kind: 'stopped' }, reason: 'Remote terminal fence' } };
        expect(await store.commit({ runId: 'run-A', expected: [{ id: prior.id, revision: prior.revision }], records: [{ ...prior, revision: prior.revision + 1, body: changed }], payloads: [] })).toEqual({ kind: 'committed' });
      }
      return id;
    };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      await runtime.persistPayloads!([{ key: 'A', bytes: new TextEncoder().encode('first') }, { key: 'B', bytes: new TextEncoder().encode('second') }]);
      runtime.onEvent({ type: 'context-observed', tokens: 1, window: 10 }); await runtime.callTool('forbidden', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ onEvent: event => events.push(event), tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'remote-loss', bound));
    expect(await handle.receipt).toMatchObject(mode === 'remote owner' ? { status: 'failed', reason: expect.stringContaining('ownership lost') } : { status: 'stopped', point: null, reason: 'Remote terminal fence' });
    if (mode === 'remote owner') await expect(handle.settled()).rejects.toThrow('Cannot attest quiescence without the original terminal owner');
    else expect((await handle.settled()).status).toBe('stopped');
    expect(await store.getPayload('Zmlyc3Q=')).toEqual(new TextEncoder().encode('first')); expect(await store.getPayload('c2Vjb25k')).toEqual(new TextEncoder().encode('second'));
    expect((await store.read('run-A', 'operation:remote-loss'))?.body).toMatchObject({ provider: [], effects: [] }); expect(events).toEqual([]); expect(effects).toBe(0);
  });
  it.each(['before final read', 'during final authority'])('rejects replacement durable input %s rather than publishing under a changed original', async stage => {
    const store = memoryStore(); const put = store.putPayload; let inBatch = false; let authorities = 0; let effects = 0;
    const boundTask = { ...task }; const replacement = { ...task, message: 'Unlicensed replacement' };
    const replace = async () => {
      const prior = (await store.read('run-A', 'operation:input-swap'))!;
      await store.commit({ runId: 'run-A', expected: [{ id: prior.id, revision: prior.revision }], records: [{ ...prior, revision: prior.revision + 1, body: { ...prior.body, input: { ...(prior.body['input'] as Record<string, unknown>), task: replacement } } }], payloads: [] });
    };
    store.putPayload = async bytes => { const id = await put(bytes); if (new TextDecoder().decode(bytes) === 'last' && stage === 'before final read') { await replace(); boundTask.message = replacement.message; } return id; };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      inBatch = true; await runtime.persistPayloads!([{ key: 'A', bytes: new TextEncoder().encode('first') }, { key: 'B', bytes: new TextEncoder().encode('last') }]);
      await runtime.callTool('forbidden', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ task: boundTask, currentAuthority: async () => { if (inBatch && ++authorities === 3 && stage === 'during final authority') await replace(); return true; }, tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    expect(await (await operations.continue(continuation(P.sessionId, P.point!, 'input-swap', bound))).settled()).toMatchObject({ status: 'failed', reason: 'Batch original input changed' });
    expect((await store.read('run-A', 'operation:input-swap'))?.body).toMatchObject({ input: { task: replacement }, provider: [], effects: [] }); expect(effects).toBe(0);
    expect(authorities).toBe(stage === 'before final read' ? 2 : 3);
  });
  it('retains final storage corruption as unavailable settlement evidence without committing references or a fabricated receipt', async () => {
    const store = memoryStore(); const read = store.read; const put = store.putPayload; let corrupt = false; let effects = 0;
    store.read = async (run, id) => { if (corrupt && id === 'operation:corrupt-final') throw new Error('Original physical storage corruption'); return read(run, id); };
    store.putPayload = async bytes => { const id = await put(bytes); if (new TextDecoder().decode(bytes) === 'last') corrupt = true; return id; };
    const operations = createSessionOperations({ sessionStore: store, driver: { async dispatch(_, runtime) {
      await runtime.persistPayloads!([{ key: 'A', bytes: new TextEncoder().encode('first') }, { key: 'B', bytes: new TextEncoder().encode('last') }]);
      await runtime.callTool('forbidden', 'read', {}); return { kind: 'ended' };
    } } });
    const P = await operations.create(create); const bound = bindings({ tools: [{ ...tools[0]!, execute: async () => { effects++; return { text: 'unexpected' }; } }] });
    const handle = await operations.continue(continuation(P.sessionId, P.point!, 'corrupt-final', bound));
    await expect(handle.receipt).rejects.toThrow('Original physical storage corruption'); await expect(handle.settled()).rejects.toThrow('Original physical storage corruption');
    expect((await read('run-A', 'operation:corrupt-final'))?.body).toMatchObject({ provider: [], effects: [], phase: 'dispatched', receipt: null }); expect(effects).toBe(0);
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
