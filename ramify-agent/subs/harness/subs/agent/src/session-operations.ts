import { randomUUID } from 'node:crypto';
import { SessionDriverUnavailableError } from './interfaces/session-operations.js';
import type { GuardedCall, SessionOutcome, SubmissionVerdict, ToolResult } from './interfaces/port.js';
import type {
  AgentSessionPoint, AgentSessionSnapshot, ContinueSessionInput, SessionEffectRecord, SessionExecutionBindings,
  SessionOperationHandle, SessionOperationKey, SessionOperationReceipt, SessionOperations, SessionOperationsOptions,
  SessionStoreRecord, SessionTaskInput, SessionToolChange, SessionTranscriptEntry,
} from './interfaces/session-operations.js';

type Snapshot = AgentSessionSnapshot;
interface SessionBody { snapshot: Snapshot; points: Snapshot[] }
interface OperationBody {
  kind: string; input: Record<string, unknown>; sessionId: string; snapshot: Snapshot;
  effects: SessionEffectRecord[]; provider: SessionTranscriptEntry[];
  owner: { token: string; pid: number } | null;
  phase: 'intent' | 'dispatched' | 'terminal'; receipt: SessionOperationReceipt | null;
}
interface Active { abort: AbortController; handle: SessionOperationHandle; stop: () => Promise<SessionOperationReceipt> }
const operationRecordId = (id: string) => `operation:${id}`;
const sessionRecordId = (id: string) => `session:${id}`;
const liveOwnerTokens = new Set<string>();
const ownerControllers = new Map<string, AbortController>();
const emptyChange: SessionToolChange = { add: [], activate: [], inactivate: [] };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Canonical JSON binds content, rather than trusting caller-supplied identity strings. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const result = JSON.stringify(value);
    if (result === undefined) throw new TypeError('Session input must be JSON');
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

/** Durable provider-independent session lifecycle. The harness injects all persistence. */
export function createSessionOperations(options: SessionOperationsOptions): SessionOperations {
  const store = options.sessionStore;
  const active = new Map<string, Active>();
  const activeKey = (key: SessionOperationKey) => canonical([key.runId, key.operationId]);
  const record = (key: SessionOperationKey, id: string, revision: number, body: unknown, session: boolean): SessionStoreRecord => ({
    runId: key.runId, id, revision, schema: session ? 'ramify-agent.session/1' : 'ramify-agent.session-operation/1', body: clone(body) as Record<string, unknown>,
  });
  async function readOperation(key: SessionOperationKey): Promise<{ record: SessionStoreRecord; body: OperationBody } | null> {
    const found = await store.read(key.runId, operationRecordId(key.operationId));
    if (found === null) return null;
    if (found.schema !== 'ramify-agent.session-operation/1') throw new Error('Unsupported session operation schema');
    const body = clone(found.body) as unknown as OperationBody;
    if (!['intent', 'dispatched', 'terminal'].includes(body.phase) || typeof body.sessionId !== 'string' || !Array.isArray(body.effects) || !Array.isArray(body.provider)) throw new Error('Corrupt session operation');
    return { record: found, body };
  }
  async function readSession(runId: string, sessionId: string): Promise<{ record: SessionStoreRecord; body: SessionBody } | null> {
    const found = await store.read(runId, sessionRecordId(sessionId));
    if (found === null) return null;
    if (found.schema !== 'ramify-agent.session/1') throw new Error('Unsupported session schema');
    const body = clone(found.body) as unknown as SessionBody;
    if (!body.snapshot || body.snapshot.sessionId !== sessionId || body.snapshot.runId !== runId || !Array.isArray(body.points)) throw new Error('Corrupt session envelope');
    return { record: found, body };
  }
  async function verifyPayloads(snapshot: Snapshot): Promise<void> {
    for (const entry of snapshot.transcript) if (await store.getPayload(entry.payloadId) === null) throw new SessionDriverUnavailableError(`Unavailable transcript payload ${entry.payloadId}`);
  }
  function receipt(key: SessionOperationKey, sessionId: string, status: SessionOperationReceipt['status'], reason: string | null, point: AgentSessionPoint | null = null, outcome: SessionOutcome | null = null, turn: number | null = null): SessionOperationReceipt {
    return { runId: key.runId, operationId: key.operationId, sessionId, status, reason, point, outcome, turn };
  }
  function point(sessionId: string, turn: number, kind: AgentSessionPoint['kind']): AgentSessionPoint { return { sessionId, turn, kind, checkpoint: randomUUID() }; }
  async function payload(key: string, value: unknown): Promise<SessionTranscriptEntry> {
    return { key, kind: 'agent', payloadId: await store.putPayload(new TextEncoder().encode(canonical(value))) };
  }
  function prepare(snapshot: Snapshot, additions: Snapshot['additions'], change: SessionToolChange): Snapshot {
    const declarations = [...snapshot.declarations];
    for (const declaration of change.add) {
      const prior = declarations.find(item => item.name === declaration.name);
      if (prior && !equal(prior, declaration)) throw new Error(`Tool definition conflicts for ${declaration.name}`);
      if (!prior) declarations.push(clone(declaration));
    }
    const activeTools = new Set(snapshot.activeTools);
    for (const name of change.activate) {
      if (!declarations.some(item => item.name === name)) throw new Error(`Unknown tool ${name}`);
      activeTools.add(name);
    }
    for (const name of change.inactivate) activeTools.delete(name);
    const contexts = [...snapshot.additions];
    for (const addition of additions) {
      const prior = contexts.find(item => item.key === addition.key);
      if (prior && !equal(prior, addition)) throw new Error(`Context key conflicts for ${addition.key}`);
      if (!prior) contexts.push(clone(addition));
    }
    return { ...snapshot, declarations, activeTools: [...activeTools], additions: contexts };
  }
  async function terminalDuplicate(key: SessionOperationKey, input: Record<string, unknown>): Promise<SessionOperationReceipt | null> {
    const prior = await readOperation(key);
    if (prior === null) return null;
    if (!equal(prior.body.input, input)) return receipt(key, prior.body.sessionId, 'conflict', 'Operation key binds different input');
    return prior.body.receipt ?? receipt(key, prior.body.sessionId, 'conflict', 'Operation already active; use Retry');
  }
  async function commitSimple(key: SessionOperationKey, input: Record<string, unknown>, kind: string, snapshot: Snapshot, sessionPrior: Awaited<ReturnType<typeof readSession>>, turn: number | null): Promise<SessionOperationReceipt> {
    const result = receipt(key, snapshot.sessionId, 'completed', null, snapshot.currentPoint, null, turn);
    const op: OperationBody = { kind, input, sessionId: snapshot.sessionId, snapshot, effects: [], provider: [], owner: null, phase: 'terminal', receipt: result };
    const records = [record(key, operationRecordId(key.operationId), 1, op, false), record(key, sessionRecordId(snapshot.sessionId), (sessionPrior?.record.revision ?? 0) + 1, { snapshot, points: [...(sessionPrior?.body.points ?? []), snapshot] }, true)];
    const committed = await store.commit({ runId: key.runId, expected: [{ id: records[0]!.id, revision: null }, { id: records[1]!.id, revision: sessionPrior?.record.revision ?? null }], records, payloads: snapshot.transcript.map(entry => entry.payloadId) });
    if (committed.kind === 'conflict') return await terminalDuplicate(key, input) ?? receipt(key, snapshot.sessionId, 'conflict', committed.reason);
    return clone(result);
  }
  const api: SessionOperations = {
    async create(input) {
      const frozen = clone(input) as unknown as Record<string, unknown>;
      const duplicate = await terminalDuplicate(input, frozen); if (duplicate) return duplicate;
      const sessionId = randomUUID();
      let snapshot: Snapshot = { runId: input.runId, sessionId, parent: null, currentPoint: point(sessionId, 0, 'checkpoint'), initialInstructions: input.initialInstructions, policy: clone(input.policy), declarations: [], activeTools: [], additions: [], transcript: [], activeOperation: null, available: true };
      try { snapshot = prepare(snapshot, [], { add: input.declarations, activate: input.activate, inactivate: [] }); }
      catch (error) { return receipt(input, sessionId, 'conflict', errorText(error)); }
      snapshot = { ...snapshot, transcript: [await payload(`create:${input.operationId}`, frozen)] };
      return commitSimple(input, frozen, 'create', snapshot, null, null);
    },
    async fork(input) {
      const frozen = clone(input) as unknown as Record<string, unknown>;
      const duplicate = await terminalDuplicate(input, frozen); if (duplicate) return duplicate;
      const source = await api.inspect(input.runId, input.sourcePoint.sessionId, input.sourcePoint);
      if (!source) return receipt(input, input.sourcePoint.sessionId, 'unavailable', 'Source point unavailable');
      const sessionId = randomUUID();
      const child: Snapshot = { ...source, sessionId, parent: clone(input.sourcePoint), currentPoint: point(sessionId, source.currentPoint.turn, 'checkpoint'), activeOperation: null };
      return commitSimple(input, frozen, 'fork', child, null, null);
    },
    async appendContext(input) { return change(input, 'append', input.additions, emptyChange); },
    async changeTools(input) { return change(input, 'tools', [], input.toolChange); },
    async continue(input) {
      const { bindings: _bindings, ...serializable } = input;
      const frozen = clone(serializable) as unknown as Record<string, unknown>;
      const prior = await terminalDuplicate(input, frozen);
      if (prior) return completedHandle(prior);
      const loaded = await readSession(input.runId, input.sessionId);
      if (!loaded || !loaded.body.snapshot.available) return completedHandle(receipt(input, input.sessionId, 'unavailable', 'Session unavailable'));
      if (loaded.body.snapshot.activeOperation !== null || !equal(loaded.body.snapshot.currentPoint, input.expectedPoint)) return completedHandle(receipt(input, input.sessionId, 'conflict', 'Expected point is stale or session active'));
      let snapshot: Snapshot;
      try {
        validateBindings(input.task, input.policy, input.bindings);
        await verifyPayloads(loaded.body.snapshot);
        snapshot = prepare(loaded.body.snapshot, input.additions, input.toolChange);
        if (!snapshot.activeTools.includes(input.task.submissionTool)) throw new Error('Designated submission tool is inactive');
        snapshot = { ...snapshot, policy: clone(input.policy), activeOperation: input.operationId, transcript: [...snapshot.transcript, await payload(`prepare:${input.operationId}`, frozen)] };
      } catch (error) { return completedHandle(receipt(input, input.sessionId, error instanceof SessionDriverUnavailableError ? 'unavailable' : 'conflict', errorText(error))); }
      const op: OperationBody = { kind: 'continue', input: frozen, sessionId: input.sessionId, snapshot, effects: [], provider: [], owner: null, phase: 'intent', receipt: null };
      const committed = await store.commit({ runId: input.runId, expected: [{ id: operationRecordId(input.operationId), revision: null }, { id: loaded.record.id, revision: loaded.record.revision }], records: [record(input, operationRecordId(input.operationId), 1, op, false), record(input, loaded.record.id, loaded.record.revision + 1, { ...loaded.body, snapshot }, true)], payloads: snapshot.transcript.map(entry => entry.payloadId) });
      if (committed.kind === 'conflict') return completedHandle(await terminalDuplicate(input, frozen) ?? receipt(input, input.sessionId, 'conflict', committed.reason));
      return launch(input, input.bindings, false);
    },
    async retry(input) {
      const prior = await readOperation(input);
      if (!prior) return completedHandle(receipt(input, '', 'unavailable', 'Operation intent missing'));
      // Terminal lookup deliberately precedes bindings and old expected point checks.
      if (prior.body.receipt) return completedHandle(prior.body.receipt);
      if (prior.body.kind !== 'continue') return completedHandle(receipt(input, prior.body.sessionId, 'unavailable', 'Operation is not resumable'));
      const original = prior.body.input as unknown as Omit<ContinueSessionInput, 'bindings'>;
      try { validateBindings(original.task, original.policy, input.bindings); }
      catch (error) { return completedHandle(receipt(input, prior.body.sessionId, 'conflict', errorText(error))); }
      const running = active.get(activeKey(input)); if (running) return running.handle;
      return launch(input, input.bindings, true);
    },
    async stop(input) {
      const prior = await readOperation(input);
      if (!prior || prior.body.sessionId !== input.sessionId) return receipt(input, input.sessionId, 'unavailable', 'Active operation missing');
      if (prior.body.receipt) return clone(prior.body.receipt);
      const running = active.get(activeKey(input));
      if (running) return running.stop();
      return settle(input, { kind: 'stopped' }, 'Stopped during recovery');
    },
    async inspect(runId, sessionId, expectedPoint) {
      const loaded = await readSession(runId, sessionId);
      if (!loaded) return null;
      const snapshot = expectedPoint ? loaded.body.points.find(item => equal(item.currentPoint, expectedPoint)) : loaded.body.snapshot;
      if (!snapshot || !snapshot.available) return null;
      try { await verifyPayloads(snapshot); } catch (error) { if (error instanceof SessionDriverUnavailableError) return null; throw error; }
      return clone(snapshot);
    },
  };
  async function change(input: SessionOperationKey & { sessionId: string; expectedPoint: AgentSessionPoint }, kind: string, additions: Snapshot['additions'], toolChange: SessionToolChange): Promise<SessionOperationReceipt> {
    const frozen = clone(input) as unknown as Record<string, unknown>;
    const duplicate = await terminalDuplicate(input, frozen); if (duplicate) return duplicate;
    const loaded = await readSession(input.runId, input.sessionId);
    if (!loaded || !loaded.body.snapshot.available) return receipt(input, input.sessionId, 'unavailable', 'Session unavailable');
    if (loaded.body.snapshot.activeOperation !== null || !equal(input.expectedPoint, loaded.body.snapshot.currentPoint)) return receipt(input, input.sessionId, 'conflict', 'Expected point is stale or session active');
    let snapshot: Snapshot;
    try { await verifyPayloads(loaded.body.snapshot); snapshot = prepare(loaded.body.snapshot, additions, toolChange); }
    catch (error) { return receipt(input, input.sessionId, error instanceof SessionDriverUnavailableError ? 'unavailable' : 'conflict', errorText(error)); }
    snapshot = { ...snapshot, currentPoint: point(input.sessionId, snapshot.currentPoint.turn, 'checkpoint'), transcript: [...snapshot.transcript, await payload(`${kind}:${input.operationId}`, frozen)] };
    return commitSimple(input, frozen, kind, snapshot, loaded, null);
  }
  function validateBindings(task: SessionTaskInput, policy: Snapshot['policy'], bindings: SessionExecutionBindings): void {
    if (!equal(task, bindings.task) || !equal(policy, bindings.policy) || bindings.submission.name !== task.submissionTool) throw new Error('Retry/task bindings differ from immutable task, environment, policy, validator or destination');
  }
  function completedHandle(value: SessionOperationReceipt): SessionOperationHandle {
    const result = Promise.resolve(clone(value));
    return { receipt: result, outcome: result.then(item => item.outcome), stop: () => result, settled: () => result };
  }
  // The durable operation revision fences every callback, including another recovering writer.
  async function updateOperation(key: SessionOperationKey, work: (body: OperationBody) => OperationBody, ownerToken?: string): Promise<OperationBody> {
    const prior = await readOperation(key);
    if (!prior || prior.body.phase === 'terminal') throw new Error('Operation fenced after settlement');
    if (ownerToken && prior.body.owner?.token !== ownerToken) throw new Error('Execution ownership lost');
    const body = work(prior.body);
    const committed = await store.commit({ runId: key.runId, expected: [{ id: prior.record.id, revision: prior.record.revision }], records: [record(key, prior.record.id, prior.record.revision + 1, body, false)], payloads: [...body.snapshot.transcript, ...body.provider].map(item => item.payloadId) });
    if (committed.kind === 'conflict') throw new Error(committed.reason);
    return body;
  }
  async function settle(key: SessionOperationKey, outcome: SessionOutcome, reason: string | null = null, unavailable = false): Promise<SessionOperationReceipt> {
    const op = await readOperation(key); if (!op) throw new Error('Missing operation intent');
    if (op.body.receipt) return clone(op.body.receipt);
    const loaded = await readSession(key.runId, op.body.sessionId); if (!loaded) throw new Error('Missing active session');
    const uncertain = op.body.effects.some(effect => effect.phase === 'intent');
    const interruptedProvider = outcome.kind === 'stopped' && op.body.phase === 'dispatched';
    const available = !unavailable && !uncertain && !interruptedProvider;
    const currentPoint = point(op.body.sessionId, op.body.snapshot.currentPoint.turn + 1, 'turn');
    const snapshot: Snapshot = { ...op.body.snapshot, currentPoint, transcript: [...op.body.snapshot.transcript, ...op.body.provider], activeOperation: null, available };
    const status = unavailable ? 'unavailable' : outcome.kind === 'stopped' ? 'stopped' : uncertain ? 'unavailable' : outcome.kind === 'failed' ? 'failed' : 'completed';
    const result = receipt(key, op.body.sessionId, status, uncertain ? 'External effect completion unknown; point unavailable' : interruptedProvider ? 'Provider completion interrupted; point unavailable' : reason, available ? currentPoint : null, outcome, currentPoint.turn);
    const terminal: OperationBody = { ...op.body, phase: 'terminal', receipt: result };
    const committed = await store.commit({ runId: key.runId, expected: [{ id: op.record.id, revision: op.record.revision }, { id: loaded.record.id, revision: loaded.record.revision }], records: [record(key, op.record.id, op.record.revision + 1, terminal, false), record(key, loaded.record.id, loaded.record.revision + 1, { snapshot, points: available ? [...loaded.body.points, snapshot] : loaded.body.points }, true)], payloads: snapshot.transcript.map(item => item.payloadId) });
    if (committed.kind === 'conflict') { const winner = await readOperation(key); if (winner?.body.receipt) return clone(winner.body.receipt); throw new Error(committed.reason); }
    if (op.body.owner) { liveOwnerTokens.delete(op.body.owner.token); ownerControllers.get(op.body.owner.token)?.abort(); ownerControllers.delete(op.body.owner.token); }
    return clone(result);
  }
  async function launch(key: SessionOperationKey, bindings: SessionExecutionBindings, recovering: boolean): Promise<SessionOperationHandle> {
    key = { runId: key.runId, operationId: key.operationId };
    const running = active.get(activeKey(key)); if (running) return running.handle;
    const previous = await readOperation(key);
    if (!previous) return completedHandle(receipt(key, '', 'unavailable', 'Missing operation intent'));
    if (previous.body.receipt) return completedHandle(previous.body.receipt);
    const held = previous.body.owner;
    if (held) {
      let live: boolean;
      if (options.isExecutionOwnerAlive) live = await options.isExecutionOwnerAlive(held);
      else if (held.pid === process.pid) live = liveOwnerTokens.has(held.token);
      else {
        try { process.kill(held.pid, 0); live = true; }
        catch (error) { live = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
      }
      if (live) return completedHandle(receipt(key, previous.body.sessionId, 'conflict', 'Operation has a live execution owner'));
    }
    const owner = { token: randomUUID(), pid: process.pid };
    liveOwnerTokens.add(owner.token);
    try {
      const claimed = await store.commit({ runId: key.runId, expected: [{ id: previous.record.id, revision: previous.record.revision }], records: [record(key, previous.record.id, previous.record.revision + 1, { ...previous.body, owner }, false)], payloads: [...previous.body.snapshot.transcript, ...previous.body.provider].map(item => item.payloadId) });
      if (claimed.kind === 'conflict') { liveOwnerTokens.delete(owner.token); return completedHandle(receipt(key, previous.body.sessionId, 'conflict', 'Execution claim raced another operation')); }
    } catch (error) { liveOwnerTokens.delete(owner.token); throw error; }
    const abort = new AbortController();
    ownerControllers.set(owner.token, abort);
    let queue: Promise<unknown> = Promise.resolve();
    const serial = <T>(work: () => Promise<T>): Promise<T> => { const next = queue.then(work, work); queue = next.then(() => undefined, () => undefined); return next; };
    const calls = new Map<string, Promise<ToolResult | SubmissionVerdict>>();
    let resolveReceipt!: (value: SessionOperationReceipt) => void;
    let rejectReceipt!: (error: unknown) => void;
    const result = new Promise<SessionOperationReceipt>((resolve, reject) => { resolveReceipt = resolve; rejectReceipt = reject; });
    let stopped = false;
    const stop = async () => {
      stopped = true; abort.abort();
      const value = await serial(() => settle(key, { kind: 'stopped' }));
      liveOwnerTokens.delete(owner.token); active.delete(activeKey(key));
      resolveReceipt(value); return value;
    };
    const handle: SessionOperationHandle = { receipt: result, outcome: result.then(value => value.outcome), settled: () => result, stop };
    // Avoid a separately unobserved rejection on the derived outcome promise.
    void handle.outcome.catch(() => undefined);
    active.set(activeKey(key), { abort, handle, stop });
    async function assertLive(): Promise<void> {
      if (stopped || abort.signal.aborted) throw new Error('Operation stopped');
      const current = await readOperation(key);
      if (!current || current.body.phase === 'terminal' || current.body.owner?.token !== owner.token) throw new Error('Operation fenced after settlement or execution ownership lost');
      const original = current.body.input as unknown as Omit<ContinueSessionInput, 'bindings'>;
      validateBindings(original.task, original.policy, bindings);
      if (!await bindings.currentAuthority(original.task, original.policy)) throw new Error('Current authority denied operation');
      if (stopped || abort.signal.aborted) throw new Error('Operation stopped');
      validateBindings(original.task, original.policy, bindings);
    }
    async function effect(callId: string, name: string, input: unknown, submission: boolean): Promise<ToolResult | SubmissionVerdict> {
      const cached = calls.get(callId); if (cached) return cached;
      const work = (async (): Promise<ToolResult | SubmissionVerdict> => {
        await assertLive();
        const current = await readOperation(key); if (!current) throw new Error('Missing operation');
        const snapshot = current.body.snapshot;
        const declaration = snapshot.declarations.find(item => item.name === name);
        if (!declaration || !snapshot.activeTools.includes(name) || (submission && name !== bindings.task.submissionTool)) return submission ? { accepted: false, errors: [`Inactive or undesignated tool ${name}`] } : { text: `Inactive tool ${name}`, isError: true };
        const tool = bindings.tools.find(item => item.name === name);
        const guarded: GuardedCall = { callId, tool: name, input, action: tool?.action?.(input) ?? { kind: 'harness' } };
        async function afterMutation(result: ToolResult, failed: boolean): Promise<ToolResult> {
          if (!declaration?.mutating || !bindings.afterMutation) return result;
          const hookId = `${callId}:afterMutation`;
          const latest = await readOperation(key);
          const priorHook = latest?.body.effects.find(item => item.callId === hookId);
          let text: string;
          if (priorHook) {
            if (priorHook.phase !== 'completed') throw new Error(`Mutation check ${hookId} completion unknown`);
            text = priorHook.result?.text ?? '';
          } else {
            await serial(() => updateOperation(key, body => ({ ...body, effects: [...body.effects, { callId: hookId, tool: `afterMutation:${name}`, input: { callId, tool: name, action: guarded.action, result }, phase: 'intent', result: null, verdict: null }] }), owner.token));
            const hook = await bindings.afterMutation({ callId, tool: name, action: guarded.action, failed });
            await assertLive();
            text = hook?.text ?? '';
            await serial(() => updateOperation(key, body => ({ ...body, effects: body.effects.map(item => item.callId === hookId ? { ...item, phase: 'completed', result: { text } } : item) }), owner.token));
          }
          return text === '' ? result : { ...result, text: `${result.text}\n${text}` };
        }
        const old = current.body.effects.find(item => item.callId === callId);
        if (old) {
          if (old.tool !== name || !equal(old.input, input)) throw new Error(`Effect call identity conflicts for ${callId}`);
          if (old.phase !== 'completed') throw new Error(`Effect ${callId} completion unknown`);
          return submission ? old.verdict! : afterMutation(old.result!, old.result!.isError ?? false);
        }
        if (!submission && !tool) return { text: `No fresh handler for ${name}`, isError: true };
        if (tool && !equal(declaration, { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, mutating: tool.mutating ?? false })) throw new Error(`Fresh handler definition conflicts for ${name}`);
        // Declaration controls mutation classification; handlers cannot quietly widen it.
        if (declaration.mutating && bindings.guard) {
          const decision = await bindings.guard(guarded);
          if (!decision.allow) return { text: decision.text, isError: true };
        }
        await assertLive();
        await serial(() => updateOperation(key, body => ({ ...body, effects: [...body.effects, { callId, tool: name, input: clone(input), phase: 'intent', result: null, verdict: null }] }), owner.token));
        await assertLive();
        let executionError: unknown;
        let answer: ToolResult | SubmissionVerdict;
        try { answer = submission ? await bindings.submission.accept(input, abort.signal) : await tool!.execute(input, abort.signal); }
        catch (error) { executionError = error; answer = { text: errorText(error), isError: true }; }
        await assertLive();
        // Retain known tool completion before running any potentially interrupted mutation check.
        if (executionError === undefined) {
          await serial(() => updateOperation(key, body => ({ ...body, effects: body.effects.map(item => item.callId === callId ? { ...item, phase: 'completed', result: submission ? null : clone(answer) as ToolResult, verdict: submission ? clone(answer) as SubmissionVerdict : null } : item) }), owner.token));
        }
        const finalAnswer = submission ? answer : await afterMutation(answer as ToolResult, executionError !== undefined || ((answer as ToolResult).isError ?? false));
        if (executionError !== undefined) throw executionError;
        return finalAnswer;
      })();
      calls.set(callId, work); return work;
    }
    void (async () => {
      try {
        await assertLive();
        let current = await readOperation(key); if (!current) throw new Error('Missing operation');
        await verifyPayloads({ ...current.body.snapshot, transcript: [...current.body.snapshot.transcript, ...current.body.provider] });
        // Recovery is opt-in and independently grounded. Arbitrary effects never replay blindly.
        for (const effect of current.body.effects.filter(item => item.phase === 'intent')) {
          if (effect.tool === bindings.task.submissionTool || !bindings.recoverEffect) {
            const value = await serial(() => settle(key, { kind: 'failed', error: 'Unknown external effect completion' })); resolveReceipt(value); return;
          }
          const recovered = await bindings.recoverEffect(clone(effect));
          if (recovered === null) { const value = await serial(() => settle(key, { kind: 'failed', error: 'Unknown external effect completion' })); resolveReceipt(value); return; }
          await assertLive();
          await serial(() => updateOperation(key, body => ({ ...body, effects: body.effects.map(item => item.callId === effect.callId ? { ...item, phase: 'completed', result: clone(recovered) } : item) }), owner.token));
        }
        current = await readOperation(key); if (!current) throw new Error('Missing operation');
        let outcome: SessionOutcome;
        {
          const dispatched = await serial(() => updateOperation(key, body => ({ ...body, phase: 'dispatched' }), owner.token));
          await assertLive();
          outcome = await options.driver.dispatch({ key: clone(key), task: clone((dispatched.input as unknown as Omit<ContinueSessionInput, 'bindings'>).task), session: clone({ ...dispatched.snapshot, transcript: [...dispatched.snapshot.transcript, ...dispatched.provider] }), recovering, effects: clone(dispatched.effects) }, {
            signal: abort.signal, assertLive,
            describeTool(name, input) {
              const declaration = dispatched.snapshot.declarations.find(item => item.name === name);
              const handler = bindings.tools.find(item => item.name === name);
              return { action: handler?.action?.(input) ?? { kind: 'harness' }, mutating: declaration?.mutating ?? false };
            },
            callTool: (callId, name, input) => effect(callId, name, input, false) as Promise<ToolResult>,
            submit: (callId, input) => effect(callId, bindings.task.submissionTool, input, true) as Promise<SubmissionVerdict>,
            async persistPayload(payloadKey, bytes) {
              await assertLive();
              const id = await store.putPayload(bytes);
              await serial(() => updateOperation(key, body => {
                const prior = body.provider.find(item => item.key === payloadKey);
                if (prior && prior.payloadId !== id) throw new Error(`Provider payload key conflicts for ${payloadKey}`);
                return prior ? body : { ...body, provider: [...body.provider, { key: payloadKey, payloadId: id, kind: 'provider' }] };
              }, owner.token));
              return id;
            },
            async readPayload(id) { const bytes = await store.getPayload(id); if (bytes === null) throw new SessionDriverUnavailableError(`Missing provider payload ${id}`); return bytes; },
            onEvent(event) { if (!stopped && liveOwnerTokens.has(owner.token)) bindings.onEvent(event); },
          });
          // A provider cannot claim acceptance it never durably obtained from the current validator.
          if (outcome.kind === 'submitted') {
            const latest = await readOperation(key);
            const evidence = latest?.body.effects.some(item => item.verdict?.accepted && equal(item.input, outcome.kind === 'submitted' ? outcome.input : null));
            if (!evidence) outcome = { kind: 'failed', error: 'Provider reported an unvalidated submission' };
          }
        }
        if (stopped) return;
        const value = await serial(() => settle(key, outcome));
        // The receipt is already durable if publication fails. Retry performs no effect.
        await bindings.publish(clone(value));
        resolveReceipt(value);
      } catch (error) {
        if (stopped) return;
        try { const value = await serial(() => settle(key, { kind: 'failed', error: errorText(error) }, errorText(error), error instanceof SessionDriverUnavailableError)); resolveReceipt(value); }
        catch (storageError) { rejectReceipt(storageError); }
      } finally { liveOwnerTokens.delete(owner.token); ownerControllers.delete(owner.token); active.delete(activeKey(key)); }
    })();
    return handle;
  }
  return api;
}
