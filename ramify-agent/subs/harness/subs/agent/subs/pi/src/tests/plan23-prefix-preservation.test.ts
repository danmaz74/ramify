import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentSessionPoint, SessionExecutionBindings, SessionExecutionPolicy, SessionStore, SessionStoreCommit, SessionStoreRecord, SessionTaskInput, SessionToolDeclaration } from '../../../../src/interfaces/session-operations.js';
import { createPiAgentOn, type PiRuntimeSource } from '../pi-agent.js';
import { piBuiltinDeclarations } from '../session-operations.js';
import { nativeCodexRuntime, type NativeCodexRuntime } from './helpers/scripted-provider.js';
import { workspace } from './helpers/session.js';

const richFixture = vi.hoisted(() => ({ executions: 0 }));
vi.mock('@earendil-works/pi-coding-agent', async importOriginal => {
  const actual = await importOriginal<typeof import('@earendil-works/pi-coding-agent')>();
  return { ...actual, createReadTool: (cwd: string) => {
    const tool = actual.createReadTool(cwd);
    return { ...tool, execute: async (...args: Parameters<typeof tool.execute>) => {
      if (args[1].path === 'opaque-fixture.png' || args[1].path === 'opaque-error.png') {
        richFixture.executions++;
        return { content: [{ type: 'image' as const, data: 'c2NyaXB0ZWQ=', mimeType: 'image/png' }, { type: 'text' as const, text: 'Rich result.' }], details: { fixture: 'opaque-read', dimensions: [10, 20] }, ...(args[1].path === 'opaque-error.png' ? { isError: true } : {}) };
      }
      return tool.execute(...args);
    } };
  } };
});

beforeAll(() => { process.env.PI_OFFLINE = '1'; });
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); richFixture.executions = 0; });
const policy: SessionExecutionPolicy = { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { write: true }, validator: { revision: 1 }, destination: { record: 'A' } };
const schema = { type: 'object', properties: { orientation: { type: 'string' } }, required: ['orientation'], additionalProperties: false };
const orientation: SessionToolDeclaration = { name: 'submit_orientation', description: 'Submit orientation.', inputSchema: schema, mutating: false };
const read: SessionToolDeclaration = { name: 'read', description: 'Read fixture.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, mutating: false };
const call = (name: string, args: unknown, id: string) => ({ type: 'function_call', id: `fc_${id}`, call_id: `call_${id}`, name, arguments: JSON.stringify(args) });
const reason = { type: 'reasoning', id: 'rs_fixture', summary: [{ type: 'summary_text', text: 'Opaque thought.' }], encrypted_content: 'opaque-encrypted-fixture' };
const text = (value: string) => ({ type: 'message', id: 'msg_fixture', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: value, annotations: [] }], status: 'completed' });
interface StoredFixture { records: Array<[string, SessionStoreRecord]>; payloads: Array<[string, string]> }
function memoryStore(restored?: StoredFixture) {
  const records = new Map<string, SessionStoreRecord>(restored?.records); const payloads = new Map<string, Uint8Array>((restored?.payloads ?? []).map(([id, bytes]) => [id, new Uint8Array(Buffer.from(bytes, 'base64'))]));
  let fault: ((input: SessionStoreCommit) => void) | null = null;
  const key = (runId: string, id: string) => JSON.stringify([runId, id]);
  const store: SessionStore = {
    async read(runId, id) { return structuredClone(records.get(key(runId, id)) ?? null); },
    async putPayload(bytes) { const id = createHash('sha256').update(bytes).digest('hex'); payloads.set(id, new Uint8Array(bytes)); return id; },
    async getPayload(id) { return payloads.get(id) ?? null; },
    async commit(input) {
      fault?.(input);
      for (const expected of input.expected) if ((records.get(key(input.runId, expected.id))?.revision ?? null) !== expected.revision) return { kind: 'conflict', reason: 'CAS' };
      for (const record of input.records) records.set(key(input.runId, record.id), structuredClone(record));
      return { kind: 'committed' };
    },
  };
  return { store, records, payloads, setFault: (value: typeof fault) => { fault = value; } };
}
async function fixture(outputs: Parameters<typeof nativeCodexRuntime>[0], definitions: readonly SessionToolDeclaration[] = [read, orientation], extensions: PiRuntimeSource['preservingExtensions'] = []) {
  const places = await workspace(cleanups); const native = await nativeCodexRuntime(outputs); cleanups.push(native.remove);
  const memory = memoryStore();
  const source: PiRuntimeSource = { runtime: async () => native.runtime, agentDirectory: native.agentDirectory, model: 'openai-codex/gpt-5.6-sol', preservingExtensions: extensions };
  const agent = createPiAgentOn(source); const operations = agent.bindSessionStore!(memory.store);
  const P = await operations.create({ runId: 'run-A', operationId: 'create', initialInstructions: 'Role A\nGeneral task protocol.', declarations: definitions, activate: definitions.map(item => item.name), policy });
  const task: SessionTaskInput = { role: 'architect', message: 'Orient A', submissionTool: 'submit_orientation', environment: { workingDirectory: places.workingDirectory, candidate: 'C0', snapshot: 'S0', limits: { max: 10 } }, policyIdentity: 'p1', validatorIdentity: 'v1', destinationIdentity: 'd1' };
  let reads = 0; let accepted = 0;
  const bindings: SessionExecutionBindings = { task, policy, tools: definitions.filter(item => item.name === 'read').map(item => ({ ...item, execute: async () => { reads++; return { text: 'Exact read result.' }; } })), submission: { name: task.submissionTool, accept: async () => { accepted++; return { accepted: true }; } }, currentAuthority: async () => true, onEvent: () => {}, publish: async () => {} };
  const next = (sessionId: string, point: AgentSessionPoint, operationId: string, bound = bindings) => ({ runId: 'run-A', operationId, sessionId, expectedPoint: point, task: bound.task, policy, additions: [], toolChange: { add: [], activate: [], inactivate: [] }, bindings: bound });
  return { ...memory, native, source, agent, operations, P, task, bindings, next, reads: () => reads, accepted: () => accepted };
}
const prefix = (native: NativeCodexRuntime, index: number) => {
  const request = native.requests[index]!; return { instructions: request['instructions'], tools: request['tools'], input: request['input'] as Record<string, unknown>[] };
};
describe('Plan 23 installed pi native prefix preservation', () => {
  it('S07/S10 retains exact initial prefix, opaque artifacts and effect results across multiple requests and a fresh adapter', async () => {
    const f = await fixture([[reason, call('read', {}, 'read')], [call('submit_orientation', { orientation: 'A' }, 'orient')], [text('Second task.')], [text('Third task.')]]);
    const T1 = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'orient'))).receipt;
    expect(T1).toMatchObject({ status: 'completed', turn: 1, outcome: { kind: 'submitted', input: { orientation: 'A' } } });
    expect(f.native.dispatches()).toBe(2); expect(f.reads()).toBe(1); expect(f.accepted()).toBe(1);
    const recorded = await f.operations.inspect('run-A', f.P.sessionId);
    const requestEntry = recorded!.transcript.find(item => item.kind === 'provider' && item.key.includes(':pi-request:'))!;
    const requestArtifact = JSON.parse(new TextDecoder().decode(f.payloads.get(requestEntry.payloadId)!)) as Record<string, unknown>;
    // Recorded observations of the installed package and the forced stream options, not restated constants.
    expect(requestArtifact['packageVersion']).toBe('0.87.1'); expect(requestArtifact['transport']).toBe('sse'); expect(requestArtifact['maxRetries']).toBe(0);
    expect(requestArtifact).toMatchObject({ schema: 'ramify.pi-native-request/1', model: 'openai-codex/gpt-5.6-sol', request: f.native.wireRequests[0] });
    expect(f.native.transports).toEqual(['sse', 'sse']);
    expect(JSON.stringify(requestArtifact)).not.toContain('fixture-account');
    const first = prefix(f.native, 0); const second = prefix(f.native, 1);
    expect(first.instructions).toBe('Role A\nGeneral task protocol.');
    expect(first.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }]);
    expect(first.tools).toEqual([
      { type: 'function', name: 'read', description: 'Read fixture.', parameters: read.inputSchema, strict: null },
      { type: 'function', name: 'submit_orientation', description: 'Submit orientation.\n\nThe input must satisfy this JSON Schema; the harness validates it and returns every error:\n{"additionalProperties":false,"properties":{"orientation":{"type":"string"}},"required":["orientation"],"type":"object"}', parameters: { type: 'object', properties: { orientation: {} } }, strict: null },
    ]);
    expect(second.instructions).toEqual(first.instructions); expect(second.tools).toEqual(first.tools);
    expect(second.input).toEqual([...first.input, reason, call('read', {}, 'read'), { type: 'function_call_output', call_id: 'call_read', output: 'Exact read result.' }]);
    const storagePath = join(f.task.environment.workingDirectory, 'opaque-store.json');
    await writeFile(storagePath, JSON.stringify({ records: [...f.records], payloads: [...f.payloads].map(([id, bytes]) => [id, Buffer.from(bytes).toString('base64')]) } satisfies StoredFixture));
    const reopened = memoryStore(JSON.parse(await readFile(storagePath, 'utf8')) as StoredFixture);
    const newOperations = createPiAgentOn(f.source).bindSessionStore!(reopened.store);
    const nextTask = { ...f.task, message: 'Assignment A' }; const bound = { ...f.bindings, task: nextTask };
    const T2 = await (await newOperations.continue(f.next(f.P.sessionId, T1.point!, 'assignment', bound))).receipt;
    expect(T2).toMatchObject({ status: 'completed', turn: 2 });
    const third = prefix(f.native, 2);
    expect(third.instructions).toEqual(first.instructions); expect(third.tools).toEqual(first.tools);
    expect(third.input).toEqual([...second.input, call('submit_orientation', { orientation: 'A' }, 'orient'), { type: 'function_call_output', call_id: 'call_orient', output: 'The submission was accepted and recorded.' }, { role: 'user', content: [{ type: 'input_text', text: 'Assignment A' }] }]);
    const thirdTask = { ...f.task, message: 'Third A' };
    const anotherAdapter = createPiAgentOn(f.source).bindSessionStore!(reopened.store);
    const T3 = await (await anotherAdapter.continue(f.next(f.P.sessionId, T2.point!, 'third', { ...f.bindings, task: thirdTask }))).receipt;
    expect(T3).toMatchObject({ status: 'completed', turn: 3 });
    expect(prefix(f.native, 3).input).toEqual([...third.input, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Second task.', annotations: [] }], status: 'completed', id: 'msg_fixture', phase: 'final_answer' }, { role: 'user', content: [{ type: 'input_text', text: 'Third A' }] }]);
    expect(await (await anotherAdapter.continue(f.next(f.P.sessionId, f.P.point!, 'orient'))).receipt).toEqual(T1); expect(f.native.dispatches()).toBe(4);
    expect(f.native.transports).toEqual(['sse', 'sse', 'sse', 'sse']);
    f.native.verify();
  });
  it('a submission declaration that already states its schema is serialized without a second, empty schema statement', async () => {
    const stated: SessionToolDeclaration = { name: 'submit_orientation', description: `Submit this task using exactly this JSON schema: ${JSON.stringify(schema)}`, inputSchema: { type: 'object' }, mutating: false };
    const f = await fixture([[call('submit_orientation', { orientation: 'A' }, 'orient')]], [read, stated]);
    const T1 = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'orient'))).receipt;
    expect(T1).toMatchObject({ status: 'completed', turn: 1, outcome: { kind: 'submitted', input: { orientation: 'A' } } });
    expect(f.accepted()).toBe(1);
    expect(prefix(f.native, 0).tools).toEqual([
      { type: 'function', name: 'read', description: 'Read fixture.', parameters: read.inputSchema, strict: null },
      { type: 'function', name: 'submit_orientation', description: stated.description, parameters: { type: 'object', properties: {} }, strict: null },
    ]);
    expect(JSON.stringify(prefix(f.native, 0).tools)).not.toContain('The input must satisfy this JSON Schema');
    f.native.verify();
  });
  it('S07/S10/S11 forks exact T1/C1 prefixes, appends native tools and later role instructions once, and isolates the parent', async () => {
    const f = await fixture([[call('submit_orientation', { orientation: 'A' }, 'orient')], [text('Left.')], [text('Right.')], [text('Parent.')]]);
    const T1 = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'orient'))).receipt;
    const C1 = await f.operations.appendContext({ runId: 'run-A', operationId: 'brief-b', sessionId: f.P.sessionId, expectedPoint: T1.point!, additions: [{ key: 'brief-b', kind: 'brief', text: 'B', revision: 'r1' }] });
    const L = await f.operations.fork({ runId: 'run-A', operationId: 'L', sourcePoint: T1.point! });
    const R = await f.operations.fork({ runId: 'run-A', operationId: 'R', sourcePoint: C1.point! });
    const nextDeclaration: SessionToolDeclaration = { name: 'submit_assignment', description: 'Submit assignment.', inputSchema: { type: 'object', properties: { done: { type: 'boolean' } }, required: ['done'] }, mutating: false };
    const bound = { ...f.bindings, task: { ...f.task, message: 'Assign L', submissionTool: nextDeclaration.name }, submission: { name: nextDeclaration.name, accept: async () => ({ accepted: true as const }) } };
    const input = { ...f.next(L.sessionId, L.point!, 'left', bound), additions: [{ key: 'role-l', kind: 'role-instructions' as const, text: 'Role L extension.', revision: 'l1' }], toolChange: { add: [nextDeclaration], activate: [nextDeclaration.name], inactivate: ['submit_orientation'] } };
    const left = await (await f.operations.continue(input)).receipt;
    expect(left.turn).toBe(2);
    const leftRequest = prefix(f.native, 1); const original = prefix(f.native, 0);
    expect(leftRequest.instructions).toEqual(original.instructions); expect(leftRequest.tools).toEqual(original.tools);
    expect(leftRequest.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }, call('submit_orientation', { orientation: 'A' }, 'orient'), { type: 'function_call_output', call_id: 'call_orient', output: 'The submission was accepted and recorded.' },
      { role: 'developer', content: 'Role L extension.' },
      { type: 'additional_tools', role: 'developer', tools: [{ type: 'function', name: 'submit_assignment', description: 'Submit assignment.\n\nThe input must satisfy this JSON Schema; the harness validates it and returns every error:\n{"properties":{"done":{"type":"boolean"}},"required":["done"],"type":"object"}', parameters: { type: 'object', properties: { done: {} } }, strict: null }] },
      { role: 'developer', content: 'Active tools: read, submit_assignment. Inactive historical tools must not be called.' }, { role: 'user', content: [{ type: 'input_text', text: 'Assign L' }] },
    ]);
    const right = await (await f.operations.continue(f.next(R.sessionId, R.point!, 'right'))).receipt;
    expect(right.turn).toBe(2); expect(right.sessionId).not.toBe(left.sessionId);
    expect(prefix(f.native, 2).input.filter(item => item['role'] === 'user')).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }, { role: 'user', content: [{ type: 'input_text', text: 'B' }] }, { role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }]);
    expect(JSON.stringify(leftRequest.input)).not.toContain('"B"');
    const beforeRight = await f.operations.inspect('run-A', R.sessionId);
    const C2 = await f.operations.appendContext({ runId: 'run-A', operationId: 'brief-c', sessionId: f.P.sessionId, expectedPoint: C1.point!, additions: [{ key: 'brief-c', kind: 'brief', text: 'C', revision: 'r2' }] });
    await (await f.operations.continue(f.next(f.P.sessionId, C2.point!, 'parent'))).receipt;
    expect(await f.operations.inspect('run-A', R.sessionId)).toEqual(beforeRight);
    expect((await f.operations.inspect('run-A', f.P.sessionId))?.declarations.map(item => item.name)).toEqual(['read', 'submit_orientation']);
    expect(f.native.requests.map(item => item['prompt_cache_key'])).toEqual([f.P.sessionId, L.sessionId, R.sessionId, f.P.sessionId]);
    f.native.verify();
  });
  it('S08 rebinds an identical tool without redeclaration and conflicts on changed description/schema before dispatch', async () => {
    const f = await fixture([[call('read', {}, 'first')], [call('submit_orientation', { orientation: 'A' }, 'first-submit')], [call('read', {}, 'second')], [call('submit_orientation', { orientation: 'A' }, 'second-submit')]]);
    const one = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'one'))).receipt;
    let freshCalls = 0;
    const bound = { ...f.bindings, tools: [{ ...read, execute: async () => { freshCalls++; return { text: 'Fresh binding.' }; } }] };
    const two = await (await f.operations.continue({ ...f.next(f.P.sessionId, one.point!, 'two', bound), toolChange: { add: [read], activate: [], inactivate: [] } })).receipt;
    expect(two.status).toBe('completed'); expect(freshCalls).toBe(1);
    expect(prefix(f.native, 3).input.at(-1)).toEqual({ type: 'function_call_output', call_id: 'call_second', output: 'Fresh binding.' });
    expect(prefix(f.native, 3).tools).toEqual(prefix(f.native, 0).tools);
    expect(prefix(f.native, 3).input.some(item => item['type'] === 'additional_tools')).toBe(false);
    for (const changed of [{ ...read, description: 'Changed.' }, { ...read, inputSchema: { type: 'string' } }]) {
      const conflict = await (await f.operations.continue({ ...f.next(f.P.sessionId, two.point!, `conflict-${JSON.stringify(changed)}`), toolChange: { add: [changed], activate: [], inactivate: [] } })).receipt;
      expect(conflict.status).toBe('conflict'); expect(conflict.point).toBeNull();
    }
    expect(f.native.dispatches()).toBe(4); f.native.verify();
  });
  it.each(['replace-head', 'replace-tools', 'replace-input', 'reorder-input', 'replace-model', 'throw'])('S09 fences a final %s hook before the initial request', async mutation => {
    const f = await fixture([], [read, orientation], [pi => { pi.on('before_provider_request', event => {
      const body = event.payload as Record<string, unknown>;
      if (mutation === 'throw') throw new Error('Swallowed extension failure');
      if (mutation === 'replace-model') return { ...body, model: 'gpt-5.4' };
      if (mutation === 'reorder-input') return { ...body, input: (body['input'] as Record<string, unknown>[]).map(item => Object.fromEntries(Object.entries(item).reverse())) };
      return { ...body, ...(mutation === 'replace-head' ? { instructions: 'Wrong head.' } : mutation === 'replace-tools' ? { tools: [] } : { input: [] }) };
    }); }]);
    const failed = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'unsafe'))).receipt;
    expect(failed).toMatchObject({ status: 'unavailable', point: null }); expect(f.native.dispatches()).toBe(0); expect(f.native.requests).toHaveLength(0);
    expect(await (await f.operations.retry({ runId: 'run-A', operationId: 'unsafe', bindings: f.bindings })).receipt).toEqual(failed);
    expect(await f.operations.inspect('run-A', f.P.sessionId)).toBeNull();
    expect((await f.operations.fork({ runId: 'run-A', operationId: 'safe-old', sourcePoint: f.P.point! })).status).toBe('completed'); f.native.verify();
  });
  it('S09 fences a swallowed hook exception after a valid request without dispatching the next request', async () => {
    let hooks = 0;
    const f = await fixture([[call('read', {}, 'first')]], [read, orientation], [pi => { pi.on('before_provider_request', () => { if (++hooks === 2) throw new Error('Late swallowed hook'); }); }]);
    const result = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'late'))).receipt;
    expect(result).toMatchObject({ status: 'unavailable', point: null }); expect(hooks).toBe(2); expect(f.native.dispatches()).toBe(1); expect(f.reads()).toBe(1); expect(f.accepted()).toBe(0); f.native.verify();
  });
  it('S08 refuses inactive inherited mutation and old submission before effects and accepts only the new designated tool', async () => {
    const write: SessionToolDeclaration = { name: 'write_fixture', description: 'Write fixture.', inputSchema: { type: 'object' }, mutating: true };
    const review: SessionToolDeclaration = { name: 'submit_review', description: 'Review.', inputSchema: { type: 'object' }, mutating: false };
    const f = await fixture([[call('submit_orientation', { orientation: 'A' }, 'orient')], [call('write_fixture', {}, 'write'), call('submit_orientation', { orientation: 'late' }, 'old')], [call('submit_review', {}, 'review')]], [read, orientation, write]);
    const T1 = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'orient'))).receipt;
    const child = await f.operations.fork({ runId: 'run-A', operationId: 'review-child', sourcePoint: T1.point! }); let writes = 0; let reviews = 0;
    const bound = { ...f.bindings, task: { ...f.task, submissionTool: review.name, message: 'Read-only review.' }, tools: [...f.bindings.tools, { ...write, execute: async () => { writes++; return { text: 'Wrong write.' }; } }], submission: { name: review.name, accept: async () => { reviews++; return { accepted: true as const }; } } };
    const result = await (await f.operations.continue({ ...f.next(child.sessionId, child.point!, 'review', bound), toolChange: { add: [review], activate: [review.name], inactivate: [write.name, orientation.name] } })).receipt;
    expect(result).toMatchObject({ status: 'completed', outcome: { kind: 'submitted', input: {} } }); expect(writes).toBe(0); expect(f.accepted()).toBe(1); expect(reviews).toBe(1);
    expect(prefix(f.native, 2).tools).toEqual(prefix(f.native, 0).tools);
    expect(prefix(f.native, 2).input.slice(-2)).toEqual([{ type: 'function_call_output', call_id: 'call_write', output: 'Inactive historical tool write_fixture' }, { type: 'function_call_output', call_id: 'call_old', output: 'Inactive historical tool submit_orientation' }]);
    f.native.verify();
  });
  it('binds fresh native builtin handlers privately from pure declarations', async () => {
    const f = await fixture([]);
    const definitions = piBuiltinDeclarations(['read'], f.task.environment.workingDirectory);
    const declared = await f.operations.create({ runId: 'builtin', operationId: 'create', initialInstructions: 'Builtin role.', declarations: [...definitions, orientation], activate: ['read', orientation.name], policy });
    f.native.push([call('read', { path: 'module.ramify' }, 'builtin')], [call('submit_orientation', { orientation: 'A' }, 'builtin-submit')]);
    const task = { ...f.task, message: 'Read declared file.' }; const bound = { ...f.bindings, task, tools: [] };
    const receipt = await (await f.operations.continue({ ...f.next(declared.sessionId, declared.point!, 'read-builtin', bound), runId: 'builtin' })).receipt;
    expect(receipt.status).toBe('completed'); expect(f.reads()).toBe(0);
    expect(JSON.stringify(prefix(f.native, 1).input)).toContain('module demo'); f.native.verify();
  });
  it.each(['success', 'error', 'recover'])('retains complete private builtin image/details on %s without reconstructing them from display text', async mode => {
    const f = await fixture([]);
    const declarations = [...piBuiltinDeclarations(['read'], f.task.environment.workingDirectory), orientation];
    const P = await f.operations.create({ runId: 'rich', operationId: 'create', initialInstructions: 'Rich role.', declarations, activate: ['read', orientation.name], policy });
    const path = mode === 'error' ? 'opaque-error.png' : 'opaque-fixture.png';
    f.native.push([call('read', { path }, 'rich')], [call('submit_orientation', { orientation: 'A' }, 'rich-submit')]);
    const task = { ...f.task, message: 'Read rich fixture.' }; const bound = { ...f.bindings, task, tools: [] };
    if (mode === 'recover') f.setFault(input => {
      const operation = input.records.find(record => record.schema === 'ramify-agent.session-operation/1'); if (!operation || operation.runId !== 'rich') return;
      if (operation.body['phase'] === 'terminal') throw new Error('Crash before terminal write');
      const provider = operation.body['provider'] as Array<{ payloadId: string }>; const bytes = f.payloads.get(provider.at(-1)?.payloadId ?? ''); if (!bytes) return;
      const state = JSON.parse(new TextDecoder().decode(bytes)) as { messages?: Array<{ role: string }> };
      if (state.messages?.some(message => message.role === 'toolResult')) throw new Error('Crash before rich artifact write');
    });
    const handle = await f.operations.continue({ ...f.next(P.sessionId, P.point!, 'rich-task', bound), runId: 'rich' });
    let receipt;
    if (mode === 'recover') {
      await expect(handle.receipt).rejects.toThrow('Crash before terminal write'); expect(richFixture.executions).toBe(1); expect(f.native.dispatches()).toBe(1); f.setFault(null);
      receipt = await (await createPiAgentOn(f.source).bindSessionStore!(f.store).retry({ runId: 'rich', operationId: 'rich-task', bindings: bound })).receipt;
    } else receipt = await handle.receipt;
    expect(receipt).toMatchObject({ status: 'completed', outcome: { kind: 'submitted' } }); expect(richFixture.executions).toBe(1);
    expect(prefix(f.native, 1).input.at(-1)).toEqual({ type: 'function_call_output', call_id: 'call_rich', output: [{ type: 'input_text', text: 'Rich result.' }, { type: 'input_image', detail: 'auto', image_url: 'data:image/png;base64,c2NyaXB0ZWQ=' }] });
    const snapshot = await f.operations.inspect('rich', P.sessionId);
    const stateEntry = snapshot!.transcript.filter(item => item.key.includes(':pi-state:')).at(-1)!;
    const state = JSON.parse(new TextDecoder().decode(f.payloads.get(stateEntry.payloadId)!)) as { messages: Array<Record<string, unknown>> };
    expect(state.messages.find(message => message['role'] === 'toolResult' && message['toolName'] === 'read')).toMatchObject({ content: [{ type: 'image', data: 'c2NyaXB0ZWQ=', mimeType: 'image/png' }, { type: 'text', text: 'Rich result.' }], details: { fixture: 'opaque-read', dimensions: [10, 20] }, isError: mode === 'error' });
    f.native.verify();
  });
  it('S11 reports unsupported transport unavailable without any native or fresh-session dispatch', async () => {
    const f = await fixture([]);
    const source = { ...f.source, model: 'openai-codex/gpt-5.4' };
    const operations = createPiAgentOn(source).bindSessionStore!(f.store);
    const receipt = await (await operations.continue(f.next(f.P.sessionId, f.P.point!, 'unsupported'))).receipt;
    expect(receipt).toMatchObject({ status: 'unavailable', point: null }); expect(f.native.dispatches()).toBe(0); expect(f.native.requests).toHaveLength(0); f.native.verify();
  });
  it.each(['native-prefix', 'encoding', 'model', 'transport'])('S10 makes intact but corrupt %s history durably unavailable and Retry dispatches zero requests', async corruption => {
    const f = await fixture([[call('submit_orientation', { orientation: 'A' }, 'orient')]]);
    const T1 = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'orient'))).receipt;
    const snapshot = await f.operations.inspect('run-A', f.P.sessionId);
    const entry = snapshot!.transcript.filter(item => item.kind === 'provider' && item.key.includes(':pi-state:')).at(-1)!;
    const value = JSON.parse(new TextDecoder().decode(f.payloads.get(entry.payloadId)!)) as Record<string, unknown>;
    if (corruption === 'native-prefix') (value['native'] as Record<string, unknown>)['instructions'] = 'Corrupt head.';
    if (corruption === 'model') value['model'] = 'Different/model';
    if (corruption === 'transport') value['transport'] = 'websocket-cached';
    // Independent corruption fixture bypasses content-addressing to exercise the decoder.
    f.payloads.set(entry.payloadId, new TextEncoder().encode(corruption === 'encoding' ? '{' : JSON.stringify(value)));
    const result = await (await f.operations.continue(f.next(f.P.sessionId, T1.point!, 'corrupt'))).receipt;
    expect(result).toMatchObject({ status: 'unavailable', point: null }); expect(f.native.dispatches()).toBe(1);
    expect(await (await f.operations.retry({ runId: 'run-A', operationId: 'corrupt', bindings: f.bindings })).receipt).toEqual(result);
    expect(await f.operations.inspect('run-A', f.P.sessionId)).toBeNull(); f.native.verify();
  });
  it('missing payload reports unavailable with zero dispatch and leaves corruption as an explicit persistence limitation', async () => {
    const f = await fixture([]); const snapshot = await f.operations.inspect('run-A', f.P.sessionId);
    f.payloads.delete(snapshot!.transcript[0]!.payloadId);
    const result = await (await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'missing'))).receipt;
    expect(result).toMatchObject({ status: 'unavailable', point: null }); expect(f.native.dispatches()).toBe(0);
    expect(await f.store.read('run-A', 'operation:missing')).toBeNull(); expect(await f.operations.inspect('run-A', f.P.sessionId)).toBeNull(); f.native.verify();
  });
  it('Stop during awaited final transformation fences the actual request and its late callback', async () => {
    let entered!: () => void; let release!: () => void;
    const atHook = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    const f = await fixture([], [read, orientation], [pi => { pi.on('before_provider_request', async () => { entered(); await gate; }); }]);
    const handle = await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'stop-final')); await atHook;
    const stopping = handle.stop(); const idle = handle.settled(); let stopEnded = false; let idleEnded = false;
    void stopping.then(() => { stopEnded = true; }); void idle.then(() => { idleEnded = true; });
    const stopped = await handle.receipt; const record = await f.store.read('run-A', 'operation:stop-final');
    expect(stopEnded).toBe(false); expect(idleEnded).toBe(false); expect(record?.body['quiescent']).not.toBe(true); release();
    expect(await stopping).toEqual(stopped); expect(await idle).toEqual(stopped);
    expect(stopped).toMatchObject({ status: 'stopped', point: null }); expect(await handle.receipt).toEqual(stopped); expect((await f.store.read('run-A', 'operation:stop-final'))?.body).toEqual({ ...record!.body, quiescent: true }); expect(f.native.dispatches()).toBe(0); f.native.verify();
  });
  it.each(['solo', 'with-completed-read', 'with-coerced-read'])('accepted %s submission without provider result or terminal receipt recovers exact native results with zero new model requests', async shape => {
    const readArgs = shape === 'with-coerced-read' ? { offset: '2' } : {};
    const readDeclaration = shape === 'with-coerced-read' ? { ...read, inputSchema: { type: 'object', properties: { offset: { type: 'integer' } }, required: ['offset'], additionalProperties: false } } : read;
    const f = await fixture([[reason, ...(shape === 'solo' ? [] : [call('read', readArgs, 'accepted-read')]), call('submit_orientation', { orientation: 'A' }, 'accepted')]], [readDeclaration, orientation]);
    f.setFault(input => {
      const operation = input.records.find(record => record.schema === 'ramify-agent.session-operation/1');
      if (!operation) return;
      const effects = operation.body['effects'] as Array<{ verdict?: { accepted?: boolean } }>;
      if (!effects?.some(effect => effect.verdict?.accepted)) return;
      if (operation.body['phase'] === 'terminal') throw new Error('Crash before terminal write');
      const provider = operation.body['provider'] as Array<{ payloadId: string }>;
      const last = provider.at(-1); if (!last) return;
      const bytes = f.payloads.get(last.payloadId); if (!bytes) return;
      const value = JSON.parse(new TextDecoder().decode(bytes)) as { messages?: Array<{ role: string }> };
      if (value.messages?.some(message => message.role === 'toolResult')) throw new Error('Crash before provider result write');
    });
    await expect((await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'accepted'))).receipt).rejects.toThrow('Crash before terminal write');
    expect(f.accepted()).toBe(1); expect(f.native.dispatches()).toBe(1); f.setFault(null);
    const interrupted = await f.store.read('run-A', 'operation:accepted');
    if (shape === 'with-coerced-read') expect((interrupted!.body['effects'] as Array<{ tool: string; input: unknown }>).find(effect => effect.tool === 'read')?.input).toEqual({ offset: 2 });
    const stateEntry = (interrupted!.body['provider'] as Array<{ key: string; payloadId: string }>).filter(item => item.key.includes(':pi-state:')).at(-1)!;
    const opaque = JSON.parse(new TextDecoder().decode(f.payloads.get(stateEntry.payloadId)!)) as { messages: Array<{ role: string }>; transport: string; packageVersion: string; model: string };
    expect(opaque).toMatchObject({ transport: 'sse', packageVersion: '0.87.1', model: 'openai-codex/gpt-5.6-sol' });
    expect(opaque.messages.some(message => message.role === 'toolResult')).toBe(false);
    expect(opaque.messages.at(-1)?.role).toBe('assistant');
    const rebuilt = createPiAgentOn(f.source).bindSessionStore!(f.store);
    const recovered = await (await rebuilt.retry({ runId: 'run-A', operationId: 'accepted', bindings: f.bindings })).receipt;
    expect(recovered).toMatchObject({ status: 'completed', turn: 1, outcome: { kind: 'submitted', input: { orientation: 'A' } } }); expect(f.accepted()).toBe(1); expect(f.native.dispatches()).toBe(1);
    f.native.push([text('Next after recovery.')]);
    await (await rebuilt.continue(f.next(f.P.sessionId, recovered.point!, 'after-recovery'))).receipt;
    expect(prefix(f.native, 1).input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }, reason, ...(shape === 'solo' ? [] : [call('read', readArgs, 'accepted-read')]), call('submit_orientation', { orientation: 'A' }, 'accepted'), ...(shape === 'solo' ? [] : [{ type: 'function_call_output', call_id: 'call_accepted-read', output: 'Exact read result.' }]), { type: 'function_call_output', call_id: 'call_accepted', output: 'The submission was accepted and recorded.' }, { role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }]);
    expect(f.reads()).toBe(shape === 'solo' ? 0 : 1);
    f.native.verify();
  });
  it.each(['unstarted', 'completed'])('restores the durable provider call with %s effect without asking the model to repeat it', async phase => {
    const f = await fixture([[reason, call('read', {}, 'recover-read')], [call('submit_orientation', { orientation: 'A' }, 'recover-submit')]]);
    f.setFault(input => {
      const operation = input.records.find(record => record.schema === 'ramify-agent.session-operation/1'); if (!operation) return;
      if (operation.body['phase'] === 'terminal') throw new Error('Crash before terminal write');
      const effects = operation.body['effects'] as Array<{ tool: string; phase: string }>;
      if (phase === 'unstarted' && effects?.some(effect => effect.tool === 'read' && effect.phase === 'intent')) throw new Error('Crash before effect intent write');
      const provider = operation.body['provider'] as Array<{ payloadId: string }>; const last = provider.at(-1); if (!last) return;
      const bytes = f.payloads.get(last.payloadId); if (!bytes) return;
      const value = JSON.parse(new TextDecoder().decode(bytes)) as { messages?: Array<{ role: string }> };
      if (value.messages?.some(message => message.role === 'toolResult')) throw new Error('Crash before result artifact write');
    });
    await expect((await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'recover-read'))).receipt).rejects.toThrow('Crash before terminal write');
    expect(f.reads()).toBe(phase === 'unstarted' ? 0 : 1); expect(f.native.dispatches()).toBe(1); f.setFault(null);
    const rebuilt = createPiAgentOn(f.source).bindSessionStore!(f.store);
    const receipt = await (await rebuilt.retry({ runId: 'run-A', operationId: 'recover-read', bindings: f.bindings })).receipt;
    expect(receipt.reason).toBeNull();
    expect(receipt).toMatchObject({ status: 'completed', turn: 1, outcome: { kind: 'submitted', input: { orientation: 'A' } } });
    expect(f.reads()).toBe(1); expect(f.native.dispatches()).toBe(2);
    expect(prefix(f.native, 1).input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'Orient A' }] }, reason, call('read', {}, 'recover-read'), { type: 'function_call_output', call_id: 'call_recover-read', output: 'Exact read result.' }]); f.native.verify();
  });
  it('missing initial role cannot dispatch the installed default prompt', async () => {
    const f = await fixture([]);
    const P = await f.operations.create({ runId: 'blank', operationId: 'create', initialInstructions: '', declarations: [read, orientation], activate: ['read', orientation.name], policy });
    const receipt = await (await f.operations.continue({ ...f.next(P.sessionId, P.point!, 'blank-task'), runId: 'blank' })).receipt;
    expect(receipt).toMatchObject({ status: 'unavailable', point: null }); expect(f.native.dispatches()).toBe(0); f.native.verify();
  });
  it('context budget ends with preserved definitions and no invented submission or compaction request', async () => {
    const f = await fixture([[call('read', {}, 'budget')]]);
    const bounded = { ...policy, context: { ...policy.context, budgetTokens: 1 } };
    const receipt = await (await f.operations.continue({ ...f.next(f.P.sessionId, f.P.point!, 'budget', { ...f.bindings, policy: bounded }), policy: bounded })).receipt;
    expect(receipt).toMatchObject({ status: 'completed', outcome: { kind: 'context-budget-reached' } }); expect(f.native.dispatches()).toBe(1); expect(f.accepted()).toBe(0);
    const snapshot = await f.operations.inspect('run-A', f.P.sessionId);
    expect(snapshot?.declarations.map(item => item.name)).toEqual(['read', 'submit_orientation']); expect(snapshot?.activeTools).toEqual(['read', 'submit_orientation']); f.native.verify();
  });
  it('a tool-call reply that reaches the budget ends after its tool result, before the next dispatch, without a fabricated error message', async () => {
    const f = await fixture([[call('read', {}, 'budget-call')]]);
    const bounded = { ...policy, context: { ...policy.context, budgetTokens: 1 } };
    const events: unknown[] = [];
    const bound = { ...f.bindings, policy: bounded, onEvent: (event: unknown) => { events.push(event); } };
    const receipt = await (await f.operations.continue({ ...f.next(f.P.sessionId, f.P.point!, 'budget-call', bound), policy: bounded })).receipt;
    expect(receipt).toMatchObject({ status: 'completed', turn: 1, outcome: { kind: 'context-budget-reached' } });
    expect(f.native.dispatches()).toBe(1); expect(f.native.requests).toHaveLength(1); expect(f.reads()).toBe(1); expect(f.accepted()).toBe(0);
    expect(events.filter(event => (event as { type: string }).type === 'context-observed')).toHaveLength(1);
    const snapshot = await f.operations.inspect('run-A', f.P.sessionId);
    const stateEntry = snapshot!.transcript.filter(item => item.kind === 'provider' && item.key.includes(':pi-state:')).at(-1)!;
    const state = JSON.parse(new TextDecoder().decode(f.payloads.get(stateEntry.payloadId)!)) as { messages: Array<{ role: string; stopReason?: string; toolCallId?: string; isError?: boolean }> };
    expect(state.messages.map(message => [message.role, message.stopReason ?? null])).toEqual([['system', null], ['user', null], ['assistant', 'toolUse'], ['toolResult', null]]);
    expect(state.messages.at(-1)).toMatchObject({ role: 'toolResult', toolName: 'read', toolCallId: 'call_budget-call|fc_budget-call' }); expect(state.messages.at(-1)?.isError).not.toBe(true);
    expect(state.messages.some(message => message.role === 'assistant' && (message.stopReason === 'error' || message.stopReason === 'aborted'))).toBe(false);
    f.native.verify();
  });
  it('Retry of an interrupted operation through an unsupported-model adapter answers unavailable with the recorded session id and leaves the operation resumable', async () => {
    const f = await fixture([[text('Interrupted before terminal write.')]]);
    f.setFault(input => { const operation = input.records.find(record => record.schema === 'ramify-agent.session-operation/1'); if (operation?.body['phase'] === 'terminal') throw new Error('Crash before terminal write'); });
    await expect((await f.operations.continue(f.next(f.P.sessionId, f.P.point!, 'interrupted'))).receipt).rejects.toThrow('Crash before terminal write');
    expect(f.native.dispatches()).toBe(1); f.setFault(null);
    const interrupted = await f.store.read('run-A', 'operation:interrupted'); expect(interrupted?.body['receipt']).toBeNull();
    const unsupported = createPiAgentOn({ ...f.source, model: 'openai-codex/gpt-5.4' }).bindSessionStore!(f.store);
    const receipt = await (await unsupported.retry({ runId: 'run-A', operationId: 'interrupted', bindings: f.bindings })).receipt;
    expect(receipt).toEqual({ runId: 'run-A', operationId: 'interrupted', sessionId: f.P.sessionId, turn: null, point: null, status: 'unavailable', outcome: null, reason: 'Session preservation supports only openai-codex/gpt-5.6-sol on openai-codex-responses' });
    expect(f.native.dispatches()).toBe(1);
    // Not recorded: the operation record is unchanged, so a supported adapter still completes the same Retry.
    expect(await f.store.read('run-A', 'operation:interrupted')).toEqual(interrupted);
    const recovered = await (await createPiAgentOn(f.source).bindSessionStore!(f.store).retry({ runId: 'run-A', operationId: 'interrupted', bindings: f.bindings })).receipt;
    expect(recovered).toMatchObject({ status: 'completed', sessionId: f.P.sessionId, turn: 1, outcome: { kind: 'ended' } }); expect(f.native.dispatches()).toBe(1);
    const missing = await (await unsupported.retry({ runId: 'run-A', operationId: 'never-started', bindings: f.bindings })).receipt;
    expect(missing).toMatchObject({ status: 'unavailable', point: null, reason: 'Operation intent missing' }); expect(await f.store.read('run-A', 'operation:never-started')).toBeNull();
    f.native.verify();
  });
});
