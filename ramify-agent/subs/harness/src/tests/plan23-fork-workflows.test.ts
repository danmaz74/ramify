import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type SessionScript } from '../../subs/agent/src/scripted.js';
import type { SessionDriverInvocation } from '../../subs/agent/src/interfaces/session-operations.js';
import type { LoadedPackage } from '../prompts/packages.js';
import { HarnessSessionOperations, readSessionPointReference, type HarnessOperationInput } from '../run/session-operations.js';
import { orientationKey } from '../reviews/inputs.js';
import { runSessionScenario } from './helpers/session-scenario.js';
import { runLayout } from '../run/records.js';
import { architectureLayout, placementRequestSchema } from '../architecture/records.js';
import { readFile } from 'node:fs/promises';
vi.mock('node:child_process', async original => (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
const context = { compaction: 'forbidden' as const, budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };
function packet(role: 'engineer'|'reviewer', operationId: string, from?: string): HarnessOperationInput {
  const name = role === 'engineer' ? 'submit_iteration_result' : 'submit_review';
  const loaded: LoadedPackage = { role, package: `${role}/fixture`, hash: role === 'engineer' ? '1'.repeat(64) : '2'.repeat(64), files: [], submissionKinds: [], system: `Stable ${role} role.`, procedure: 'Perform current task with {{submissionTool}}.', skill: '', extraSkill: '', skillDirectory: '/skills', submissionSchema: '{}', reviewer: { procedures: { code: 'Judge code with {{submissionTool}}.', scope: 'Judge scope with {{submissionTool}}.', design: 'Judge design with {{submissionTool}}.' }, orientation: { system: 'Orient current guidance.', submissionSchema: '{}' } } };
  return { runId: 'R', operationId, session: `harness-${operationId}`, loaded,
    spec: { role, scope: { workingDirectory: role === 'engineer' ? '/project/module' : '/snapshot/current' }, systemPrompt: 'Legacy composite must not replace history', prompt: 'Legacy task must not replace history', session: from ? { mode: 'fork', from } : { mode: 'fresh' }, context, builtinTools: role === 'engineer' ? ['write'] : [], tools: [], submission: { name, description: 'Owner submission', inputSchema: {}, accept: async () => ({ accepted: true }) }, onEvent: () => {} },
    brief: { kind: role === 'engineer' ? 'engineering' : 'scope', objective: role === 'engineer' ? 'Implement A' : 'Review current C2', goal: 'Preserve A', requirements: ['R1: preserve the result'], sections: [{ key: 'support:accepted', text: 'Known accepted input.' }], environment: { projectRoot: '/project', workingDirectory: role === 'engineer' ? '/project/module' : '/snapshot/current', candidate: role === 'engineer' ? null : 'C2', snapshot: role === 'engineer' ? null : 'S2', limits: { stopSettleMs: 1000 }, availableTools: [name], views: [], supportPaths: [], cucumberConfiguration: null } },
    authority: { write: role === 'engineer' }, validator: { revision: 1 }, destination: { record: operationId }, currentAuthority: async () => true };
}
async function opened(script: SessionScript) {
  const root = await mkdtemp(join(tmpdir(), 'ramify-plan23-forks-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
  const agent = createScriptedAgent([], { operationScript: script }); const adapter = await HarnessSessionOperations.open(root, agent); cleanup.push(async () => { expect(await adapter.close()).toBe(true); });
  return { adapter, agent };
}
async function settled(adapter: HarnessSessionOperations, input: HarnessOperationInput) { const turn = await adapter.start(input); expect((await turn.outcome).kind).toBe('submitted'); expect(await turn.settled()).toBe('settled'); return turn; }
describe('W03–W07 predetermined fork points', () => {
  test('F1/F2 sibling forks preserve exact numbered checkpoints while later parent briefs remain independent', async () => {
    const seen: SessionDriverInvocation[] = [];
    const { adapter } = await opened(input => { seen.push(input); return [{ kind: 'submit', input: {} }]; });
    const parent = await settled(adapter, packet('engineer', 'request')); const T1 = readSessionPointReference(parent.ref)!;
    const C1 = await adapter.append(parent.ref, 'accepted-B', 'BRIEF B BEFORE FORK'); expect(C1.outcome).toBe('appended'); if (!('ref' in C1)) throw new Error('Expected C1');
    const C2 = await adapter.append(C1.ref, 'accepted-C', 'BRIEF C AFTER FORK'); expect(C2.outcome).toBe('appended'); if (!('ref' in C2)) throw new Error('Expected C2');
    const before = await adapter.operations.inspect('R', T1.point.sessionId);
    const [left, right] = await Promise.all([settled(adapter, packet('reviewer', 'left', parent.ref)), settled(adapter, packet('reviewer', 'right', C1.ref))]);
    const L = await adapter.operations.inspect('R', readSessionPointReference(left.ref)!.point.sessionId); const R = await adapter.operations.inspect('R', readSessionPointReference(right.ref)!.point.sessionId);
    expect(L!.parent).toEqual(T1.point); expect(R!.parent).toEqual(readSessionPointReference(C1.ref)!.point);
    expect(L!.additions.map(item => item.text)).not.toContain('BRIEF B BEFORE FORK'); expect(R!.additions.map(item => item.text)).toContain('BRIEF B BEFORE FORK');
    expect([...L!.additions, ...R!.additions].map(item => item.text)).not.toContain('BRIEF C AFTER FORK');
    expect(L!.initialInstructions).toBe(before!.initialInstructions); expect(R!.initialInstructions).toBe(before!.initialInstructions);
    expect(L!.initialInstructions).toContain('Stable engineer role.');
    expect(L!.additions.some(item => item.text.includes('Stable reviewer role.'))).toBe(true);
    expect(L!.sessionId).not.toBe(R!.sessionId); expect(await adapter.operations.inspect('R', T1.point.sessionId)).toEqual(before);
    expect(seen.filter(item => item.task.role === 'reviewer').map(item => item.task.environment)).toEqual([expect.objectContaining({ candidate: 'C2', snapshot: 'S2', workingDirectory: '/snapshot/current' }), expect.objectContaining({ candidate: 'C2', snapshot: 'S2', workingDirectory: '/snapshot/current' })]);
  });
  test('inherited write and old submission declarations cannot affect current read-only child outcomes', async () => {
    let oldSubmissions = 0; const observed: import("../../subs/agent/src/interfaces/port.js").AgentEvent[] = [];
    const { adapter } = await opened(input => input.task.role === 'reviewer' ? [{ kind: 'tool', tool: 'write', input: { path: 'outside.ts', content: 'bad' } }, { kind: 'tool', tool: 'submit_iteration_result', input: {} }, { kind: 'submit', input: {} }] : [{ kind: 'submit', input: {} }]);
    const parentInput = packet('engineer', 'original'); const parent = await settled(adapter, { ...parentInput, spec: { ...parentInput.spec, submission: { ...parentInput.spec.submission, accept: async () => { oldSubmissions++; return { accepted: true }; } } } });
    const child = packet('reviewer', 'review', parent.ref); const current = await settled(adapter, { ...child, spec: { ...child.spec, onEvent: event => observed.push(event) } });
    const snapshot = await adapter.operations.inspect('R', readSessionPointReference(current.ref)!.point.sessionId);
    expect(snapshot!.declarations.map(item => item.name)).toContain('write'); expect(snapshot!.activeTools).not.toContain('write'); expect(snapshot!.activeTools).not.toContain('submit_iteration_result'); expect(snapshot!.activeTools).toContain('submit_review'); expect(oldSubmissions).toBe(1);
    expect(observed.filter(event => event.type === 'tool-finished')).toEqual(expect.arrayContaining([expect.objectContaining({ tool: 'write', isError: true }), expect.objectContaining({ tool: 'submit_iteration_result', isError: true })]));
  });
  test('a valid but missing point remains unavailable and causes no replacement model dispatch', async () => {
    let dispatches = 0; const { adapter, agent } = await opened(() => { dispatches++; return [{ kind: 'submit', input: {} }]; });
    const parent = await settled(adapter, packet('engineer', 'request')); const source = readSessionPointReference(parent.ref)!;
    agent.loseSession(source.point); expect(await adapter.hasPoint('R', parent.ref)).toBe(false);
    await expect(adapter.start(packet('reviewer', 'unavailable', parent.ref))).rejects.toThrow(/unavailable/iu); expect(dispatches).toBe(1);
  });
  test('design identity binds scope, guidance, package, model and complete-history execution independently', () => {
    const base = { guidance: [{ ref: 'rules.md', hash: 'A' }], packageHash: 'P', agent: 'pi', model: 'M', context, scope: { projectRoot: '/A', workItem: 'W', authority: 'read-only' }, execution: { history: 'complete', snapshot: 'current', compaction: 'forbidden' } };
    const key = orientationKey(base); expect(orientationKey(structuredClone(base))).toBe(key);
    for (const patch of [{ guidance: [{ ref: 'rules.md', hash: 'B' }] }, { packageHash: 'Q' }, { model: 'N' }, { scope: { ...base.scope, projectRoot: '/B' } }, { execution: { ...base.execution, history: 'unknown' } }]) expect(orientationKey({ ...base, ...patch })).not.toBe(key);
  });
  test('actual workflow records bind placement and context-selector forks to accepted request-time invocations', async () => {
    const scenario = await runSessionScenario({ cleanup: action => cleanup.push(action) });
    const starts = scenario.events.filter(event => event.type === 'invocation-started'); const opens = scenario.events.filter(event => event.type === 'session-opened');
    for (const fork of starts.filter(event => event.data.role === 'global-fork')) {
      const request = placementRequestSchema.parse(JSON.parse(await readFile(scenario.path(architectureLayout.request(fork.data.work.request!)), 'utf8')));
      const invocation = JSON.parse(await readFile(scenario.path(runLayout.invocation(fork.data.invocation)), 'utf8')) as { session: { mode: string; from: string } };
      expect(invocation.session.from).toBe(request.globalSource!.ref);
      expect(opens.find(event => event.data.session === fork.data.session)!.data.fork).toMatchObject({ from: request.globalSource!.point, briefs: request.globalSource!.appended });
    }
    for (const selector of opens.filter(event => event.data.role === 'context-selector')) {
      expect(selector.data.fork?.reason).toBe('context-selection'); const source = selector.data.fork!.from;
      expect('invocation' in source).toBe(true);
      if ('invocation' in source) expect(starts.some(event => event.data.invocation === source.invocation && event.data.session === source.session)).toBe(true);
    }
    expect(opens.filter(event => event.data.role === 'engineer').every(event => event.data.fork === undefined)).toBe(true);
  }, 180_000);
});
