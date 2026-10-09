import { afterEach, expect, test, vi } from 'vitest';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Script, ScriptStep } from '../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { SubmittedElement } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { readAcceptedEvidence } from '../analysis/evidence.js';
import { intakeToolName } from '../analysis/extraction.js';
import { readRecordedContextSelection } from '../context-selection/recorded.js';
import { contextSelectorToolName } from '../context-selection/submissions.js';
import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import type { RunEvent, RunEventOf } from '../run/log.js';
import { HarnessSessionOperations } from '../run/session-operations.js';
import { exactInputHash } from '../prompts/delivered-manifest.js';
import { runLayout, runRecordSchema } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios, defaultTurn, withDefaultTurns } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { byRole, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { passingAudit } from './helpers/direct-check-execution.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); assertUnchangedGit(); expectNoProcesses(); }
  finally { forgetExternalTools(); }
});

/** The default intake over the captured plan, reading the given elements of the root plan. */
function intake(spec: SessionSpec, elements: readonly Omit<SubmittedElement, 'document'>[]): readonly ScriptStep[] {
  const input = (defaultTurn(spec)![0] as { readonly input: Record<string, unknown> }).input;
  return submit({ ...input, elements: elements.map(element => ({ ...element, document: 'doc-001' })) });
}

/** The script with the default turns, except a selector turn the test states. */
function selecting(selector: (spec: SessionSpec) => readonly ScriptStep[], script: Script): Script {
  const rest = withDefaultTurns(script);
  return spec => (spec.submission.name === contextSelectorToolName ? selector(spec) : typeof rest === 'function' ? rest(spec) : rest);
}

async function recordedPackage(root: string, jobId: string, events: readonly RunEvent[], selection: RunEventOf<'context-selection-recorded'>) {
  const directory = runPath(root, 'revision-diff', jobId, '');
  const run = runRecordSchema.parse(JSON.parse(await readFile(runPath(root, 'revision-diff', jobId, runLayout.record), 'utf8')));
  const evidence = await readAcceptedEvidence(directory, run, events);
  if (evidence.status !== 'available') throw new Error(evidence.reason);
  const recorded = await readRecordedContextSelection(directory, selection, evidence.catalog, []);
  if (recorded.status !== 'available') throw new Error(recorded.reason);
  return recorded;
}

test('one oriented local context selects once, appends the work-item package once, and the organizing turn names it by hash', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'cucumber.json'), '{}');
  const audit = passingAudit();
  // Synthetic provider facts exercise briefing delivery, not runner execution.
  const configuredAudit = {
    ...audit,
    async read(root: string, commit: string) {
      const config = await audit.read(root, commit);
      return { ...config, checks: [...config.checks, { id: 'scenario-setup', executor: { kind: 'command', commands: [
        { cmd: 'cucumber-js', args: ['--config', 'cucumber.json', '--profile', 'integration'], parser: 'cucumber' },
      ] } }] };
    },
    async run(input: Parameters<typeof audit.run>[0]) {
      return audit.run({ ...input, configuration: await audit.read(input.projectRoot, input.sourceCommit) });
    },
  };
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]))],
    'local-architect': [submit(requestCompletion())],
  })));
  const opened = await openUnchangedRuns(fixture.root, {
    agent, configuredAudit, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'],
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  const orientations = events.filter(event => event.type === 'work-orientation-recorded');
  const selections = events.filter(event => event.type === 'context-selection-recorded');
  const appends = events.filter(event => event.type === 'context-package-appended');
  expect(orientations).toHaveLength(1);
  expect(selections).toHaveLength(1);
  expect(selections[0]!.data).not.toHaveProperty('supersedes');
  expect(appends).toHaveLength(1);
  expect(appends[0]!.data.outcome).toBe('appended');
  expect(events.filter(event => event.type === 'context-package-prompt-bound')).toHaveLength(0);
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_work_orientation')).toHaveLength(1);
  const initial = agent.sessions.find(session => session.spec.role === 'initial-architect')!;
  expect(initial.spec.prompt).toContain('argv ["cucumber-js","--config","cucumber.json","--profile","integration"]');
  expect(initial.spec.prompt).toContain(`Configuration/support pointer: \`${fixture.root}/cucumber.json\``);
  const orienting = agent.sessions.find(session => session.spec.submission.name === 'submit_work_orientation')!;
  expect(orienting.spec.prompt).toContain('The plan asks for review-summary-request.');
  expect(orienting.spec.prompt).toContain('The plan asks for review-summary-acceptance.');
  expect(orienting.spec.prompt).toContain(`${fixture.root}/subs/workspace/subs/reviews/subs/core/src/tests/`);
  expect(orienting.spec.prompt).toContain("Explore your module's README, declaration and relevant source");
  expect(orienting.spec.prompt).not.toContain('once you have oriented');
  expect(orienting.spec.prompt).not.toContain('Read your module, decide, and submit.');
  const selectingSession = agent.sessions.find(session => session.spec.role === 'context-selector')!;
  expect(selectingSession.start.mode).toBe('fork');
  expect(selectingSession.spec.prompt).not.toContain('## Local architect briefing');
  expect(selectingSession.spec.prompt).not.toContain('## Local architect orientation');
  expect(selectingSession.spec.prompt).not.toContain('The plan asks for review-summary-request.');
  expect(selectingSession.spec.prompt).not.toContain('no longer applies to this task');
  expect(selectingSession.spec.prompt).not.toContain(`${fixture.root}/subs/workspace/subs/reviews/subs/core/module.ramify`);
  expect([...selectingSession.inherited, selectingSession.spec.prompt].join('\n')).toContain(`${fixture.root}/subs/workspace/subs/reviews/subs/core/module.ramify`);
  expect(agent.sessions.filter(session => session.spec.role === 'context-selector')).toHaveLength(1);
  const recorded = await recordedPackage(fixture.root, receipt.jobId, events, selections[0]!);
  expect(recorded.selection.package).toEqual({ elements: ['fr-001', 'fr-002'], deviations: [], hash: selections[0]!.data.packageHash });
  expect(recorded.packageText).toContain('The plan asks for review-summary-request.');
  expect(recorded.packageText).toContain('The plan asks for review-summary-acceptance.');
  const organizing = agent.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result');
  expect(organizing).toHaveLength(1);
  expect(organizing[0]!.start.mode).toBe('continue');
  expect(organizing[0]!.spec.prompt).toContain('Build on the module reading and understanding already in this session.');
  // The appended block preserves the package body once; the current brief selects its content hash.
  const packageBlock = `# Block brief:support:work-item-package\nCurrent value; replaces any earlier value for this key.\n${recorded.packageText}`;
  expect(organizing[0]!.inherited.filter(text => text === packageBlock)).toHaveLength(1);
  expect(organizing[0]!.spec.prompt).not.toContain(recorded.packageText);
  const operation = events.find(event => event.type === 'invocation-started' && event.data.role === 'local-architect' && event.data.start === 'continued');
  if (!operation || operation.type !== 'invocation-started') throw new Error('Expected organizing continuation');
  const adapter = await HarnessSessionOperations.open(join(fixture.root, 'plans', '.harness', 'session-operations'), agent);
  try {
    const packet = await adapter.packet(receipt.jobId, operation.data.invocation);
    expect(packet!.message).toBe(organizing[0]!.spec.prompt);
    expect(packet!.manifest.currentMessage!.hash).toBe(exactInputHash(packet!.message));
    expect(packet!.manifest.entries.filter(entry => entry.hash === exactInputHash(packageBlock))).toEqual([expect.objectContaining({ delivery: 'inherited', block: { key: 'brief:support:work-item-package', effect: 'set' } })]);
    expect(packet!.additions.some(entry => entry.text.includes(recorded.packageText))).toBe(false);
  } finally { expect(await adapter.close()).toBe(true); }
  expect(organizing[0]!.spec.prompt).not.toContain('# Your work-item package');
  expect(organizing[0]!.spec.prompt).toContain(`Your work-item package \`${recorded.selection.package.hash}\`, already in your session`);
  expect(organizing[0]!.spec.prompt).toContain('- Requirement: fr-001\n- Acceptance: fr-002\n- Context: none');
  expect(selections[0]!.data.selection).toBe(runLayout.selectionVersion('wi-001', selections[0]!.data.selectionHash));
}, 120_000);

test('a selected non-functional element and recommendation reach the runtime package whole', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'plans/revision-diff/plan.md'), '# Request\n\n# Acceptance\n\nThe service must preserve a 30 second timeout.\nUse Redis if practical.\n');
  const texts = ['The service must preserve a 30 second timeout.', 'Use Redis if practical.'];
  const agent = createScriptedAgent(selecting(() => submit({ selected: [
    { id: 'nfr-001', reason: 'Service timing applies to this work item.', conditions: ['for the service'], uncertainty: '' },
    { id: 'rec-001', reason: 'The plan suggests an optional storage choice.', conditions: [], uncertainty: 'Tentative suggestion.' },
  ] }), spec => {
    if (spec.submission.name === intakeToolName) return intake(spec, [
      { key: 'timeout', kind: 'non-functional', text: texts[0]!, conditions: [{ text: 'for the service', source: 'inferred' }], uncertainty: '' },
      { key: 'redis', kind: 'recommendation', text: texts[1]!, conditions: [], uncertainty: 'Tentative suggestion.' },
    ]);
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [{ nfr: 'nfr-001', result: 'satisfied', inspectedScope: ['src/'], evidence: ['Fixture timeout inspected'], uncertainty: '' }] });
    if (spec.role === 'local-architect') return submit({ ...requestCompletion(), reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] });
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    previewCount: 5, unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'], });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  const selected = events.find(event => event.type === 'context-selection-recorded');
  expect(selected?.type, JSON.stringify(events.map(event => ({ type: event.type, data: event.data })))).toBe('context-selection-recorded');
  if (!selected || selected.type !== 'context-selection-recorded') return;
  const recorded = await recordedPackage(fixture.root, receipt.jobId, events, selected);
  expect(recorded.selection.selected.map(item => item.id)).toEqual(['nfr-001', 'rec-001']);
  expect(recorded.selection.package.elements).toEqual(['fr-001', 'fr-002', 'nfr-001', 'rec-001']);
  expect(recorded.packageText).toContain(texts[0]);
  expect(recorded.packageText).toContain(texts[1]);
  expect(recorded.packageText).toContain('inferred: for the service');
  expect(recorded.packageText).toContain('Tentative suggestion.');
  expect(recorded.packageText.indexOf('## Recommendations')).toBeGreaterThan(recorded.packageText.indexOf('## Non-functional requirements of the plan'));
  const organizing = agent.sessions.find(session => session.spec.submission.name === 'submit_work_item_result');
  expect(organizing?.inherited).toContain(`# Block brief:support:work-item-package\nCurrent value; replaces any earlier value for this key.\n${recorded.packageText}`);
  expect(organizing?.spec.prompt).not.toContain(texts[0]);
}, 120_000);

test('invalid selector output fails within the captured retry bound before an assignment', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(selecting(() => submit({ selected: [
    { id: 'nfr-999', reason: 'Invented evidence', conditions: [], uncertainty: '' },
  ] }), spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff')], });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.find(event => event.type === 'job-failed')?.data.reason).toBe('invalid-submission');
  expect(events.filter(event => event.type === 'context-selection-recorded')).toHaveLength(0);
  expect(events.filter(event => event.type === 'iteration-assigned')).toHaveLength(0);
  const selectors = agent.sessions.filter(session => session.spec.role === 'context-selector');
  expect(selectors).toHaveLength(3);
  expect(JSON.stringify(selectors[0]!.verdicts)).toContain('selected.0.id');
}, 120_000);

test('a source change during selection refuses the package before delivery', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(selecting(() => {
    writeFileSync(join(fixture.root, 'plans/revision-diff/plan.md'), '# Request\n\nChanged after capture.\n');
    return submit({ selected: [] });
  }, spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff')], });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.find(event => event.type === 'job-failed')?.data.reason).toBe('inputs-changed');
  expect(events.filter(event => event.type === 'context-package-appended')).toHaveLength(0);
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result')).toHaveLength(0);
}, 120_000);

test('lost parent session reconstructs the exact package in a fresh organizing prompt from the record alone, without reselection', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(selecting(() => {
    const parent = agent.sessions.find(session => session.spec.submission.name === 'submit_work_orientation');
    if (!parent || !agent.loseSession(JSON.parse(parent.ref))) throw new Error('Expected a retained orientation point');
    return submit({ selected: [] });
  }, spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.role === 'local-architect') return submit({ ...requestCompletion(), reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] });
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'], });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  const selection = events.find(event => event.type === 'context-selection-recorded');
  expect(selection?.type).toBe('context-selection-recorded');
  if (!selection || selection.type !== 'context-selection-recorded') return;
  expect(events.filter(event => event.type === 'context-selection-recorded')).toHaveLength(1);
  expect(events.find(event => event.type === 'context-package-appended')?.data.outcome).toBe('session-lost');
  const organizing = agent.sessions.find(session => session.spec.submission.name === 'submit_work_item_result');
  expect(organizing?.start.mode).toBe('fresh');
  expect(organizing?.spec.prompt).toMatch(/If\s+this is a fresh session, read your module's README/u);
  const recorded = await recordedPackage(fixture.root, receipt.jobId, events, selection);
  expect(organizing?.spec.prompt).toContain(recorded.packageText);
  expect(organizing?.spec.prompt.split(recorded.packageText)).toHaveLength(2);
  expect(events.find(event => event.type === 'context-package-prompt-bound')?.data.packageHash).toBe(selection.data.packageHash);
}, 120_000);

test('a fresh selector receives the ordinary work brief, its complete own elements and recorded orientation', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  // Exercise the existing no-point branch: accepted orientation with no retained point.
  const start = HarnessSessionOperations.prototype.start;
  const spy = vi.spyOn(HarnessSessionOperations.prototype, 'start').mockImplementation(async function (this: HarnessSessionOperations, input) {
    const session = await start.call(this, input);
    return input.spec.submission.name === 'submit_work_orientation' ? { ...session, ref: '' } : session;
  });
  cleanups.push(async () => { spy.mockRestore(); });
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([{ ...entry('review-summary', 'collection-review/workspace/reviews/core'), contextRefs: ['review-context'] }]))],
    'local-architect': [submit(requestCompletion())],
  })));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'], });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');
  const selector = agent.sessions.find(session => session.spec.role === 'context-selector')!;
  expect(selector.start.mode).toBe('fresh');
  expect(selector.inherited).toEqual([]);
  for (const text of ['The plan asks for review-summary-request.', 'The plan asks for review-summary-acceptance.', 'The plan explains review-context.']) {
    expect(selector.spec.prompt).toContain(text);
    expect(selector.spec.prompt.split(text)).toHaveLength(2);
  }
  expect(selector.spec.prompt).toContain('## Local architect orientation');
  expect(selector.spec.prompt).toContain(`${fixture.root}/subs/workspace/subs/reviews/subs/core/module.ramify`);
  expect(selector.spec.prompt).toContain('Select, by ID, the elements');
  expect(selector.spec.prompt).not.toContain('once you have oriented');
}, 120_000);


test.each(['missing', 'altered'] as const)('%s orientation packet takes the ordinary fresh path without repeating orientation', async loss => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root);
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]))],
    'local-architect': [submit(requestCompletion())],
  })));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'],
    afterWrite: async (write, jobId) => {
      if (write !== 'work-orientation-recorded') return;
      const events = await runEventsOnDisk(fixture.root, 'revision-diff', jobId);
      const recorded = events.find(event => event.type === 'work-orientation-recorded')!;
      const path = runPath(fixture.root, 'revision-diff', jobId, recorded.data.packet!);
      if (loss === 'missing') await rm(path); else await writeFile(path, 'altered reusable packet');
    },
  }); cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff')); await opened.service.settled('revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_work_orientation')).toHaveLength(1);
  const selector = agent.sessions.find(session => session.spec.role === 'context-selector')!;
  expect(selector.start.mode).toBe('fresh'); expect(selector.inherited).toEqual([]);
  expect(selector.spec.prompt).toContain('The plan asks for review-summary-request.');
  expect(selector.spec.prompt).not.toContain('altered reusable packet');
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  const selection = events.find(event => event.type === 'context-selection-recorded')!;
  expect((await recordedPackage(fixture.root, receipt.jobId, events, selection)).selection).toMatchObject({ degraded: true, orientationPoint: null });
}, 120_000);

test.each(['fork', 'continue'] as const)('actual unavailable %s startup creates a new fresh invocation with full ordinary inputs', async mode => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root);
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]))],
    'local-architect': [submit(requestCompletion())],
  })));
  let lost = false;
  const bind = agent.bindSessionStore.bind(agent);
  agent.bindSessionStore = store => { const operations = bind(store); return { ...operations,
    async fork(input) {
      if (mode === 'fork' && !lost) { lost = true; return operations.fork({ ...input, sourcePoint: { ...input.sourcePoint, checkpoint: 'missing-at-actual-fork' } }); }
      return operations.fork(input);
    },
    async continue(input) {
      if (mode === 'continue' && input.task.submissionTool === 'submit_work_item_result' && !lost) {
        lost = true; agent.loseSession(input.expectedPoint);
      }
      return operations.continue(input);
    },
  }; };
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'],
  }); cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff')); await opened.service.settled('revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed'); expect(lost).toBe(true);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  const failed = events.find((event): event is RunEventOf<'invocation-ended'> => event.type === 'invocation-ended' && event.data.ended === 'failed')!;
  const fresh = events.find((event): event is RunEventOf<'invocation-ended'> => event.type === 'invocation-ended' && event.data.degraded?.requested === mode)!;
  expect(fresh.data.invocation).not.toBe(failed.data.invocation); expect(fresh.data.degraded?.actual).toBe('fresh');
  const task = agent.sessions.find(session => session.spec.submission.name === (mode === 'fork' ? contextSelectorToolName : 'submit_work_item_result') && session.start.mode === 'fresh')!;
  expect(task.inherited).toEqual([]); expect(task.spec.prompt).toContain('The plan asks for review-summary-request.');
  expect(task.spec.prompt).toContain(`${fixture.root}/subs/workspace/subs/reviews/subs/core/module.ramify`);
  if (mode === 'fork') expect(task.spec.prompt).toContain('## Local architect orientation');
}, 120_000);

test('exhausted work orientation proceeds with a fresh selector and architect using ordinary inputs', async () => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root);
  const ordinary = withDefaultTurns(spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.role === 'local-architect') return submit({ ...requestCompletion(), reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] });
    return [];
  });
  const agent = createScriptedAgent(spec => spec.submission.name === 'submit_work_orientation' ? [{ kind: 'end', message: 'No orientation submission' }] : typeof ordinary === 'function' ? ordinary(spec) : ordinary);
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'],
  }); cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff')); await opened.service.settled('revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.filter(event => event.type === 'work-orientation-recorded')).toEqual([]);
  const orienting = agent.sessions.filter(session => session.spec.submission.name === 'submit_work_orientation');
  const policy = runRecordSchema.parse(JSON.parse(await readFile(runPath(fixture.root, 'revision-diff', receipt.jobId, runLayout.record), 'utf8'))).policy;
  expect(orienting).toHaveLength(policy.limits.forkRetriesPerRequest + 1);
  const last = events.filter((event): event is RunEventOf<'invocation-started'> => event.type === 'invocation-started' && event.data.role === 'local-architect').at(-2)!;
  const selection = events.find(event => event.type === 'context-selection-recorded')!;
  expect((await recordedPackage(fixture.root, receipt.jobId, events, selection)).selection).toMatchObject({ degraded: true, orientationPoint: null, orientationInvocation: last.data.invocation });
  for (const session of agent.sessions.filter(session => [contextSelectorToolName, 'submit_work_item_result'].includes(session.spec.submission.name))) {
    expect(session.start.mode).toBe('fresh'); expect(session.spec.prompt).toContain('The plan asks for review-summary-request.');
  }
}, 120_000);


test.each(['failed', 'unavailable', 'conflict', 'stopped'] as const)('a continued task receipt ending %s without context loss does not start a fresh retry', async status => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root);
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]))],
  })));
  const bind = agent.bindSessionStore.bind(agent);
  agent.bindSessionStore = store => { const operations = bind(store); return { ...operations,
    async continue(input) {
      if (input.task.submissionTool !== 'submit_work_item_result') return operations.continue(input);
      const receipt = { runId: input.runId, operationId: input.operationId, sessionId: input.sessionId, turn: null, point: null,
        status, reason: 'ordinary task/provider/authority outcome', outcome: status === 'stopped' ? { kind: 'stopped' as const } : { kind: 'failed' as const, error: 'ordinary task/provider/authority outcome' } };
      return { receipt: Promise.resolve(receipt), outcome: Promise.resolve(receipt.outcome), stop: async () => receipt, settled: async () => receipt };
    },
  }; };
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit('revision-diff')] });
  cleanups.push(() => opened.service.close()); const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect')).toHaveLength(2);
  expect(events.filter(event => event.type === 'invocation-ended' && event.data.degraded?.actual === 'fresh')).toEqual([]);
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result')).toEqual([]);
}, 120_000);
