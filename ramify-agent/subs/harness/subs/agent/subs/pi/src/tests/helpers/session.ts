import { rootDescription } from '../../../../../../../src/tests/helpers/root-description.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, ToolDefinition, SubmissionVerdict } from '../../../../../src/interfaces/port.js';
import type { AgentSessionPoint, SessionExecutionBindings, SessionExecutionPolicy, SessionStore, SessionStoreRecord, SessionToolDeclaration } from '../../../../../src/interfaces/session-operations.js';
import { createPiAgentOn, type PiRuntimeSource } from '../../pi-agent.js';
import { piBuiltinDeclarations } from '../../session-operations.js';
import { nativeCodexRuntime } from './scripted-provider.js';

/** A disposable working directory with a `module.ramify` and whatever files a test asks for. */
export async function workspace(cleanups: Array<() => Promise<void>>, files: Record<string, string> = {}): Promise<{ workingDirectory: string }> {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-cwd-'));
  cleanups.push(() => rm(workingDirectory, { recursive: true, force: true }));
  await writeFile(join(workingDirectory, 'module.ramify'), rootDescription('demo'));
  for (const [name, content] of Object.entries(files)) await writeFile(join(workingDirectory, name), content);
  return { workingDirectory };
}


export const nativeCall = (name: string, input: unknown, id = name) => ({ type: 'function_call', id: `fc_${id}`, call_id: `call_${id}`, name, arguments: JSON.stringify(input) });
export const nativeText = (value: string) => ({ type: 'message', id: 'msg_fixture', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: value, annotations: [] }], status: 'completed' });
export const submission: SessionToolDeclaration = { name: 'submit_map', description: 'Submit current map.', inputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false }, mutating: false };
export function memoryStore() {
  const records = new Map<string, SessionStoreRecord>(); const payloads = new Map<string, Uint8Array>();
  const store: SessionStore = {
    async read(run, id) { return structuredClone(records.get(JSON.stringify([run, id])) ?? null); },
    async putPayload(bytes) { const id = createHash('sha256').update(bytes).digest('hex'); payloads.set(id, new Uint8Array(bytes)); return id; },
    async getPayload(id) { return payloads.get(id) ?? null; },
    async commit(input) {
      if (input.expected.some(item => (records.get(JSON.stringify([input.runId, item.id]))?.revision ?? null) !== item.revision)) return { kind: 'conflict', reason: 'CAS' };
      for (const record of input.records) records.set(JSON.stringify([input.runId, record.id]), structuredClone(record));
      return { kind: 'committed' };
    },
  }; return { store, records, payloads };
}
/** Installed supported serializer with entirely scripted HTTP replies and a public neutral store. */
export async function preservingPi(cleanups: Array<() => Promise<void>>, outputs: Parameters<typeof nativeCodexRuntime>[0], options: {
  files?: Record<string, string>; tools?: readonly ToolDefinition[]; builtins?: readonly ('read'|'grep'|'find'|'ls'|'edit'|'write')[];
  verdicts?: SubmissionVerdict[]; model?: string; policy?: SessionExecutionPolicy; instructions?: string;
} = {}) {
  const places = await workspace(cleanups, options.files); const native = await nativeCodexRuntime(outputs); cleanups.push(native.remove);
  const memory = memoryStore(); const source: PiRuntimeSource = { runtime: async () => native.runtime, agentDirectory: native.agentDirectory, model: options.model ?? 'openai-codex/gpt-5.6-sol' };
  const agent = createPiAgentOn(source); const operations = agent.bindSessionStore!(memory.store);
  const policy: SessionExecutionPolicy = options.policy ?? { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { write: true }, validator: { revision: 1 }, destination: { record: 'map' } };
  const declarations: readonly SessionToolDeclaration[] = [...piBuiltinDeclarations(options.builtins ?? [], places.workingDirectory), ...(options.tools ?? []).map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, mutating: tool.mutating === true })), submission];
  const initial = await operations.create({ runId: 'pi-test', operationId: 'create', initialInstructions: options.instructions ?? 'Exact role instructions.', declarations, activate: declarations.map(item => item.name), policy });
  const task = { role: 'engineer', message: 'Current task.', submissionTool: submission.name, environment: { workingDirectory: places.workingDirectory, candidate: null, snapshot: null, limits: {} }, policyIdentity: 'p1', validatorIdentity: 'v1', destinationIdentity: 'd1' };
  const events: AgentEvent[] = []; const judged: unknown[] = []; const verdicts = [...(options.verdicts ?? [])];
  const bindings: SessionExecutionBindings = { task, policy, tools: options.tools ?? [], submission: { name: submission.name, async accept(input) { judged.push(input); return verdicts.shift() ?? { accepted: true }; } }, currentAuthority: async () => true, onEvent: event => events.push(event), publish: async () => {} };
  const input = (point: AgentSessionPoint = initial.point!, operationId = 'task', bound = bindings) => ({ runId: 'pi-test', operationId, sessionId: point.sessionId, expectedPoint: point, task: bound.task, policy: bound.policy, additions: [], toolChange: { add: [], activate: [], inactivate: [] }, bindings: bound });
  return { ...places, ...memory, native, source, agent, operations, initial, policy, declarations, bindings, task, events, judged, input };
}
export function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
export async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) { if (Date.now() > deadline) throw new Error('Timed out waiting for a condition'); await delay(10); }
}
