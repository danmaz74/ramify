import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import { afterEach, expect, test, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { readAcceptedEvidence } from '../analysis/evidence.js';
import { readRecordedContextSelection } from '../context-selection/recorded.js';
import { contextSelectorToolName, workOrientationToolName } from '../context-selection/submissions.js';
import { runLayout, runRecordSchema } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios, withPlan13Fixture } from './helpers/declarations.js';
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

test('one oriented local context selects once, appends by key, and binds the exact package to the organizing invocation', async () => {
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
  const prompts = events.filter(event => event.type === 'context-package-prompt-bound');
  expect(orientations).toHaveLength(1);
  expect(selections).toHaveLength(1);
  expect(appends).toHaveLength(1);
  expect(appends[0]!.data.outcome).toBe('appended');
  expect(prompts).toHaveLength(1);
  expect(prompts[0]!.data.packageHash).toBe(selections[0]!.data.packageHash);
  const organizing = agent.sessions.find(session => session.spec.submission.name === 'submit_work_item_result');
  expect(organizing?.spec.prompt).toContain('# Recorded context selection');
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_work_orientation')).toHaveLength(1);
  expect(agent.sessions.filter(session => session.spec.role === 'context-selector')).toHaveLength(1);
  const runDirectory = runPath(fixture.root, 'revision-diff', receipt.jobId, '');
  const run = runRecordSchema.parse(JSON.parse(await readFile(runPath(fixture.root, 'revision-diff', receipt.jobId, runLayout.record), 'utf8')));
  const evidence = await readAcceptedEvidence(runDirectory, run, events);
  expect(evidence.status).toBe('available');
  if (evidence.status !== 'available') return;
  const recorded = await readRecordedContextSelection(runDirectory, selections[0]!, evidence.catalog, evidence.manifest, evidence.bytes);
  expect(recorded.status).toBe('available');
  if (recorded.status === 'available') expect(recorded.packageText).toContain('Selection coverage');
  expect(selections[0]!.data.selection).toBe(runLayout.selectionVersion('wi-001', selections[0]!.data.selectionHash!));
}, 120_000);

test('a selected NFR and advice retain their exact captured passages through the runtime package', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const source = '# Request\n\n# Acceptance\n\nThe service must preserve a 30 second timeout.\nUse Redis if practical.\n';
  await writeFile(join(fixture.root, 'plans/revision-diff/plan.md'), source);
  const quotes = ['The service must preserve a 30 second timeout.', 'Use Redis if practical.'];
  let passages: Array<{ document: string; sha256: string; start: number; end: number; quote: string }> = [];
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') {
      const captured = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
      if (!captured) throw new Error('Missing captured source');
      const directory = dirname(dirname(captured));
      const manifest = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8')));
      const root = manifest.documents.find(document => document.id === manifest.root)!;
      const bytes = readFileSync(join(directory, root.storedAt));
      passages = quotes.map(quote => {
        const start = bytes.indexOf(Buffer.from(quote));
        return { document: root.id, sha256: root.sha256, start, end: start + Buffer.byteLength(quote), quote };
      });
      return submit({ ...analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]),
        catalog: [
          { classification: 'non-functional-requirement', passage: passages[0], conditions: [{ text: 'for the service', source: 'inferred' }], uncertainty: '' },
          { classification: 'advice', passage: passages[1], conditions: [], uncertainty: 'Tentative suggestion.' },
        ] });
    }
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Preserve the service limit', currentUnderstanding: 'The plan names a timeout and tentative storage advice.', questions: [] });
    if (spec.submission.name === contextSelectorToolName) return submit({ examined: ['nfr-001', 'adv-001'], selected: [
      { item: 'nfr-001', passage: passages[0], reason: 'Service timing applies to this work item.', conditions: ['for the service'], uncertainty: '' },
      { item: 'adv-001', passage: passages[1], reason: 'The plan suggests an optional storage choice.', conditions: [], uncertainty: 'Tentative suggestion.' },
    ], unavailable: [] });
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
  const runDirectory = runPath(fixture.root, 'revision-diff', receipt.jobId, '');
  const run = runRecordSchema.parse(JSON.parse(await readFile(runPath(fixture.root, 'revision-diff', receipt.jobId, runLayout.record), 'utf8')));
  const evidence = await readAcceptedEvidence(runDirectory, run, events);
  expect(evidence.status).toBe('available');
  if (evidence.status !== 'available') return;
  const recorded = await readRecordedContextSelection(runDirectory, selected, evidence.catalog, evidence.manifest, evidence.bytes);
  expect(recorded.status).toBe('available');
  if (recorded.status !== 'available') return;
  expect(recorded.selection.selected.map(item => item.item)).toEqual(['nfr-001', 'adv-001']);
  expect(recorded.packageText).toContain(quotes[0]);
  expect(recorded.packageText).toContain(quotes[1]);
  expect(recorded.packageText).toContain('for the service');
  expect(recorded.packageText).toContain('Tentative suggestion.');
  expect(agent.sessions.find(session => session.spec.submission.name === 'submit_work_item_result')?.spec.prompt).toContain(recorded.packageText);
}, 120_000);

test('invalid selector output fails within the captured retry bound before an assignment', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Review the work item', currentUnderstanding: 'The plan supplies the goal.', questions: [] });
    if (spec.submission.name === contextSelectorToolName) return submit({ examined: [], selected: [{
      item: 'nfr-999', passage: { document: 'doc-999', sha256: '0'.repeat(64), start: 0, end: 1, quote: 'X' },
      reason: 'Invented evidence', conditions: [], uncertainty: '',
    }], unavailable: [] });
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
  expect(agent.sessions.filter(session => session.spec.role === 'context-selector')).toHaveLength(3);
}, 120_000);

test('a source change during selection refuses the package before delivery', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Review the work item', currentUnderstanding: 'The plan supplies the goal.', questions: [] });
    if (spec.submission.name === contextSelectorToolName) {
      writeFileSync(join(fixture.root, 'plans/revision-diff/plan.md'), '# Request\n\nChanged after capture.\n');
      return submit({ examined: [], selected: [], unavailable: [] });
    }
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff')], });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.find(event => event.type === 'job-failed')?.data.reason).toBe('inputs-changed');
  expect(events.filter(event => event.type === 'context-selection-recorded')).toHaveLength(0);
  expect(events.filter(event => event.type === 'context-package-appended')).toHaveLength(0);
}, 120_000);

test('lost parent session reconstructs the exact package in a fresh organizing prompt without reselection', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Review the work item', currentUnderstanding: 'The captured source governs it.', questions: [] });
    if (spec.submission.name === contextSelectorToolName) {
      const parent = agent.sessions.find(session => session.spec.submission.name === workOrientationToolName);
      if (!parent || !agent.forget(parent.ref)) throw new Error('Expected a retained orientation point');
      return submit({ examined: [], selected: [], unavailable: [] });
    }
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
  const packageText = await readFile(runPath(fixture.root, 'revision-diff', receipt.jobId, selection.data.package! ), 'utf8');
  expect(organizing?.spec.prompt).toContain(packageText);
  expect(events.find(event => event.type === 'context-package-prompt-bound')?.data.packageHash).toBe(selection.data.packageHash);
}, 120_000);
