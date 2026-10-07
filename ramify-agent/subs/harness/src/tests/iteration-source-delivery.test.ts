import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import type { Script, ScriptStep, ScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { createPackage, type SubmittedElement } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { readAcceptedEvidence } from '../analysis/evidence.js';
import { intakeToolName } from '../analysis/extraction.js';
import { contextSelectorToolName, workOrientationToolName } from '../context-selection/submissions.js';
import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import type { RunEvent } from '../run/log.js';
import { runLayout, runRecordSchema } from '../run/records.js';
import { iterationAssignmentSchema, iterationLayout } from '../work/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { defaultTurn, withDefaultTurns } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { contractNeeded, type Seam } from './helpers/contracts.js';
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
function intake(spec: SessionSpec, elements: ReadonlyArray<Omit<SubmittedElement, 'document'>>): readonly ScriptStep[] {
  const input = (defaultTurn(spec)![0] as { readonly input: Record<string, unknown> }).input;
  return submit({ ...input, elements: elements.map(element => ({ ...element, document: 'doc-001' })) });
}

/**
 * The script with the default turns, except a selector that forgets its
 * parent's session, so the first organizing prompt carries the package,
 * and selects the given IDs.
 */
function selectingAfterLoss(agent: () => ScriptedAgent, ids: readonly string[], script: Script): Script {
  const rest = withDefaultTurns(script);
  return spec => {
    if (spec.submission.name !== contextSelectorToolName) return typeof rest === 'function' ? rest(spec) : rest;
    const parent = agent().sessions.find(session => session.spec.submission.name === workOrientationToolName);
    if (!parent || !agent().forget(parent.ref)) throw new Error('Expected a retained orientation point');
    return submit({ selected: ids.map(id => ({ id, reason: `Applies to the work: ${id}`, conditions: [], uncertainty: '' })) });
  };
}

/** An assignment's package, rendered again from its record and the frozen catalog alone. */
async function assignmentPackage(root: string, jobId: string, events: readonly RunEvent[], workItem: string, sequence: number) {
  const directory = runPath(root, 'revision-diff', jobId, '');
  const run = runRecordSchema.parse(JSON.parse(await readFile(runPath(root, 'revision-diff', jobId, runLayout.record), 'utf8')));
  const evidence = await readAcceptedEvidence(directory, run, events);
  if (evidence.status !== 'available') throw new Error(evidence.reason);
  const assignment = iterationAssignmentSchema.parse(JSON.parse(await readFile(join(directory, iterationLayout.assignment(workItem, sequence)), 'utf8')));
  const rendered = createPackage({ catalog: evidence.catalog, planDeviations: [], elements: assignment.source!.elements, deviations: assignment.source!.deviations });
  if ('unavailable' in rendered) throw new Error('The assignment package does not render');
  expect(rendered.hash).toBe(assignment.source!.hash);
  return { assignment, text: rendered.text };
}

const quote = 'The service must preserve a 30 second timeout.';

test('an assigned non-functional element reaches the engineer once per session, byte for byte, while an unselected recommendation stays in the catalog', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const advice = 'Use Redis if practical.';
  await writeFile(join(fixture.root, 'plans/revision-diff/plan.md'), `# Request\n\n${quote}\n${advice}\n\n# Acceptance\n\nThe scenario passes.\n`);
  let localTurn = 0;
  const agent: ScriptedAgent = createScriptedAgent(selectingAfterLoss(() => agent, ['nfr-001'], spec => {
    if (spec.submission.name === intakeToolName) return intake(spec, [
      { key: 'timeout', kind: 'non-functional', text: quote, conditions: [{ text: 'for the service', source: 'stated' }], uncertainty: '' },
      { key: 'redis', kind: 'recommendation', text: advice, conditions: [], uncertainty: 'Optional.' },
    ]);
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]));
    if (spec.submission.name === 'submit_work_item_result') return localTurn++ === 0
      ? submit(assign('collection-review/workspace/reviews/core', { citedElements: ['fr-001', 'fr-002', 'nfr-001'], obligations: ['sc-001'] }, outline()))
      : submit({ ...requestCompletion(), reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] });
    if (spec.role === 'engineer') return submit(completionProposed('The existing behavior satisfies the assignment.', { bindings: [{ id: 'sc-001' }] }));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [
      { nfr: 'nfr-001', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'],
        evidence: ['The scripted timeout check passes.'], uncertainty: '' },
    ] });
    return [];
  }));
  let firstIterationAttempt: string | undefined;
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(), previewCount: 5,
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001.i01', 'wi-001.i01', 'wi-001', 'final verification of plan "revision-diff"'],
    checkScript: ({ check, context }) => {
      if (context.checkpoint !== 'iteration') return {};
      firstIterationAttempt ??= context.attemptId;
      return context.attemptId === firstIterationAttempt && check.kind === 'tests'
        ? { outcome: { kind: 'completed', exitCode: 1 }, stderr: 'not ok\n' } : {};
    }, });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state, JSON.stringify({ failures: events.filter(event => event.type === 'job-failed'), sessions: agent.sessions.map(session => [session.spec.role, session.spec.submission.name, session.start, session.verdicts, session.outcome]) })).toBe('completed');
  const { assignment, text } = await assignmentPackage(fixture.root, receipt.jobId, events, 'wi-001', 1);
  expect(assignment.source).toMatchObject({ elements: ['fr-001', 'fr-002', 'nfr-001'], deviations: [] });
  expect(assignment).not.toHaveProperty('citedItems');
  expect(assignment).not.toHaveProperty('requirementRefs');
  expect(text).toContain(quote);
  expect(text).toContain('### nfr-001: non-functional requirement of the plan from plans/revision-diff/plan.md');
  expect(text).toContain('stated: for the service');
  expect(text).not.toContain(advice);
  // The assignment cites its whole work-item package, so the local architect's package and the engineer's are the same bytes.
  expect(events.find(event => event.type === 'context-selection-recorded')?.data.packageHash).toBe(assignment.source!.hash);
  const organizing = agent.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result');
  expect(organizing.map(session => session.start.mode)).toEqual(['fresh', 'continue']);
  expect(organizing[0]!.spec.prompt).toContain(`# Your work-item package\n\n${text}`);
  // A continued turn names the package by hash and never repeats its body.
  expect(organizing[1]!.spec.prompt).not.toContain(quote);
  expect(organizing[1]!.spec.prompt).not.toContain('# Your work-item package');
  expect(organizing[1]!.spec.prompt).toContain(`Your work-item package \`${assignment.source!.hash}\`, already in your session`);
  const engineers = agent.sessions.filter(session => session.spec.role === 'engineer');
  expect(engineers.map(session => session.start.mode)).toEqual(['fresh', 'continue']);
  expect(engineers[0]!.spec.prompt).toContain(`## What the plan asks of this iteration\n\nThe elements your assignment cites`);
  expect(engineers[0]!.spec.prompt).toContain(text.trimEnd());
  expect(engineers[1]!.spec.prompt).not.toContain(quote);
  for (const engineer of engineers) expect(engineer.spec.prompt).not.toContain(advice);
  await expect(readFile(runPath(fixture.root, 'revision-diff', receipt.jobId, 'assignments/wi-001.i01-context.json'))).rejects.toThrow();
  expect(events.filter(event => event.type === 'context-selection-recorded')).toHaveLength(1);
}, 120_000);

test('a contract requested by an engineer inherits the requester\'s assignment package, byte for byte', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const notes = 'collection-review/workspace/reviews/notes';
  const limits = 'collection-review/workspace/reviews/limits';
  const seam: Seam = {
    capability: 'note-limit', name: 'NoteLimit', provider: limits, providerDirectory: 'subs/workspace/subs/reviews/subs/limits',
    consumerDirectory: 'subs/workspace/subs/reviews/subs/notes', consumerFile: 'notes.ts', reach: '../../limits',
    behavior: 'A note is accepted only within its length limit.',
  };
  await addModule(fixture.root, seam.consumerDirectory, 'notes', { 'src/notes.ts': 'export const note = true;\n' });
  await addModule(fixture.root, seam.providerDirectory, 'limits', {});
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'plans/revision-diff/plan.md'), `# Request\n\n${quote}\n\n# Acceptance\n\nThe behavior is tested.\n`);
  const agent: ScriptedAgent = createScriptedAgent(selectingAfterLoss(() => agent, ['nfr-001'], spec => {
    if (spec.submission.name === intakeToolName) return intake(spec, [{ key: 'timeout', kind: 'non-functional', text: quote, conditions: [], uncertainty: '' }]);
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-note', notes)]));
    if (spec.submission.name === 'submit_work_item_result') return submit({
      ...assign(notes, { citedElements: ['fr-001', 'nfr-001'] }, outline()),
      localDecisions: [localDecision({ question: 'Where is note-limit?', outcome: 'reuse', capability: 'note-limit', owner: limits,
        rationale: 'The limit is owned by its own module.' }, [registryChange({ capability: 'note-limit', owner: limits })])],
    });
    if (spec.role === 'engineer') return submit(contractNeeded(seam));
    if (spec.role === 'contract-engineer') return submit({ kind: 'incomplete', done: [], unfinished: ['The interface still needs design.'], findings: [] });
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit('revision-diff')] });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  const requester = await assignmentPackage(fixture.root, receipt.jobId, events, 'wi-001', 1);
  expect(requester.assignment.source).toMatchObject({ elements: ['fr-001', 'nfr-001'], deviations: [] });
  expect(requester.text).toContain(quote);
  expect(requester.text).not.toContain('The plan asks for review-note-acceptance.');
  const contract = await assignmentPackage(fixture.root, receipt.jobId, events, 'wi-001', 2);
  expect(contract.assignment.kind).toBe('contract');
  expect(contract.assignment.source).toEqual(requester.assignment.source);
  const engineer = agent.sessions.find(session => session.spec.role === 'engineer');
  expect(engineer?.spec.prompt).toContain(requester.text.trimEnd());
  const contractSession = agent.sessions.find(session => session.spec.role === 'contract-engineer');
  expect(contractSession?.spec.prompt).toContain(`## What the plan asks of the requesting iteration\n\nThe elements its assignment cites, whole, with the plan deviations in force when it was assigned.\n\n${requester.text.trimEnd()}`);
}, 120_000);
