import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { AgentEvent, ToolDefinition } from '../../../../src/interfaces/port.js';
import type { AgentSessionPoint, SessionExecutionBindings, SessionOperationHandle, SessionToolDeclaration } from '../../../../src/interfaces/session-operations.js';
import { nativeCall, preservingPi, submission, until } from './helpers/session.js';

beforeAll(() => { process.env.PI_OFFLINE = '1'; });
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const stringSchema = (key: string) => ({ type: 'object', properties: { [key]: { type: 'string', minLength: 1 } }, required: [key], additionalProperties: false });
const consult: SessionToolDeclaration = { name: 'consult_architect', description: 'Advisory consultation.', inputSchema: stringSchema('message'), mutating: false };
const answer: SessionToolDeclaration = { name: 'answer_architect_consultation', description: 'Answer this advisory consultation.', inputSchema: stringSchema('answer'), mutating: false };
const declaration = (tool: SessionToolDeclaration): ToolDefinition => ({ ...tool, execute: async () => ({ text: 'Unused binding' }) });
async function retain(name: string, value: unknown) {
  const directory = process.env['RAMIFY_PLAN33_PI_EVIDENCE'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n');
}

describe('Plan 33 C18 real Pi adapter nested consultation transport', () => {
  test('awaits both answers, restores exact source prefixes and sends literal results to subsequent scripted native requests', async () => {
    const f = await preservingPi(cleanup, [
      [nativeCall('submit_map', { summary: 'G0 dispatched local work' }, 'G0')],
      [nativeCall('submit_map', { summary: 'L0 assigned engineer' }, 'L0')],
      [nativeCall('consult_architect', { message: 'Engineer literal question' }, 'engineer-question')],
      [nativeCall('consult_architect', { message: 'Local literal question' }, 'local-question')],
      [nativeCall('consult_architect', { message: 'Forbidden onward question' }, 'inactive-consult'), nativeCall('submit_map', { summary: 'Forbidden inherited submission' }, 'inactive-submit')],
      [nativeCall('answer_architect_consultation', { answer: 'Global literal advice' }, 'global-answer')],
      [nativeCall('answer_architect_consultation', { answer: 'Local composed literal advice' }, 'local-answer')],
      [nativeCall('submit_map', { summary: 'Engineer ordinary completion' }, 'engineer-done')],
    ], { builtins: ['read', 'grep', 'ls'] });
    const G0 = (await (await f.operations.continue(f.input(f.initial.point!, 'dispatch-global'))).settled()).point!;
    const L = await f.operations.create({ runId: 'pi-test', operationId: 'create-local', initialInstructions: 'Local original assignment instructions.', declarations: f.declarations, activate: f.declarations.map(tool => tool.name), policy: f.policy });
    const L0 = (await (await f.operations.continue(f.input(L.point!, 'assign-local'))).settled()).point!;
    for (const [name, source] of [['global', G0], ['local', L0]] as const) await f.operations.appendContext({ runId: 'pi-test', operationId: `later-${name}`, sessionId: source.sessionId, expectedPoint: source,
      additions: [{ key: `later-${name}`, kind: 'brief', text: `LATER ${name} UPDATE MUST NOT BE INHERITED`, revision: 'later' }] });
    const parentsBefore = await Promise.all([G0, L0].map(point => f.operations.inspect('pi-test', point.sessionId)));
    const children: Array<{ role: string; point: AgentSessionPoint; handle: SessionOperationHandle }> = [];
    const received: string[] = [];
    const events: AgentEvent[] = [];
    const ask = (role: 'local'|'global', source: AgentSessionPoint): ToolDefinition => ({ ...consult,
      execute: async (input, signal) => {
        const child = await f.operations.fork({ runId: 'pi-test', operationId: `fork-${role}`, sourcePoint: source });
        expect(child.status).toBe('completed');
        let accepted = '';
        const task = { ...f.task, role: role === 'local' ? 'local-architect' : 'global-fork', message: `Advisory only: ${(input as { message: string }).message}`, submissionTool: answer.name };
        const bindings: SessionExecutionBindings = { ...f.bindings, task, tools: role === 'local' ? [ask('global', G0)] : [],
          onEvent: event => events.push(event), submission: { name: answer.name, accept: async input => { accepted = (input as { answer: string }).answer; return { accepted: true }; } } };
        const handle = await f.operations.continue({ ...f.input(child.point!, `answer-${role}`, bindings),
          additions: [{ key: 'consultation', kind: 'activation-instructions', text: 'Answer only; investigate with read-only tools.', revision: '1' }],
          toolChange: { add: role === 'local' ? [answer, consult] : [answer], activate: ['read', 'grep', 'ls', answer.name, ...(role === 'local' ? [consult.name] : [])], inactivate: [submission.name] } });
        children.push({ role, point: child.point!, handle });
        const stop = () => { void handle.stop(); }; signal.addEventListener('abort', stop, { once: true });
        try { if (signal.aborted) stop(); expect((await handle.settled()).status).toBe('completed'); received.push(accepted); return { text: accepted }; }
        finally { signal.removeEventListener('abort', stop); }
      },
    });
    const E = await f.operations.create({ runId: 'pi-test', operationId: 'create-engineer', initialInstructions: 'Engineer ordinary task.', declarations: [consult, submission], activate: [consult.name, submission.name], policy: f.policy });
    const engineerBindings = { ...f.bindings, tools: [ask('local', L0)], onEvent: (event: AgentEvent) => events.push(event) };
    const engineer = await f.operations.continue(f.input(E.point!, 'engineer', engineerBindings));
    expect((await engineer.settled()).outcome).toEqual({ kind: 'submitted', input: { summary: 'Engineer ordinary completion' } });
    expect(received).toEqual(['Global literal advice', 'Local composed literal advice']);
    expect(await Promise.all([G0, L0].map(point => f.operations.inspect('pi-test', point.sessionId)))).toEqual(parentsBefore);
    const snapshots = await Promise.all(children.map(child => f.operations.inspect('pi-test', child.point.sessionId)));
    expect(snapshots.find(snapshot => snapshot?.parent?.sessionId === G0.sessionId)!.activeTools).toEqual(['read', 'grep', 'ls', answer.name]);
    expect(snapshots.find(snapshot => snapshot?.parent?.sessionId === L0.sessionId)!.activeTools).toEqual(['read', 'grep', 'ls', answer.name, consult.name]);
    for (const snapshot of snapshots) {
      const parent = await f.operations.inspect('pi-test', snapshot!.parent!.sessionId, snapshot!.parent!);
      expect(snapshot!.transcript.slice(0, parent!.transcript.length)).toEqual(parent!.transcript);
      expect(snapshot!.additions.map(addition => addition.text).join('\n')).not.toContain('LATER');
      expect(snapshot!.activeTools).not.toContain(submission.name);
    }
    await retain('nested-before-assertions.json', { requests: f.native.requests, snapshots, events });
    const localRequest = f.native.requests[3]!; const globalRequest = f.native.requests[4]!;
    expect(JSON.stringify(localRequest)).toContain('L0 assigned engineer'); expect(JSON.stringify(localRequest)).not.toContain('LATER');
    expect(JSON.stringify(globalRequest)).toContain('G0 dispatched local work'); expect(JSON.stringify(globalRequest)).not.toContain('LATER');
    const tools = (request: Record<string, unknown>) => (request['tools'] as Array<{ name: string }>).map(tool => tool.name);
    // Installed native transport keeps the original tool-definition prefix.
    // Active replacements arrive in ordered input context; actual neutral
    // activeTools above decide which tools execute.
    expect(tools(localRequest)).toEqual(tools(f.native.requests[1]!));
    expect(tools(globalRequest)).toEqual(tools(f.native.requests[0]!));
    expect(JSON.stringify(localRequest['input'])).toContain(consult.name);
    expect(JSON.stringify(globalRequest['input'])).toContain(answer.name);
    const results = (index: number) => (f.native.requests[index]!['input'] as Array<Record<string, unknown>>).filter(item => item['type'] === 'function_call_output');
    expect(results(6)).toContainEqual(expect.objectContaining({ call_id: 'call_local-question', output: 'Global literal advice' }));
    expect(results(7)).toContainEqual(expect.objectContaining({ call_id: 'call_engineer-question', output: 'Local composed literal advice' }));
    expect(events.filter(event => event.type === 'message' && event.role === 'tool-result' && event.tool === consult.name && !event.isError)).toHaveLength(2);
    expect(events.filter(event => event.type === 'message' && event.role === 'tool-result' && event.isError)).toHaveLength(2);
    f.native.verify();
    await retain('nested-native-requests.json', { requests: f.native.requests, wireRequests: f.native.wireRequests, parentsBefore, parentsAfter: await Promise.all([G0,L0].map(point => f.operations.inspect('pi-test', point.sessionId))), snapshots, events, received });
  });

  test('caller stop aborts both awaited Pi forks and drains listeners without a late answer or implicit retry', async () => {
    const f = await preservingPi(cleanup, [
      [nativeCall('submit_map', { summary: 'G0' })], [nativeCall('submit_map', { summary: 'L0' })],
      [nativeCall(consult.name, { message: 'Engineer asks' }, 'outer')],
      [nativeCall(consult.name, { message: 'Local asks' }, 'inner')], null,
    ]);
    const { operations, policy, task } = f;
    const events: AgentEvent[] = []; const accepted: unknown[] = [];
    const base: SessionExecutionBindings = { task, policy, tools: [], submission: { name: submission.name, accept: async () => ({ accepted: true }) }, currentAuthority: async () => true, onEvent: event => events.push(event), publish: async () => {} };
    const seed = async (id: string) => { const created = await operations.create({ runId: 'cancel', operationId: `create-${id}`, initialInstructions: id, declarations: [submission], activate: [submission.name], policy });
      const turn = await operations.continue({ runId: 'cancel', operationId: id, sessionId: created.sessionId, expectedPoint: created.point!, task, policy, bindings: base, additions: [], toolChange: { add: [], activate: [], inactivate: [] } }); return (await turn.settled()).point!; };
    const G0 = await seed('global'); const L0 = await seed('local');
    const children: SessionOperationHandle[] = []; const signals: AbortSignal[] = []; const released: string[] = [];
    const ask = (role: 'local'|'global', source: AgentSessionPoint): ToolDefinition => ({ ...declaration(consult), execute: async (input, signal) => {
      signals.push(signal);
      const fork = await operations.fork({ runId: 'cancel', operationId: `fork-${role}`, sourcePoint: source });
      const current = { ...task, role, message: (input as { message: string }).message, submissionTool: answer.name };
      const bound: SessionExecutionBindings = { ...base, task: current, tools: role === 'local' ? [ask('global', G0)] : [], submission: { name: answer.name, accept: async input => { accepted.push(input); return { accepted: true }; } } };
      const child = await operations.continue({ runId: 'cancel', operationId: `answer-${role}`, sessionId: fork.sessionId, expectedPoint: fork.point!, task: current, policy, bindings: bound, additions: [], toolChange: { add: role === 'local' ? [consult, answer] : [answer], activate: role === 'local' ? [consult.name, answer.name] : [answer.name], inactivate: [submission.name] } });
      children.push(child); const stop = () => { void child.stop(); }; signal.addEventListener('abort', stop, { once: true });
      try { if (signal.aborted) stop(); await child.settled(); return { text: 'Interrupted', isError: true }; }
      finally { signal.removeEventListener('abort', stop); released.push(role); }
    } });
    const E = await operations.create({ runId: 'cancel', operationId: 'create-E', initialInstructions: 'Engineer', declarations: [consult, submission], activate: [consult.name, submission.name], policy });
    const caller = await operations.continue({ runId: 'cancel', operationId: 'engineer', sessionId: E.sessionId, expectedPoint: E.point!, task, policy, bindings: { ...base, tools: [ask('local', L0)] }, additions: [], toolChange: { add: [], activate: [], inactivate: [] } });
    await until(() => f.native.requests.length === 5 && children.length === 2, 2000).catch(error => { throw new Error(String(error) + JSON.stringify({ requests: f.native.requests, children: children.length, events })); });
    await caller.stop(); expect((await caller.settled()).status).toBe('stopped');
    expect(signals.map(signal => signal.aborted)).toEqual([true, true]); expect(released.sort()).toEqual(['global', 'local']); expect(accepted).toEqual([]);
    for (const child of children) expect((await child.settled()).status).toBe('stopped');
    const before = f.native.requests.length; const replay = await operations.retry({ runId: 'cancel', operationId: 'engineer', bindings: { ...base, tools: [ask('local', L0)] } });
    expect((await replay.settled()).status).toBe('stopped'); expect(f.native.requests).toHaveLength(before); f.native.verify();
    await retain('nested-cancellation.json', { requests: f.native.requests, signals: signals.map(signal => signal.aborted), released, accepted, events, records: [...f.records] });
  });
});
