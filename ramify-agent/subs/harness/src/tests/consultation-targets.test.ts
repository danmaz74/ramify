import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { consultationAvailability, consultationInputsSchema, consultationTargetSchema, captureGlobalTarget, engineerConsultationInputs, localConsultationInputs, unavailableConsultation } from '../consultations/targets.js';
import { globalContext } from '../architecture/context.js';
import { RunLog, type RunEventOf } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { HarnessSessionOperations, type HarnessOperationInput } from '../run/session-operations.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { constructEngineerStep } from '../steps/engineer.js';
import { constructStep } from '../steps/construct.js';
import { parseStepInputs } from '../steps/inputs.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { repairContinuationRun } from './helpers/repair-run.js';
import { freeze, openRuns, runEventsOnDisk, runPath, staleCrashLock, until, type OpenRunsOptions } from './helpers/runs.js';
import { copyFixture } from './helpers/fixture.js';
import { runSessionScenario } from './helpers/session-scenario.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const identity = { planId: 'P', runId: 'R' };
async function histories() {
  const directory = await temporaryDirectory(); cleanup.push(directory.remove);
  const agent = createScriptedAgent([], { operationScript: () => [{ kind: 'submit', input: {} }] });
  const operations = await HarnessSessionOperations.open(join(directory.path, 'sessions'), agent); cleanup.push(async () => { await operations.close(); });
  const { packages } = await loadPromptPackages({ capabilityWorkflow: false });
  const log = await RunLog.open(join(directory.path, 'events.jsonl'), 'R');
  async function turn(id: string, role: 'initial-architect' | 'local-architect' | 'capability-architect') {
    const submission = role === 'initial-architect' ? 'submit_initial_analysis' : 'submit_work_item_result';
    const input: HarnessOperationInput = { runId: 'R', operationId: id, session: ({ global: 'ses-0001', local: 'ses-0002', capability: 'ses-0003', nested: 'ses-0004' } as Record<string,string>)[id]!, loaded: packages.get(role === 'capability-architect' ? 'local-architect' : role)!,
      spec: { role, scope: { workingDirectory: directory.path }, systemPrompt: 'Architect', prompt: 'Accepted dispatch', session: { mode: 'fresh' },
        context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, builtinTools: [], tools: [],
        submission: { name: submission, description: 'Record point', inputSchema: {}, accept: async () => ({ accepted: true }) }, onEvent: () => {} },
      brief: { kind: role === 'initial-architect' ? 'initial-analysis' : 'assignment', objective: 'Dispatch', goal: 'Work', requirements: ['Preserve the assignment'], sections: [], environment: { projectRoot: directory.path, workingDirectory: directory.path, candidate: null, snapshot: null, limits: { stopSettleMs: 1000 }, availableTools: [submission], views: [], supportPaths: [], cucumberConfiguration: null } },
      authority: { write: false }, validator: {}, destination: {}, currentAuthority: async () => true };
    const execution = await operations.start(input); expect((await execution.outcome).kind).toBe('submitted'); expect(await execution.settled()).toBe('settled');
    return execution.ref;
  }
  return { log, operations, turn, directory: directory.path };
}

describe('Plan 33 C01-C03 consultation target derivation', () => {
  test('C01: G0 remains pinned after model-free G1 append, a resumed dispatch captures G1, and reopening reuses it', async () => {
    const { log, operations, turn, directory } = await histories();
    const G0 = await turn('global', 'initial-architect');
    await log.append({ type: 'invocation-started', data: { invocation: 'global', session: 'ses-0001', role: 'initial-architect', work: {}, start: 'opened' } });
    const context = () => globalContext({ events: log.events, sessionRef: () => G0 });
    const target0 = captureGlobalTarget(identity, context())!;
    await log.append({ type: 'work-item-started', data: { workItem: 'wi-001', module: 'M', origin: 'entry', globalTarget: target0 } });
    const appended = await operations.append(G0, 'G1', 'Later global facts'); if (!('ref' in appended)) throw new Error('append unavailable');
    await log.append({ type: 'brief-appended', data: { decision: 'gd-1', session: 'ses-0001', ref: appended.ref, generation: 1, outcome: 'appended' } });
    expect(localConsultationInputs(log.events, 'wi-001')).toEqual({ global: target0 });
    const target1 = captureGlobalTarget(identity, context())!;
    expect(target1.ref).toBe(appended.ref); expect(target1.point).toEqual({ session: 'ses-0001', append: log.version });
    await log.append({ type: 'work-item-yielded', data: { workItem: 'wi-001', requirements: ['rq'], invocation: 'local' } });
    await log.append({ type: 'work-item-resumed', data: { workItem: 'wi-001', requirements: ['rq'], globalTarget: target1 } });
    const reopened = await RunLog.open(join(directory, 'events.jsonl'), 'R');
    expect(localConsultationInputs(reopened.events, 'wi-001')).toEqual({ global: target1 });
    expect(reopened.all('work-item-resumed')).toHaveLength(1);
    expect(captureGlobalTarget(identity, { ...context(), ref: null, point: null })).toBeNull();
  });

  test('C02: local/capability assignments retain L0/K0 through later appends and handbacks; nested task uses its own coordinator', async () => {
    const { log, operations, turn } = await histories();
    const global = consultationTargetSchema.parse({ role: 'global-fork', run: identity, session: 'ses-0001', ref: await turn('global', 'initial-architect'), point: { session: 'ses-0001', invocation: 'global' } });
    await log.append({ type: 'work-item-started', data: { workItem: 'wi-001', module: 'M', origin: 'entry', globalTarget: global } });
    const L0 = await turn('local', 'local-architect');
    await log.append({ type: 'iteration-assigned', data: { workItem: 'wi-001', iteration: 'wi-001.i01', kind: 'implementation', scopeRevision: 1, invocation: 'local', decisions: [], architectRef: { session: 'ses-0002', ref: L0 } } });
    const original = engineerConsultationInputs(log.events, identity, 'wi-001.i01');
    const L1 = await operations.append(L0, 'L1', 'Later assignment context'); if (!('ref' in L1)) throw new Error('append unavailable');
    expect(engineerConsultationInputs(log.events, identity, 'wi-001.i01')).toEqual(original);
    const K0 = await turn('capability', 'capability-architect');
    await log.append({ type: 'capability-assigned', data: { task: 'cap-001', assignment: 'cap-001.i01', sequence: 1, invocation: 'capability', architectRef: { session: 'ses-0003', ref: K0 } } });
    const K1 = await operations.append(K0, 'K1', 'Capability advanced'); if (!('ref' in K1)) throw new Error('append unavailable');
    const nested = await turn('nested', 'capability-architect');
    await log.append({ type: 'capability-assigned', data: { task: 'cap-002', assignment: 'cap-002.i01', sequence: 1, invocation: 'nested', architectRef: { session: 'ses-0004', ref: nested } } });
    await log.append({ type: 'capability-handed-back', data: { task: 'cap-002', handback: 'hb-1', invocation: 'nested' } });
    expect(engineerConsultationInputs(log.events, identity, 'cap-001.i01')).toEqual({ assigning: expect.objectContaining({ role: 'capability-architect', task: 'cap-001', ref: K0 }) });
    expect(engineerConsultationInputs(log.events, identity, 'cap-002.i01')).toEqual({ assigning: expect.objectContaining({ task: 'cap-002', ref: nested }) });
    await log.append({ type: 'iteration-assigned', data: { workItem: 'wi-001', iteration: 'wi-001.i02', kind: 'implementation', scopeRevision: 2, invocation: 'local-next', decisions: [], architectRef: { session: 'ses-0002', ref: L1.ref } } });
    expect(engineerConsultationInputs(log.events, identity, 'wi-001.i02').assigning?.ref).toBe(L1.ref);
    expect(engineerConsultationInputs(log.events, identity, 'wi-001.i01')).toEqual(original);
    expect(engineerConsultationInputs(log.events, identity, 'missing').assigning).toBeUndefined();
    const unavailable = unavailableConsultation(original, 'No provider history imported');
    expect(consultationAvailability(unavailable, 'engineer').target).toBeNull(); expect(unavailable.provenance?.assigning).toEqual(original.assigning);
    expect(consultationAvailability(original, 'context-selector').target).toBeNull();
    expect(consultationTargetSchema.safeParse({ ...global, run: { ...identity, runId: 'other' } }).success).toBe(false);
    expect(consultationTargetSchema.safeParse({ ...global, point: { session: 'other', invocation: 'global' } }).success).toBe(false);
    expect(consultationInputsSchema.safeParse({ assigning: global }).success).toBe(false);
    expect(consultationInputsSchema.safeParse({ global: original.assigning }).success).toBe(false);
  });

  test('C02/C03: actual engineer repair inputs retain assignment and dispatch targets; old inputs render without them', async () => {
    const fixture = await repairContinuationRun(cleanup);
    const events = await runEventsOnDisk(fixture.root, fixture.planId, fixture.runId);
    const directory = runPath(fixture.root, fixture.planId, fixture.runId);
    const starts = events.filter((event): event is RunEventOf<'invocation-started'> => event.type === 'invocation-started' && event.data.role === 'engineer');
    const { packages } = await loadPromptPackages({ capabilityWorkflow: true });
    const inputs = await Promise.all(starts.map(event => readFile(join(directory, runLayout.stepInputs(event.data.invocation)), 'utf8').then(parseStepInputs)));
    expect(inputs).toHaveLength(2);
    if (inputs[0]?.role !== 'engineer' || inputs[1]?.role !== 'engineer') throw new Error('engineer expected');
    expect(inputs[1].start.kind).toBe('repair-continuation'); expect(inputs[1].consultation).toEqual(inputs[0].consultation);
    const step = constructEngineerStep(inputs[0], { projectRoot: fixture.root, packages });
    expect(step.consultation.target?.ref).toBe(events.find(event => event.type === 'iteration-assigned')?.data.architectRef?.ref);
    expect(step.prompt).toContain('Consultation context: local-architect');
    expect(step.equipment.tools.map(tool => tool.name)).toContain('consult_architect');
    const { consultation: _removed, ...legacy } = inputs[0];
    expect(constructEngineerStep(legacy, { projectRoot: fixture.root, packages }).consultation.target).toBeNull();
    expect(constructEngineerStep(legacy, { projectRoot: fixture.root, packages }).prompt).not.toContain('Consultation context:');
  }, 30_000);

  test('C01/C03: actual yielded/resumed workflow captures append point at new dispatch and constructors agree', async () => {
    const scenario = await runSessionScenario({ cleanup: action => cleanup.push(action) });
    const dispatches = scenario.events.filter(event => event.type === 'work-item-started' || event.type === 'work-item-resumed');
    const first = dispatches.find(event => event.type === 'work-item-started' && event.data.workItem === 'wi-001')!;
    const resumed = dispatches.find(event => event.type === 'work-item-resumed' && event.data.workItem === 'wi-001')!;
    expect(first.data.globalTarget?.point).toHaveProperty('invocation'); expect(resumed.data.globalTarget?.point).toHaveProperty('append');
    expect(first.data.globalTarget?.ref).not.toBe(resumed.data.globalTarget?.ref);
    const { packages } = await loadPromptPackages({ capabilityWorkflow: false });
    for (const started of scenario.events.filter((event): event is RunEventOf<'invocation-started'> => event.type === 'invocation-started' && event.data.role === 'local-architect')) {
      const inputs = parseStepInputs(await readFile(scenario.path(runLayout.stepInputs(started.data.invocation)), 'utf8'));
      if (inputs.role !== 'local-architect') throw new Error('local expected');
      expect(inputs.consultation).toEqual(localConsultationInputs(scenario.events, started.data.work.workItem!, started.sequence));
      const step = constructStep(inputs, { projectRoot: scenario.root, packages });
      expect('consultation' in step ? step.consultation : undefined).toEqual(consultationAvailability(inputs.consultation ?? undefined, inputs.role));
    }
  }, 30_000);

  test('C01: restoring an actual resumed dispatch does not dispatch or pin it again', async () => {
    const fixture = await copyFixture(); cleanup.push(fixture.remove);
    let reached = false; let runId = ''; let boundaries!: OpenRunsOptions;
    let script!: Parameters<typeof createScriptedAgent>[0];
    const original = runSessionScenario({ root: fixture.root, cleanup: () => undefined,
      onOpened: (_opened, external, supplied) => { boundaries = external; script = supplied; },
      afterWrite: async (kind, id) => {
        if (kind === 'work-item-resumed') { runId = id; reached = true; await freeze(); }
      },
    });
    void original.catch(() => undefined);
    await until(() => reached, 20_000);
    const before = await runEventsOnDisk(fixture.root, 'review-notes', runId);
    const dispatch = before.find(event => event.type === 'work-item-resumed')!;
    expect(dispatch.type === 'work-item-resumed' && dispatch.data.globalTarget?.point).toHaveProperty('append');
    await staleCrashLock(fixture.root);
    const restarted = await openRuns(fixture.root, { ...boundaries, afterWrite: undefined, agent: createScriptedAgent(script) });
    try {
      await restarted.service.settled('review-notes', runId);
      const events = await runEventsOnDisk(fixture.root, 'review-notes', runId);
      expect(restarted.service.getRun('review-notes', runId)?.state, JSON.stringify(events.at(-1))).toBe('completed');
      expect(events.filter(event => event.type === 'work-item-resumed')).toEqual([dispatch]);
      const recovered = events.find(event => event.sequence > dispatch.sequence && event.type === 'invocation-started' && event.data.role === 'local-architect' && event.data.work.workItem === 'wi-001');
      if (recovered?.type !== 'invocation-started') throw new Error('Restored local context expected');
      const inputs = parseStepInputs(await readFile(runPath(fixture.root, 'review-notes', runId, runLayout.stepInputs(recovered.data.invocation)), 'utf8'));
      expect(inputs.role === 'local-architect' && inputs.consultation).toEqual(localConsultationInputs(before, 'wi-001'));
    } finally { await restarted.service.close(); }
  }, 30_000);
});
