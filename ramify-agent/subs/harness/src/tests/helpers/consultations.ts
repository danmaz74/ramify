import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { createScriptedAgent, createScriptedSessionDriver, type SessionScript, type SessionScriptStep } from '../../../subs/agent/src/scripted.js';
import type { SessionExecutionBindings, SessionStore, SessionOperationDriver, SessionOperations, SessionDriverInvocation } from '../../../subs/agent/src/interfaces/session-operations.js';
import { loadPromptPackages } from '../../prompts/packages.js';
import { createSessionOperations } from '../../../subs/agent/src/session-operations.js';
import { defaultRunPolicy } from '../../run/policy.js';
import { RunLog } from '../../run/log.js';
import { readSessionPointReference } from '../../run/session-operations.js';
import { WriterOwnership } from '../../run/writer.js';
import { ManualRun, manualRunner } from '../../steps/manual.js';
import { kept, type InvocationRequest } from '../../steps/runner.js';
import { composeTaskBrief } from '../../run/task-brief.js';
import { consultationTool } from '../../consultations/tools.js';
import type { ConsultationTarget } from '../../consultations/targets.js';
import { temporaryDirectory } from './fixture.js';
import { mockGit } from './mock-git.js';

export async function consultationFixture(cleanup: Array<() => Promise<void>>, script: SessionScript, wrapDriver?: (driver: SessionOperationDriver) => SessionOperationDriver) {
  const directory = await temporaryDirectory(); cleanup.push(directory.remove);
  const seen: SessionDriverInvocation[] = [];
  let seeding = true;
  let operations!: SessionOperations;
  let store!: SessionStore;
  const bindings = new Map<string, SessionExecutionBindings>();
  const recordedScript: SessionScript = input => { seen.push(input); return seeding ? [{ kind: 'submit', input: {} }] : typeof script === 'function' ? script(input) : script; };
  const scripted = createScriptedAgent([], { operationScript: recordedScript });
  const agent = { ...scripted, bindSessionStore: (injected: Parameters<NonNullable<typeof scripted.bindSessionStore>>[0]) => {
    store = injected;
    operations = wrapDriver === undefined ? scripted.bindSessionStore!(store) : createSessionOperations({ sessionStore: store, driver: wrapDriver(createScriptedSessionDriver(recordedScript)) });
    const originalContinue = operations.continue;
    operations.continue = input => { bindings.set(input.operationId, input.bindings); return originalContinue(input); };
    return operations;
  } };
  const { packages } = await loadPromptPackages({ capabilityWorkflow: true });
  const git = mockGit({});
  const policy = defaultRunPolicy({ projectRoot: directory.path });
  const log = await RunLog.open(join(directory.path, 'events.jsonl'), 'R');
  const run = new ManualRun({ schema: 'ramify-agent.job/3', kind: 'manual', planId: 'P', jobId: 'R', createdAt: new Date().toISOString(), projectRoot: directory.path, base: 'B', branch: null, origin: 'step-run', policy }, directory.path, log, new WriterOwnership({ settleMs: 1000 }));
  const { runner, close } = manualRunner({ projectRoot: directory.path, git, model: 'scripted-model', agent });
  cleanup.push(async () => { expect(await close()).toBe(true); expect(git.unexpected).toEqual([]); });
  function request(role: 'engineer' | 'local-architect' | 'global-fork' | 'capability-architect', goal: string): InvocationRequest<Record<string, unknown>> {
    const loaded = packages.get(role)!;
    const kind = { engineer: 'engineering', 'local-architect': 'assignment', 'global-fork': 'placement', 'capability-architect': 'capability' }[role] as 'engineering' | 'assignment' | 'placement' | 'capability';
    const toolName = { engineer: 'submit_iteration_result', 'local-architect': 'submit_work_item_result', 'global-fork': 'submit_placement_decision', 'capability-architect': 'submit_capability_action' }[role];
    return { role, work: { workItem: 'W', iteration: 'W.i01' }, attempt: 1, loaded, systemPrompt: loaded.system, prompt: goal, start: { mode: 'fresh' },
      toolName, description: 'Current task submission', inputSchema: {}, submissionSchema: 'fixture-answer/1', validate: raw => ({ ok: true, value: raw as Record<string, unknown> }),
      brief: composeTaskBrief(directory.path, { kind, work: { workItem: 'W' }, goal, requirements: ['Preserve caller task'], prompt: goal, omit: [], literalSections: [], startingPointGroups: [], environment: {
        projectRoot: directory.path, workingDirectory: directory.path, candidate: null, snapshot: null, limits: policy.limits, availableTools: [toolName, 'consult_architect'], views: [{ path: '.ramify-architect', revision: 'G0', modules: [], coverage: ['Fixture view may be stale'] }], supportPaths: [], cucumberConfiguration: null } }),
      reader: true, scope: { write: null, measurement: null, size: null }, keep: () => kept };
  }
  const seeds: Record<string, ConsultationTarget> = {};
  for (const role of ['local-architect', 'global-fork', 'capability-architect'] as const) {
    const result = await runner.runInvocation(run, agent, request(role, `Seed ${role}`)); expect(result.ended, result.error).toBe('submitted');
    seeds[role] = { role, run: { planId: 'P', runId: 'R' }, session: result.session, point: { session: result.session, invocation: result.id }, ref: result.ref,
      ...(role === 'capability-architect' ? { task: 'cap-002' } : {}) };
  }
  const parents = await Promise.all(Object.values(seeds).map(seed => operations.inspect('R', readSessionPointReference(seed.ref)!.point.sessionId)));
  seeding = false;
  async function caller(role: 'engineer' | 'local-architect', target: ConsultationTarget, global: ConsultationTarget | null = null, extra: Partial<InvocationRequest<Record<string, unknown>>> = {}) {
    let session = '' as ConsultationTarget['session'];
    const base = request(role, 'Caller continues ordinary work');
    return runner.runInvocation(run, agent, { ...base, ...extra, onStarted: async (_id, started) => { session = started; },
      equip: context => ({ tools: [consultationTool({ run, runner, agent, packages, target, global, caller: { role, session, work: base.work },
        projectRoot: directory.path, holdMs: run.policy.limits.invocationAbsoluteMs, now: () => new Date(), views: base.brief!.environment.views }, context)] }) });
  }
  return { directory: directory.path, run, runner, agent, operations, packages, seeds, parents, seen, caller, request, store, bindings };
}
export const ask = (message = '  Exact question\nNew facts.  ', callId = 'ask'): SessionScriptStep => ({ kind: 'tool', tool: 'consult_architect', input: { message }, callId });
export const answer = (text = '  Exact answer\nEvidence.  '): SessionScriptStep => ({ kind: 'submit', input: { answer: text } });

/** Opt-in retention of the actual small run evidence; never copies project source or provider stores. */
export async function retainConsultationExample(fixture: Awaited<ReturnType<typeof consultationFixture>>, name: string): Promise<void> {
  const root = process.env['RAMIFY_PLAN33_EVIDENCE_DIR'];
  if (root === undefined) return;
  if (fixture.run.live.size !== 0) throw new Error('Consultation evidence must be retained after settlement');
  for (const transcript of fixture.run.transcripts.values()) await transcript.drain();
  const target = join(root, name);
  await mkdir(target, { recursive: true });
  for (const artifact of ['events.jsonl', 'invocations', 'transcripts', 'blobs', 'consultations']) {
    await cp(join(fixture.directory, artifact), join(target, artifact), { recursive: true }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
  await writeFile(join(target, 'job.json'), JSON.stringify(fixture.run.record, null, 2) + '\n');
  await writeFile(join(target, 'example.json'), JSON.stringify({ schema: 'ramify-agent.plan33-example/1', name, run: { planId: fixture.run.planId, runId: fixture.run.jobId },
    originalDirectory: fixture.directory, consultations: fixture.run.log.all('consultation-started').map(event => event.data.consultation),
    limits: ['Scripted neutral provider; no live advice evaluation', 'Caller result observations do not establish subsequent model consumption', 'Usage is available only where actual scripted port events reported it'] }, null, 2) + '\n');
}
