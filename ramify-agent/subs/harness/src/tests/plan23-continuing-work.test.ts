import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createScriptedAgent, type ScriptedAgent, type SessionScript } from '../../subs/agent/src/scripted.js';
import type { AgentPort, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { SessionDriverInvocation, SessionStore } from '../../subs/agent/src/interfaces/session-operations.js';
import { HarnessSessionOperations, readSessionPointReference, genericSessionDriverUnavailableError, type HarnessOperationInput } from '../run/session-operations.js';
import type { LoadedPackage } from '../prompts/packages.js';
import type { Role } from '../interfaces/protocol/runs.js';
import type { TaskKind } from '../prompts/tasks.js';
import { exactInputHash } from '../prompts/delivered-manifest.js';
import { readTranscript, readBody } from '../transcripts/writer.js';
import { ContentStore } from '../transcripts/store.js';
import { taskSupportSections } from '../run/service.js';
import { runLayout } from '../run/records.js';
import { qualificationActionSchema } from '../capability/submission.js';

import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, freeze, installTestRunner, openRuns, runEventsOnDisk, runPath, staleCrashLock, startRun, until } from './helpers/runs.js';
import { scenarioGit } from './helpers/recovery-git.js';
import { runSessionScenario } from './helpers/session-scenario.js';
import type { OpenRunsOptions } from './helpers/runs.js';
import { declaringScenarios } from './helpers/declarations.js';
vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
const roots: string[] = [];
const adapters: HarnessSessionOperations[] = [];
afterEach(async () => {
  for (const adapter of adapters.splice(0)) await adapter.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function expectOriginalTranscript(root: string, runId: string, operation: string, session: string) {
  const directory = runPath(root, 'review-notes', runId);
  const transcript = await readTranscript(join(directory, runLayout.transcript(session)));
  const starts = transcript.entries.filter(entry => entry.type === 'started' && entry.invocation === operation);
  expect(starts).toHaveLength(1);
  const start = starts[0]!;
  if (start.type !== 'started') throw new Error('Missing original invocation start');
  const intent = JSON.parse(await readFile(join(root, 'plans/.harness/session-operations/correlations/operations', `${exactInputHash(JSON.stringify([runId, operation]))}.json`), 'utf8')) as { packet: { roleInstructions: string; message: string } };
  const store = new ContentStore(join(directory, runLayout.blobs));
  expect(await readBody(directory, store, start.systemPrompt)).toBe(intent.packet.roleInstructions);
  expect(await readBody(directory, store, start.prompt)).toBe(intent.packet.message);
  expect(transcript.unreadable).toEqual([]);
}
const context = { compaction: 'forbidden' as const, budgetTokens: 10000, budgetFraction: null, reportReserveTokens: 0 };
const toolOf: Partial<Record<TaskKind, string>> = { orientation: 'submit_work_orientation', assignment: 'submit_work_item_result', completion: 'submit_work_item_result', repair: 'submit_iteration_result',
  engineering: 'submit_iteration_result', contract: 'submit_contract_result', capability: 'submit_capability_action', 'capability-qualification': 'submit_capability_qualification', consultation: 'answer_capability_consultation' };
function loaded(role: Role): LoadedPackage {
  return { role, package: `${role}/test`, hash: '0'.repeat(64), files: [], submissionKinds: [], system: `Enduring ${role} instructions.`, procedure: 'Perform the named current task and submit through {{submissionTool}}.', skill: '', skillDirectory: '/skills', extraSkill: '',
    submissionSchema: '{"type":"object","properties":{"result":{"type":"string"}},"required":["result"],"additionalProperties":false}',
    workOrientation: { procedure: 'Read the supplied work goal and requirements; submit through {{submissionTool}}.', submissionSchema: '{"type":"object","properties":{"focus":{"type":"string"}}}' } };
}
function input(role: Role, kind: TaskKind, operationId: string, ref?: string): HarnessOperationInput {
  const name = toolOf[kind]!;
  const spec: SessionSpec = { role, scope: { workingDirectory: '/project/src' }, systemPrompt: 'LEGACY COMPOSITE HEAD MUST NOT BE DELIVERED', prompt: 'LEGACY MESSAGE MUST NOT BE DELIVERED',
    session: ref ? { mode: 'continue', ref } : { mode: 'fresh' }, context, builtinTools: [], tools: [],
    submission: { name, description: 'Legacy submission schema copy must not be delivered', inputSchema: { type: 'object' }, accept: async () => ({ accepted: true }) }, onEvent: () => undefined };
  return { runId: 'run-A', operationId, session: 'ses-A', loaded: loaded(role), spec,
    brief: { kind, objective: `${kind} current work`, goal: 'G1: expose the status', requirements: ['R1: show the status label'], sections: [{ key: 'support:owner', text: 'Read supplied owner evidence V1.' }],
      environment: { projectRoot: '/project', workingDirectory: '/project/src', candidate: null, snapshot: null, limits: { stopSettleMs: 1000 }, availableTools: [name], views: [], supportPaths: [], cucumberConfiguration: null } },
    authority: { owner: 'owner-A', paths: ['src'] }, validator: { schema: 'current-validator/1' }, destination: { record: operationId }, currentAuthority: async () => true };
}
async function open(script: SessionScript, agentOverride?: (agent: ScriptedAgent) => AgentPort, directory?: string) {
  const root = directory ?? await mkdtemp(join(tmpdir(), 'ramify-plan23-continuations-'));
  if (!directory) roots.push(root);
  const agent = createScriptedAgent([], { operationScript: script });
  const adapter = await HarnessSessionOperations.open(root, agentOverride?.(agent) ?? agent);
  adapters.push(adapter); return { root, agent, adapter };
}
async function turn(adapter: HarnessSessionOperations, request: HarnessOperationInput) {
  const session = await adapter.start(request); const outcome = await session.outcome;
  expect(outcome.kind).toBe('submitted'); expect(await session.settled()).toBe('settled');
  return session;
}

type CommitInput = Parameters<SessionStore['commit']>[0];
type CommitPath = 'ordinary' | 'captured';
type FaultHit = { path: CommitPath; runId: string; operationId: string; phase: 'intent' | 'terminal' };

/** Fixture faults preserve the advertised strong admission and its original receiver. */
function interceptCommits(store: SessionStore, before: (input: CommitInput, path: CommitPath) => (() => Promise<void>) | undefined): SessionStore {
  const captured = store.commitCaptured?.bind(store);
  const intercept = (input: CommitInput, commit: SessionStore['commit'], path: CommitPath): ReturnType<SessionStore['commit']> => {
    try {
      // Select/copy fault evidence synchronously. A returned hook closes over
      // only that evidence; it never rereads borrowed bodies after admission.
      const after = before(input, path);
      const committed = commit(input); // Real captured producer runs before any await.
      return committed.then(async result => { if (result.kind === 'committed') await after?.(); return result; });
    } catch (error) { return Promise.reject(error); }
  };
  const fault: SessionStore = { ...store, commit: input => intercept(input, value => store.commit(value), 'ordinary') };
  if (captured) fault.commitCaptured = input => intercept(input, captured, 'captured');
  return fault;
}

 describe('W01/W02: harness-owned continued tasks', () => {
  test.each(['ordinary', 'captured'] as const)('fault adapter delegates the %s producer synchronously and runs its snapshotted hook after completion', async path => {
    const order: string[] = []; let finish!: () => void; const completed = new Promise<void>(resolve => { finish = resolve; });
    let owned: CommitInput | undefined;
    const store: SessionStore = { async read() { return null; }, async putPayload() { return 'unused'; }, async getPayload() { return null; },
      commit(value) { expect(this).toBe(store); order.push('ordinary producer'); owned = structuredClone(value); return completed.then(() => ({ kind: 'committed' })); },
      commitCaptured(value) { expect(this).toBe(store); order.push('captured producer'); owned = JSON.parse(JSON.stringify(value)) as CommitInput; return completed.then(() => ({ kind: 'committed' })); },
    };
    const controlled = interceptCommits(store, (value, method) => { const phase = value.records[0]!.body['phase']; order.push(`before:${method}:${phase}`); return async () => { order.push(`after:${method}:${phase}`); }; });
    const body = { phase: 'intent' };
    const value: CommitInput = { runId: 'fixed-run', expected: [{ id: 'operation:fixed', revision: null }], records: [{ runId: 'fixed-run', id: 'operation:fixed', revision: 1, schema: 'ramify-agent.session-operation/1', body }], payloads: [] };
    const answer = path === 'captured' ? controlled.commitCaptured!(value) : controlled.commit(value);
    expect(order).toEqual([`before:${path}:intent`, `${path} producer`]);
    body.phase = 'changed after admission';
    expect(owned?.records[0]?.body).toEqual({ phase: 'intent' });
    finish(); expect(await answer).toEqual({ kind: 'committed' }); expect(order).toEqual([`before:${path}:intent`, `${path} producer`, `after:${path}:intent`]);
  });
  test('a captured CAS conflict or rejected producer never reports a post-durable fault prefix', async () => {
    for (const result of ['conflict', 'rejected'] as const) {
      const order: string[] = [];
      const store: SessionStore = { async read() { return null; }, async putPayload() { return 'unused'; }, async getPayload() { return null; },
        async commit() { throw new Error('The advertised producer must remain active'); },
        commitCaptured() { expect(this).toBe(store); order.push('captured producer'); return result === 'conflict' ? Promise.resolve({ kind: 'conflict', reason: 'Actual CAS refused' }) : Promise.reject(new Error('Actual write refused')); },
      };
      const controlled = interceptCommits(store, (_input, path) => { order.push(`before:${path}`); return async () => { order.push('post-durable prefix'); }; });
      const value: CommitInput = { runId: 'fixed-run', expected: [{ id: 'operation:fixed', revision: null }], records: [{ runId: 'fixed-run', id: 'operation:fixed', revision: 1, schema: 'ramify-agent.session-operation/1', body: { phase: 'intent' } }], payloads: [] };
      const answer = controlled.commitCaptured!(value);
      if (result === 'conflict') expect(await answer).toEqual({ kind: 'conflict', reason: 'Actual CAS refused' });
      else await expect(answer).rejects.toThrow('Actual write refused');
      expect(order).toEqual(['before:captured', 'captured producer']);
    }
  });
  test('separately delivered goal blocks preserve literal support, embedded JSON and fenced goal lines in the actual packet', async () => {
    const support = '# Current support\nUnknown stays unknown. Literal JSON: {"goal":"no","unknown":"known"}.\n```text\nno\n{"goal":"no"}\n```';
    const prompt = `# Goal\nno\n\n# Requirements\nR1\n\n${support}`;
    const sections = taskSupportSections(prompt, ['no', 'R1']);
    expect(sections).toEqual([{ key: 'support:# Current support:0', text: support }]);
    const observed: SessionDriverInvocation[] = [];
    const { adapter } = await open(invocation => { observed.push(invocation); return [{ kind: 'submit', input: {} }]; });
    const request = input('engineer', 'engineering', 'literal-support');
    await turn(adapter, { ...request, brief: { ...request.brief, goal: 'no', requirements: ['R1'], sections } });
    const packet = (await adapter.packet('run-A', 'literal-support'))!;
    expect(packet.message).toContain(support);
    expect(observed[0]!.task.message).toBe(packet.message);
    expect(packet.manifest.entries.find(entry => entry.key.includes('support:# Current support:0'))).toMatchObject({ hash: exactInputHash(`# Block brief:support:# Current support:0\nCurrent value; replaces any earlier value for this key.\n${support}`), bytes: Buffer.byteLength(`# Block brief:support:# Current support:0\nCurrent value; replaces any earlier value for this key.\n${support}`), delivery: 'appended' });
    expect(packet.message.split('# Goal\n').length - 1).toBe(1);
    expect(packet.message).not.toContain('# Requirements\n\n');
  });
  test('orientation, assignment, qualification and completion use one session with stable head, new actual tool and current-only deltas', async () => {
    const observed: SessionDriverInvocation[] = [];
    const { adapter } = await open(invocation => { observed.push(invocation); return [{ kind: 'submit', input: invocation.task.submissionTool === 'submit_capability_qualification'
      ? { kind: 'unresolved', request: 'cr-1', invocation: 'engineer-1', problem: 'Insufficient exposed API evidence', evidence: ['V1 does not establish behavior'] } : { result: 'accepted' } }]; });
    const first = await turn(adapter, input('local-architect', 'orientation', 'op-1'));
    const appended = await adapter.append(first.ref, 'selected-package:1', 'K1: current selected requirement package');
    expect(appended.outcome).toBe('appended'); if (appended.outcome !== 'appended') throw new Error('missing parent');
    const second = await turn(adapter, input('local-architect', 'assignment', 'op-2', appended.ref));
    const qualification = input('local-architect', 'capability-qualification', 'op-3', second.ref);
    let validations = 0;
    const third = await turn(adapter, { ...qualification, spec: { ...qualification.spec, submission: { ...qualification.spec.submission, accept: async value => {
      validations++; return qualificationActionSchema.safeParse(value).success ? { accepted: true } : { accepted: false, errors: ['Invalid actual qualification action'] };
    } } }, brief: { ...qualification.brief, requirements: ['R2: show the changed label'] } });
    const completion = input('local-architect', 'completion', 'op-4', third.ref);
    await turn(adapter, { ...completion, brief: { ...completion.brief, requirements: ['R2: show the changed label'] } });
    expect(validations).toBe(1);
    expect(new Set(observed.map(item => item.session.sessionId)).size).toBe(1);
    expect(observed.map(item => item.session.currentPoint.turn)).toEqual([0, 1, 2, 3]);
    expect(observed.map(item => item.session.initialInstructions)).toEqual(Array(4).fill('Enduring local-architect instructions.'));
    expect(observed.map(item => item.task.submissionTool)).toEqual(['submit_work_orientation', 'submit_work_item_result', 'submit_capability_qualification', 'submit_work_item_result']);
    expect(observed[0]!.task.message).toContain('G1: expose the status'); expect(observed[0]!.task.message).toContain('R1: show the status label');
    expect(observed[1]!.task.message).not.toContain('G1: expose the status'); expect(observed[1]!.task.message).not.toContain('R1: show the status label');
    expect(observed[1]!.session.additions.some(addition => addition.text.includes('K1:'))).toBe(true);
    expect(observed[2]!.task.message).toContain('R2: show the changed label'); expect(observed[2]!.task.message).not.toContain('R1: show the status label');
    expect(observed[3]!.task.message).not.toContain('R2: show the changed label');
    expect(JSON.stringify(observed)).not.toContain('LEGACY COMPOSITE'); expect(JSON.stringify(observed)).not.toContain('Legacy submission schema copy');
    const declaration = observed[2]!.session.declarations.find(item => item.name === 'submit_capability_qualification')!;
    expect(declaration.inputSchema).toEqual({ type: 'object' }); expect(JSON.parse(declaration.description.slice(declaration.description.indexOf('{')))).toEqual(z.toJSONSchema(qualificationActionSchema));
  });
  test.each([['engineer', 'engineering', 'repair'], ['contract-engineer', 'contract', 'contract'], ['capability-architect', 'capability', 'capability-qualification']] as const)('%s same-work repair/qualification remains in its original session after reopening', async (role, initialKind, nextKind) => {
    const observed: SessionDriverInvocation[] = [];
    const script: SessionScript = invocation => { observed.push(invocation); return [{ kind: 'submit', input: { result: 'current answer' } }]; };
    const first = await open(script); const initial = await turn(first.adapter, input(role, initialKind, 'op-first'));
    await first.adapter.close();
    const next = await open(script, undefined, first.root);
    const request = input(role, nextKind, 'op-next', initial.ref);
    const continued = await turn(next.adapter, { ...request, brief: { ...request.brief, environment: { ...request.brief.environment, workingDirectory: '/project/subs/owner/src' } }, spec: { ...request.spec, scope: { workingDirectory: '/project/subs/owner/src' } } });
    expect(readSessionPointReference(initial.ref)!.point.sessionId).toBe(readSessionPointReference(continued.ref)!.point.sessionId);
    expect(observed[1]!.session.currentPoint.turn).toBe(1); expect(observed[1]!.session.initialInstructions).toBe(`Enduring ${role} instructions.`);
    expect(observed[1]!.task.environment.workingDirectory).toBe('/project/subs/owner/src'); expect(observed[1]!.task.message).not.toContain('R1: show the status label');
  });
  test('role-changing Continue appends its new role without replacing the existing head', async () => {
    const observed: SessionDriverInvocation[] = [];
    const { adapter } = await open(invocation => { observed.push(invocation); return [{ kind: 'submit', input: {} }]; });
    const parent = await turn(adapter, input('local-architect', 'assignment', 'op-role1'));
    await turn(adapter, input('engineer', 'engineering', 'op-role2', parent.ref));
    expect(observed[1]!.session.initialInstructions).toBe('Enduring local-architect instructions.');
    expect(observed[1]!.session.additions.filter(item => item.kind === 'role-instructions').map(item => item.text)).toEqual(['Enduring engineer instructions.']);
    expect(observed[1]!.session.activeTools).not.toContain('submit_work_item_result');
  });
  test('restored scripted perception sees inherited obligations while emitted current packet and manifest retain only their delta', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan23-perception-')); roots.push(root);
    const perceived: string[] = [];
    const script = (spec: SessionSpec) => { perceived.push(spec.prompt); return [{ kind: 'submit' as const, input: { result: 'known current obligations' } }]; };
    const firstAgent = createScriptedAgent(script);
    const first = await HarnessSessionOperations.open(root, firstAgent); adapters.push(first);
    const initial = input('local-architect', 'assignment', 'perceived-first');
    const obligations = '# Registered obligations\n- sc-001 (scenario): bound, revision 2; show status';
    const brief = { ...initial.brief, sections: [{ key: 'support:obligations', text: obligations }] };
    const started = await turn(first, { ...initial, brief }); await first.close();
    const secondAgent = createScriptedAgent(script);
    const second = await HarnessSessionOperations.open(root, secondAgent); adapters.push(second);
    const continued = input('local-architect', 'completion', 'perceived-next', started.ref);
    await turn(second, { ...continued, brief: { ...brief, kind: 'completion', objective: 'Report current completion' } });
    expect(perceived[1]!.split(obligations)).toHaveLength(2);
    const current = secondAgent.sessions[0]!.spec.prompt;
    expect(current).not.toContain(obligations); expect(secondAgent.sessions[0]!.inherited.join('\n')).toContain(obligations);
    const packet = await second.packet('run-A', 'perceived-next');
    expect(packet!.message).toBe(current);
    expect(packet!.manifest.entries.some(entry => entry.key.includes('support:obligations') && entry.delivery === 'inherited')).toBe(true);
    expect(packet!.manifest.entries.some(entry => entry.key.includes('support:obligations') && entry.delivery === 'appended')).toBe(false);
  });
  test('unavailable high-level driver and unknown point never dispatch or create another session', async () => {
    let factoryCalls = 0;
    const agent = createScriptedAgent([]);
    const unsupported: AgentPort = { name: agent.name, support: agent.support, get sessionOperations() { factoryCalls++; return null; } };
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan23-unavailable-')); roots.push(root);
    await expect(HarnessSessionOperations.open(root, unsupported)).rejects.toThrow(genericSessionDriverUnavailableError);
    let dispatches = 0; const modern = await open(() => { dispatches++; return [{ kind: 'submit', input: {} }]; });
    await expect(modern.adapter.start(input('engineer', 'repair', 'unknown-parent', 'pi-file:old-entry'))).rejects.toThrow('session point is unavailable');
    expect([factoryCalls, dispatches]).toEqual([0, 0]);
  });
  test('a saved harness intent before Create and before Continue completes the same idempotent preparation', async () => {
    let dispatches = 0;
    const script: SessionScript = () => { dispatches++; return [{ kind: 'submit', input: {} }]; };
    const first = await open(script);
    const request = input('engineer', 'engineering', 'intent-only');
    await expect(first.adapter.start({ ...request, prepared: async () => { throw new Error('interrupted after harness intent'); } })).rejects.toThrow('interrupted after harness intent');
    await first.adapter.close();
    let beforeContinue = true; const created: string[] = [];
    const second = await open(script, agent => ({ ...agent, bindSessionStore(store) { const operations = agent.bindSessionStore(store); return { ...operations,
      async create(value) { const receipt = await operations.create(value); created.push(receipt.sessionId); return receipt; },
      async continue(value) { if (beforeContinue) { beforeContinue = false; throw new Error('interrupted after Create'); } return operations.continue(value); },
    }; } }), first.root);
    await expect(second.adapter.start(request)).rejects.toThrow('interrupted after Create');
    const resumed = await turn(second.adapter, request);
    expect(dispatches).toBe(1); expect(new Set(created).size).toBe(1); expect(readSessionPointReference(resumed.ref)!.point.turn).toBe(1);
    await turn(second.adapter, request); expect(dispatches).toBe(1);
    await expect(second.adapter.start({ ...request, brief: { ...request.brief, requirements: ['Changed unauthorized Retry input'] } })).rejects.toThrow('Conflicting harness session correlation');
  });
  test('unfinished operation Retry rebinds fresh closures but preserves original task/policy and already accepted destination effect', async () => {
    let blockTerminal = true; let firstEffects = 0; let retryEffects = 0; const observed: SessionDriverInvocation[] = []; const terminalFaults: FaultHit[] = [];
    const script: SessionScript = invocation => { observed.push(invocation); return [{ kind: 'submit', callId: 'fixed-acceptance', input: { result: 'original result' } }]; };
    const first = await open(script, agent => ({ ...agent, bindSessionStore(store) {
      const fault = interceptCommits(store, (value, path) => {
        if (blockTerminal && value.records.some(record => record.id === 'operation:retry-original' && record.body['phase'] === 'terminal')) {
          terminalFaults.push({ path, runId: value.runId, operationId: 'retry-original', phase: 'terminal' });
          throw new Error('interrupted terminal commit');
        }
        return undefined;
      }); return agent.bindSessionStore(fault);
    } }));
    const request = input('engineer', 'engineering', 'retry-original');
    const session = await first.adapter.start({ ...request, spec: { ...request.spec, submission: { ...request.spec.submission, accept: async () => { firstEffects++; return { accepted: true }; } } } });
    await expect(session.outcome).rejects.toThrow('interrupted terminal commit');
    expect(terminalFaults.length).toBeGreaterThan(0);
    expect(new Set(terminalFaults.map(hit => `${hit.path}:${hit.runId}:${hit.operationId}:${hit.phase}`))).toEqual(new Set(['captured:run-A:retry-original:terminal']));
    await expect(session.settled()).rejects.toThrow('Cannot attest quiescence'); await first.adapter.close(); blockTerminal = false;
    const next = await open(script, undefined, first.root);
    const resumed = await turn(next.adapter, { ...request, spec: { ...request.spec, submission: { ...request.spec.submission, accept: async () => { retryEffects++; return { accepted: true }; } } } });
    expect([firstEffects, retryEffects]).toEqual([1, 0]); expect(observed[1]!.recovering).toBe(true);
    expect(observed[1]!.task).toEqual(observed[0]!.task); expect(readSessionPointReference(resumed.ref)!.point.turn).toBe(1);
    expect(observed[1]!.task.destinationIdentity).toBe(observed[0]!.task.destinationIdentity);
  });
  test('a provider rejecting idle evidence for a live original owner keeps store ownership until positively reobserved', async () => {
    let ownerLive = true;
    const { adapter } = await open([{ kind: 'submit', input: {} }], agent => ({ ...agent, bindSessionStore(store) {
      const operations = agent.bindSessionStore(store);
      return { ...operations, async continue(value) { const handle = await operations.continue(value); return { ...handle,
        settled: async () => { if (ownerLive) throw new Error('Original execution owner remains live'); return handle.settled(); },
      }; } };
    } }));
    const session = await adapter.start(input('engineer', 'engineering', 'original-live-owner'));
    expect((await session.outcome).kind).toBe('submitted');
    await expect(session.settled()).rejects.toThrow('Original execution owner remains live');
    expect(await adapter.close()).toBe(false);
    ownerLive = false; expect(await session.settled()).toBe('settled'); expect(await adapter.close()).toBe(true);
  });
  test('Stop fences acceptance immediately while a live mutation check remains bounded and unavailable for reuse', async () => {
    let begin!: () => void; const began = new Promise<void>(resolve => { begin = resolve; });
    let release!: () => void; const checked = new Promise<void>(resolve => { release = resolve; });
    let submissions = 0;
    const { adapter } = await open([{ kind: 'tool', callId: 'mutation-1', tool: 'mutate', input: {} }, { kind: 'submit', callId: 'late-submit', input: {} }]);
    const base = input('engineer', 'engineering', 'stopped-check');
    const session = await adapter.start({ ...base, brief: { ...base.brief, environment: { ...base.brief.environment, limits: { stopSettleMs: 30 }, availableTools: ['mutate', 'submit_iteration_result'] } }, spec: { ...base.spec,
      tools: [{ name: 'mutate', description: 'Controlled mutation', inputSchema: { type: 'object' }, mutating: true, execute: async () => ({ text: 'Changed source' }) }],
      afterMutation: async () => { begin(); await checked; return { text: 'Settled controlled check' }; },
      submission: { ...base.spec.submission, accept: async () => { submissions++; return { accepted: true }; } },
    } });
    await began;
    try {
      await session.stop();
      expect(await session.outcome).toEqual({ kind: 'stopped' });
      expect(await session.settled()).toBe('timed-out');
      expect(session.ref).toBe(''); expect(submissions).toBe(0);
      expect(await adapter.close()).toBe(false);
    } finally { release(); }
    expect(await session.settled()).toBe('settled'); expect(submissions).toBe(0);
    expect(await adapter.close()).toBe(true);
  });
  test.each(['accepted', 'unfinished'] as const)('ordinary service restart restores the exact %s intake phase before another task', async phase => {
    const fixture = await copyFixture(); roots.push(fixture.root); await installTestRunner(fixture.root);
    const git = scenarioGit(fixture.root, { head: 'restoration-source', after: 'restoration-source', commits: [], recovered: [] });
    let reached = false; let fault = true; const intentFaults: FaultHit[] = [];
    const firstScripted = createScriptedAgent(declaringScenarios([{ kind: 'submit', input: emptyAnalysis() }]));
    const firstAgent: AgentPort = phase === 'accepted' ? firstScripted : { ...firstScripted, bindSessionStore(store) {
      const interrupted = interceptCommits(store, (value, path) => {
        if (!fault || !value.records.some(record => record.id === 'operation:inv-0001' && record.body['phase'] === 'intent')) return undefined;
        const hit: FaultHit = { path, runId: value.runId, operationId: 'inv-0001', phase: 'intent' };
        return async () => { fault = false; reached = true; intentFaults.push(hit); await freeze(); };
      }); return firstScripted.bindSessionStore(interrupted);
    } };
    const first = await openRuns(fixture.root, { git, agent: firstAgent, afterWrite: async kind => { if (phase === 'accepted' && kind === 'invocation-ended') { reached = true; await freeze(); } } });
    const receipt = await first.service.execute(startRun('review-notes')); await until(() => reached);
    expect(intentFaults).toEqual(phase === 'unfinished' ? [{ path: 'captured', runId: receipt.jobId, operationId: 'inv-0001', phase: 'intent' }] : []);
    await staleCrashLock(fixture.root);
    const resumed = createScriptedAgent(declaringScenarios(spec => spec.role === 'initial-architect'
      ? [{ kind: 'fail', error: 'Controlled stop after restored intake' }] : []));
    const second = await openRuns(fixture.root, { git, agent: resumed });
    try {
      await second.service.settled('review-notes', receipt.jobId);
      const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
      expect(events.filter(event => event.type === 'invocation-started' && event.data.invocation === 'inv-0001')).toHaveLength(1);
      expect(events.filter(event => event.type === 'invocation-ended' && event.data.invocation === 'inv-0001')).toEqual([expect.objectContaining({ data: expect.objectContaining({ ended: 'submitted' }) })]);
      expect(resumed.sessions.filter(record => record.spec.role === 'catalog-extractor')).toHaveLength(phase === 'accepted' ? 0 : 1);
      expect(events.some(event => event.type === 'job-interrupted')).toBe(false);
      expect(git.unexpected).toEqual([]);
    } finally { await second.service.close(); }
  }, 120_000);
  test.each(['original', 'missing', 'raw-input', 'normalized-value', 'file-bytes', 'validator', 'destination'] as const)('terminal service Retry authenticates %s acceptance without a second accept or model dispatch', async variant => {
    const fixture = await copyFixture(); roots.push(fixture.root); await installTestRunner(fixture.root);
    const git = scenarioGit(fixture.root, { head: 'terminal-source', after: 'terminal-source', commits: [], recovered: [] });
    let reached = false;
    const scripted = createScriptedAgent(declaringScenarios([{ kind: 'submit', input: emptyAnalysis() }]));
    const agent: AgentPort = { ...scripted, bindSessionStore(store) {
      const operations = scripted.bindSessionStore(store);
      return { ...operations, async continue(value) {
        const handle = await operations.continue(value);
        return { ...handle, receipt: handle.receipt.then(async receipt => { await handle.settled(); reached = true; await freeze(); return receipt; }) };
      } };
    } };
    const first = await openRuns(fixture.root, { git, agent });
    const receipt = await first.service.execute(startRun('review-notes')); await until(() => reached);
    const correlation = join(fixture.root, 'plans/.harness/session-operations/correlations/acceptances', `${exactInputHash(JSON.stringify([receipt.jobId, 'inv-0001']))}.json`);
    if (variant === 'missing') await rm(correlation);
    else if (variant === 'file-bytes') await writeFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.submission('inv-0001')), '{}');
    else if (variant !== 'original') {
      const value = JSON.parse(await readFile(correlation, 'utf8')) as Record<string, unknown>;
      value[({ 'raw-input': 'input', 'normalized-value': 'value', validator: 'validator', destination: 'destination' } as const)[variant]] = { changed: true };
      await writeFile(correlation, JSON.stringify(value));
    }
    await staleCrashLock(fixture.root);
    const resumed = createScriptedAgent(declaringScenarios(spec => spec.role === 'initial-architect' ? [{ kind: 'fail', error: 'Controlled stop after original accepted task' }] : []));
    const second = await openRuns(fixture.root, { git, agent: resumed });
    try {
      await second.service.settled('review-notes', receipt.jobId);
      const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
      expect(resumed.sessions.filter(record => record.spec.role === 'catalog-extractor')).toHaveLength(0);
      expect(events.filter(event => event.type === 'invocation-started' && event.data.invocation === 'inv-0001')).toHaveLength(1);
      const ended = events.find(event => event.type === 'invocation-ended' && event.data.invocation === 'inv-0001');
      if (variant === 'original') { expect(ended).toMatchObject({ data: { ended: 'submitted' } }); const start = events.find(event => event.type === 'invocation-started' && event.data.invocation === 'inv-0001')!; if (start.type === 'invocation-started') await expectOriginalTranscript(fixture.root, receipt.jobId, 'inv-0001', start.data.session); }
      else { expect(ended).toBeUndefined(); expect(resumed.sessions).toHaveLength(0); expect(second.service.getRun('review-notes', receipt.jobId)?.state).toBe('failed'); }
      expect(git.unexpected).toEqual([]);
    } finally { await second.service.close(); }
  }, 120_000);
  test.each([['engineer', 'unfinished'], ['engineer', 'accepted'], ['contract-engineer', 'unfinished'], ['contract-engineer', 'accepted'], ['contract-engineer', 'registered'], ['local-architect', 'completion-outline']] as const)('ordinary %s restores its %s original phase and completes without duplicate handbacks', async (role, phase) => {
    const fixture = await copyFixture(); roots.push(fixture.root);
    let reached = false; let operation = ''; let runId = ''; let boundaries!: OpenRunsOptions; let originalScript!: Parameters<typeof createScriptedAgent>[0];
    let selected = false; const intentFaults: FaultHit[] = [];
    const scenario = runSessionScenario({ root: fixture.root, cleanup: () => undefined,
      onOpened: (_opened, external, script) => { boundaries = external; originalScript = script; },
      afterWrite: async (kind, id) => {
        if (phase === 'registered' && kind === 'contract-registered') { reached = true; await freeze(); }
        if (phase === 'completion-outline' && kind === 'outline-revised') {
          const event = (await runEventsOnDisk(fixture.root, 'review-notes', id)).at(-1);
          if (event?.type === 'outline-revised' && event.data.architectRef !== undefined) { operation = event.data.invocation; runId = id; reached = true; await freeze(); }
        }
      },
      port: scripted => ({ ...scripted, bindSessionStore(store) {
        let faultOperation = '';
        const controlled = interceptCommits(store, (value, path) => {
          if (phase !== 'unfinished' || !faultOperation || !value.records.some(record => record.id === `operation:${faultOperation}` && record.body['phase'] === 'intent')) return undefined;
          const hit: FaultHit = { path, runId: value.runId, operationId: faultOperation, phase: 'intent' };
          return async () => { reached = true; intentFaults.push(hit); await freeze(); };
        });
        const operations = scripted.bindSessionStore(controlled);
        return { ...operations, async continue(value) {
          const target = !selected && value.task.role === role;
          if (target) { selected = true; operation = value.operationId; runId = value.runId; if (phase === 'unfinished') faultOperation = operation; }
          const handle = await operations.continue(value);
          return target && phase === 'accepted' ? { ...handle, receipt: handle.receipt.then(async receipt => { await handle.settled(); reached = true; await freeze(); return receipt; }) } : handle;
        } };
      } }),
    });
    void scenario.catch(() => undefined);
    await until(() => reached, 20000);
    expect(intentFaults).toEqual(phase === 'unfinished' ? [{ path: 'captured', runId, operationId: operation, phase: 'intent' }] : []);
    await staleCrashLock(fixture.root);
    const resumedAgent = createScriptedAgent(originalScript);
    // The scenario's original contract gate states revision-01. Its normal
    // forward-only fixture only supplies the final candidate; restoration also
    // needs this original unchanged scripted tree, not a native Git fallback.
    const candidates = { ...boundaries.candidates!, async commitTree(project: string, commit: string) {
      if (commit === 'revision-01') { expect(project).toBe(fixture.root); return 'a'.repeat(40); }
      return boundaries.candidates!.commitTree(project, commit);
    } };
    let originalGateProof = phase === 'registered';
    const git = { ...boundaries.git!, async previewCandidateTree(project: string) {
      if (originalGateProof) { originalGateProof = false; expect(project).toBe(fixture.root); return { repositoryRoot: fixture.root, head: 'revision-01', tree: 'a'.repeat(40) }; }
      return boundaries.git!.previewCandidateTree(project);
    } };
    const restarted = await openRuns(fixture.root, { ...boundaries, git, candidates, afterWrite: undefined, agent: resumedAgent });
    try {
      await restarted.service.settled('review-notes', runId);
      const events = await runEventsOnDisk(fixture.root, 'review-notes', runId);
      expect(restarted.service.getRun('review-notes', runId)?.state, JSON.stringify(events.at(-1)) + restarted.warnings.join('\n')).toBe('completed');
      expect(events.filter(event => event.type === 'invocation-started' && event.data.invocation === operation)).toHaveLength(1);
      expect(events.filter(event => event.type === 'invocation-ended' && event.data.invocation === operation)).toHaveLength(1);
      const originalStart = events.find(event => event.type === 'invocation-started' && event.data.invocation === operation)!;
      if (originalStart.type === 'invocation-started') await expectOriginalTranscript(fixture.root, runId, operation, originalStart.data.session);
      expect(events.filter(event => event.type === 'contract-registered')).toHaveLength(1);
      expect(events.filter(event => event.type === 'contract-requested')).toHaveLength(1);
      expect(events.filter(event => event.type === 'iteration-closed' && event.data.iteration === 'wi-001.i01')).toHaveLength(1);
      expect(events.filter(event => event.type === 'iteration-closed' && event.data.iteration === 'wi-001.i02')).toHaveLength(1);
      expect(events.some(event => event.type === 'job-interrupted')).toBe(false);
    } finally { await restarted.service.close(); }
  }, 120_000);
  test('current authority is checked before restored dispatch and designated submission', async () => {
    let dispatches = 0; let accepts = 0;
    const { adapter } = await open(() => { dispatches++; return [{ kind: 'submit', input: {} }]; });
    const request = input('engineer', 'engineering', 'denied-authority');
    const session = await adapter.start({ ...request, currentAuthority: async () => false, spec: { ...request.spec, submission: { ...request.spec.submission, accept: async () => { accepts++; return { accepted: true }; } } } });
    expect(await session.outcome).toMatchObject({ kind: 'failed', error: 'Current authority denied operation' });
    expect(await session.settled()).toBe('settled'); expect([dispatches, accepts]).toEqual([0, 0]);
  });
 });
