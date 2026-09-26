import { afterEach, expect, test, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
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
import { runLayout, runRecordSchema } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios, defaultTurn, withDefaultTurns } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { byRole, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

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
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]))],
    'local-architect': [submit(requestCompletion())],
  })));
  const opened = await openUnchangedRuns(fixture.root, {
    agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'],
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
  expect(agent.sessions.filter(session => session.spec.role === 'context-selector')).toHaveLength(1);
  const recorded = await recordedPackage(fixture.root, receipt.jobId, events, selections[0]!);
  expect(recorded.selection.package).toEqual({ elements: ['fr-001', 'fr-002'], deviations: [], hash: selections[0]!.data.packageHash });
  expect(recorded.packageText).toContain('The plan asks for review-summary-request.');
  expect(recorded.packageText).toContain('The plan asks for review-summary-acceptance.');
  const organizing = agent.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result');
  expect(organizing).toHaveLength(1);
  expect(organizing[0]!.start.mode).toBe('continue');
  // The package is in the session once, as its append, byte for byte; the brief names it by hash.
  expect(organizing[0]!.inherited.filter(text => text === recorded.packageText)).toHaveLength(1);
  expect(organizing[0]!.spec.prompt).not.toContain(recorded.packageText);
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
    if (spec.role === 'local-architect') return submit({ ...requestCompletion(), scenarios: ['sc-001'] });
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
  expect(organizing?.inherited).toContain(recorded.packageText);
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
    if (!parent || !agent.forget(parent.ref)) throw new Error('Expected a retained orientation point');
    return submit({ selected: [] });
  }, spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.role === 'local-architect') return submit({ ...requestCompletion(), scenarios: ['sc-001'] });
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
  const recorded = await recordedPackage(fixture.root, receipt.jobId, events, selection);
  expect(organizing?.spec.prompt).toContain(`\n\n# Your work-item package\n\n${recorded.packageText}`);
  expect(organizing?.spec.prompt.split(recorded.packageText)).toHaveLength(2);
  expect(events.find(event => event.type === 'context-package-prompt-bound')?.data.packageHash).toBe(selection.data.packageHash);
}, 120_000);
