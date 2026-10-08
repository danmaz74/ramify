import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { AgentEvent } from '../../../../src/interfaces/port.js';
import type { AgentSessionPoint, SessionExecutionBindings, SessionExecutionPolicy, SessionStore, SessionStoreRecord, SessionTaskInput, SessionToolDeclaration } from '../../../../src/interfaces/session-operations.js';
import { piBuiltinDeclarations } from '../session-operations.js';
import { createPiAgentOn } from '../pi-agent.js';
import { nativeCodexRuntime } from './helpers/scripted-provider.js';
import { workspace } from './helpers/session.js';

const controlled = vi.hoisted(() => ({ overlap: false, zero: false, clock: 1000, blocked: null as Promise<void> | null, reached: null as (() => void) | null, release: null as (() => void) | null, pause: null as Promise<void> | null, held: false, processes: [] as string[] }));
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  const deny = (name: string) => (..._args: unknown[]) => { controlled.processes.push(name); throw new Error(`Unexpected ordinary process: ${name}`); };
  return { ...actual, exec: deny('exec'), execFile: deny('execFile'), spawn: deny('spawn'), fork: deny('fork'), execSync: deny('execSync'), execFileSync: deny('execFileSync'), spawnSync: deny('spawnSync') };
});
vi.mock('@earendil-works/pi-coding-agent', async original => {
  const actual = await original<typeof import('@earendil-works/pi-coding-agent')>();
  return { ...actual,
    createReadTool(cwd: string) { const tool = actual.createReadTool(cwd); return { ...tool, execute: async () => ({ content: [{ type: 'text' as const, text: 'Ω' }], details: { truncation: { truncated: true } } }) }; },
    createGrepTool(cwd: string) { const tool = actual.createGrepTool(cwd); return { ...tool, execute: async () => ({ content: [{ type: 'text' as const, text: '' }], details: { files: [] } }) }; },
    async createAgentSession(...args: Parameters<typeof actual.createAgentSession>) {
      const created = await actual.createAgentSession(...args); const agent = created.session.agent; const subscribe = agent.subscribe.bind(agent);
      agent.subscribe = listener => subscribe(async (event, signal) => {
        if (controlled.zero && event.type === 'message_end' && event.message.role === 'assistant') {
          Object.assign(event.message.usage, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 });
        }
        if (!controlled.overlap || event.type !== 'message_end' || event.message.role !== 'assistant') return listener(event, signal);
        controlled.overlap = false;
        controlled.clock = 2000; const first = listener(event, signal);
        await controlled.blocked;
        const second = structuredClone(event.message); second.content = [{ type: 'text', text: 'Second independently admitted observation.' }];
        agent.state.messages.push(second);
        controlled.clock = 2500; const following = listener({ type: 'message_end', message: second }, signal);
        controlled.clock = 9000; controlled.release!();
        await Promise.all([first, following]);
      });
      return created;
    },
  };
});
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); expect(controlled.processes).toEqual([]); controlled.processes = []; controlled.overlap = false; controlled.zero = false; controlled.held = false; });
const policy: SessionExecutionPolicy = { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { write: true }, validator: { revision: 1 }, destination: { record: 'fixed' } };
const submit: SessionToolDeclaration = { name: 'submit_result', description: 'Submit.', inputSchema: { type: 'object' }, mutating: false };
const read: SessionToolDeclaration = { name: 'read', description: 'Read.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, mutating: false };
const grep: SessionToolDeclaration = { name: 'grep', description: 'Search.', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, mutating: false };
const call = (name: string, args: unknown, id: string) => ({ type: 'function_call', id: `fc_${id}`, call_id: `call_${id}`, name, arguments: JSON.stringify(args) });
const text = (value: string) => ({ type: 'message', id: 'message-script', role: 'assistant', content: [{ type: 'output_text', text: value, annotations: [] }], status: 'completed' });
function memoryStore(): SessionStore {
  const records = new Map<string, SessionStoreRecord>(); const payloads = new Map<string, Uint8Array>(); const key = (run: string, id: string) => JSON.stringify([run, id]);
  return { async read(run, id) { return structuredClone(records.get(key(run, id)) ?? null); }, async getPayload(id) { return payloads.get(id) ?? null; },
    async putPayload(bytes) {
      const value = JSON.parse(new TextDecoder().decode(bytes));
      if (controlled.overlap === false && controlled.blocked !== null && !controlled.held && value.schema === 'ramify.pi-transcript/1' && value.messages.some((message: { role: string }) => message.role === 'assistant')) {
        controlled.held = true; controlled.reached!(); await controlled.pause;
      }
      const id = createHash('sha256').update(bytes).digest('hex'); payloads.set(id, new Uint8Array(bytes)); return id;
    }, async commit(input) { for (const prior of input.expected) if ((records.get(key(input.runId, prior.id))?.revision ?? null) !== prior.revision) return { kind: 'conflict', reason: 'CAS' };
      for (const record of input.records) records.set(key(input.runId, record.id), structuredClone(record)); return { kind: 'committed' }; } };
}
async function fixture(outputs: Parameters<typeof nativeCodexRuntime>[0], declarations: SessionToolDeclaration[]) {
  const places = await workspace(cleanups); const native = await nativeCodexRuntime(outputs); cleanups.push(native.remove);
  Object.assign(native.model.cost, { input: 2, cacheRead: 0.5, cacheWrite: 3, output: 4, tiers: undefined });
  declarations = declarations.map(declaration => piBuiltinDeclarations(['read', 'grep'], places.workingDirectory).find(builtin => builtin.name === declaration.name) ?? declaration);
  const operations = createPiAgentOn({ runtime: async () => native.runtime, agentDirectory: native.agentDirectory, model: 'openai-codex/gpt-5.6-sol' }).bindSessionStore!(memoryStore());
  const P = await operations.create({ runId: 'run', operationId: 'create', initialInstructions: 'Stable role.', declarations, activate: declarations.map(value => value.name), policy });
  const task: SessionTaskInput = { role: 'engineer', message: 'Current task.', submissionTool: submit.name, environment: { workingDirectory: places.workingDirectory, candidate: 'candidate', snapshot: 'snapshot', limits: {} }, policyIdentity: 'p', validatorIdentity: 'v', destinationIdentity: 'd' };
  const events: AgentEvent[] = []; let accepted = 0;
  const bindings: SessionExecutionBindings = { task, policy, tools: [], submission: { name: submit.name, accept: async () => { accepted++; return { accepted: true }; } }, currentAuthority: async () => true, onEvent: event => events.push(event), publish: async () => {} };
  return { native, operations, P, events, bindings, accepted: () => accepted, input: { runId: 'run', operationId: 'execute', sessionId: P.sessionId, expectedPoint: P.point as AgentSessionPoint, task, policy, additions: [], toolChange: { add: [], activate: [], inactivate: [] }, bindings } };
}

describe('Plan 23 modern preserving Pi observations', () => {
  test('reports real new-driver read/search output facts and captured model rates without interpreting SDK costs as billing', async () => {
    controlled.blocked = null;
    const f = await fixture([[call('read', { path: 'a.ts' }, 'read'), call('grep', { pattern: 'absent', path: '.' }, 'search')], [call('submit_result', {}, 'submit')]], [read, grep, submit]);
    const receipt = await (await f.operations.continue(f.input)).receipt;
    expect(receipt.outcome?.kind).toBe('submitted'); expect(f.accepted()).toBe(1); expect(f.native.dispatches()).toBe(2);
    const finishes = f.events.filter(event => event.type === 'tool-finished');
    expect(finishes.map(event => event.callId)).toEqual(['call_read|fc_read', 'call_search|fc_search', 'call_submit|fc_submit']);
    expect(finishes.find(event => event.tool === 'read')?.observation).toMatchObject({ returnedBytes: 2, files: [expect.stringMatching(/\/a\.ts$/)], coverage: ['Returned content truncated by the tool'] });
    expect(finishes.find(event => event.tool === 'grep')?.observation).toMatchObject({ returnedBytes: 0, files: [], coverage: ['Scanned bytes not reported; returned bytes are output only'] });
    const messages = f.events.filter(event => event.type === 'message' && event.role === 'assistant');
    expect(messages.map(event => event.observation?.sourceId)).toEqual(['pi-message:2', 'pi-message:5']);
    for (const message of messages) { expect(message.execution).toEqual({ runId: 'run', operationId: 'execute', sessionId: f.P.sessionId, turn: 1, sourcePoint: f.P.point }); expect(message.observation?.charge).toMatchObject({ model: 'openai-codex/gpt-5.6-sol', ratesPerMillion: { newInput: 2, cachedInput: 0.5, cacheWrite: 3, output: 4 } }); expect(message.observation?.charge?.sourceRevision).toContain('model-runtime'); }
    const before = f.events.length; expect(await (await f.operations.retry({ runId: 'run', operationId: 'execute', bindings: f.bindings })).receipt).toEqual(receipt); expect(f.events).toHaveLength(before); expect(f.native.dispatches()).toBe(2); f.native.verify();
  });
  test('captures distinct original message positions and admission durations before delayed persistence admits a later callback', async () => {
    controlled.blocked = new Promise<void>(resolve => { controlled.reached = resolve; }); controlled.pause = new Promise<void>(resolve => { controlled.release = resolve; });
    controlled.overlap = true; controlled.clock = 1000; vi.spyOn(Date, 'now').mockImplementation(() => controlled.clock);
    const f = await fixture([[text('First independently admitted observation.')]], [submit]);
    const receipt = await (await f.operations.continue(f.input)).receipt;
    expect(receipt.status).toBe('completed'); expect(f.native.dispatches()).toBe(1);
    const messages = f.events.filter(event => event.type === 'message' && event.role === 'assistant');
    expect(messages.map(event => event.observation?.sourceId)).toEqual(['pi-message:2', 'pi-message:3']);
    expect(messages.map(event => event.observation?.at)).toEqual(['1970-01-01T00:00:02.000Z', '1970-01-01T00:00:02.500Z']);
    expect(messages.map(event => event.observation?.elapsedMs)).toEqual([1000, 1500]);
    expect(messages.filter(event => event.type === 'message' && event.role === 'assistant').map(event => event.usage?.input)).toEqual([30, 30]);
    expect(new Set(messages.map(event => event.observation?.sourceId)).size).toBe(2);
    f.native.verify();
  });
  test('successful SDK all-zero normalized counters remain unavailable rather than a complete zero-dollar estimate', async () => {
    controlled.blocked = null; controlled.zero = true;
    const f = await fixture([[text('Normalized SDK zero usage.')]], [submit]); await (await f.operations.continue(f.input)).receipt;
    const message = f.events.find(event => event.type === 'message' && event.role === 'assistant');
    expect(message).toMatchObject({ usage: null, observation: { coverage: ['SDK normalized all-zero usage; original provider report presence unavailable'] } });
    expect(message?.observation?.charge).toBeUndefined(); expect(f.native.dispatches()).toBe(1); f.native.verify();
  });

});
