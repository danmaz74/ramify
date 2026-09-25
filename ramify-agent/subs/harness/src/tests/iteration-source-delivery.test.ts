import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { contextSelectorToolName, workOrientationToolName } from '../context-selection/submissions.js';
import { runLayout } from '../run/records.js';
import { iterationLayout } from '../work/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { withPlan13Fixture } from './helpers/declarations.js';
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

test('an assigned NFR reaches the engineer with its exact classification while uncited advice stays in the catalog', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const quote = 'The service must preserve a 30 second timeout.';
  const advice = 'Use Redis if practical.';
  await writeFile(join(fixture.root, 'plans/revision-diff/plan.md'), `# Request\n\n${quote}\n${advice}\n\n# Acceptance\n\nThe scenario passes.\n`);
  let passages: Array<{ document: string; sha256: string; start: number; end: number; quote: string }> = [];
  let localTurn = 0;
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') {
      const captured = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
      if (!captured) throw new Error('Missing captured plan');
      const directory = dirname(dirname(captured));
      const manifest = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8')));
      const root = manifest.documents[0]!;
      const bytes = readFileSync(join(directory, root.storedAt));
      passages = [quote, advice].map(text => {
        const start = bytes.indexOf(Buffer.from(text));
        return { document: root.id, sha256: root.sha256, start, end: start + Buffer.byteLength(text), quote: text };
      });
      return submit({ ...analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]),
        catalog: [
          { classification: 'non-functional-requirement', passage: passages[0], conditions: [{ text: 'for the service', source: 'stated' }], uncertainty: '' },
          { classification: 'advice', passage: passages[1], conditions: [], uncertainty: 'Optional.' },
        ] });
    }
    if (spec.submission.name === workOrientationToolName) return [
      ...submit({ focus: 'Honor the service timeout', currentUnderstanding: quote, questions: [] }),
      ...submit(assign('collection-review/workspace/reviews/core', { citedItems: ['nfr-001'] }, outline())),
      ...submit({ ...requestCompletion(), scenarios: ['sc-001'] }),
    ];
    if (spec.submission.name === contextSelectorToolName) {
      const parent = agent.sessions.find(session => session.spec.submission.name === workOrientationToolName);
      if (!parent || !agent.forget(parent.ref)) throw new Error('Expected a retained orientation point');
      return submit({ examined: ['nfr-001', 'adv-001'],
        selected: [{ item: 'nfr-001', passage: passages[0], reason: 'Applies to the service work', conditions: [], uncertainty: '' }], unavailable: [] });
    }
    if (spec.submission.name === 'submit_work_item_result') return localTurn++ === 0
      ? submit(assign('collection-review/workspace/reviews/core', { citedItems: ['nfr-001'] }, outline()))
      : submit({ ...requestCompletion(), scenarios: ['sc-001'] });
    if (spec.role === 'engineer') return submit(completionProposed('The existing behavior satisfies the assignment.', { scenarios: ['sc-001'] }));
    return [];
  }));
  let firstIterationAttempt: string | undefined;
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
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
  const engineers = agent.sessions.filter(session => session.spec.role === 'engineer');
  expect(engineers).toHaveLength(2);
  expect(engineers.map(session => session.start.mode)).toEqual(['fresh', 'continue']);
  for (const engineer of engineers) {
    expect(engineer.spec.prompt).toContain(quote);
    expect(engineer.spec.prompt).toContain('nfr-001: non-functional-requirement');
    expect(engineer.spec.prompt).toContain('stated: for the service');
    expect(engineer.spec.prompt).not.toContain(advice);
  }
  const directory = runPath(fixture.root, 'revision-diff', receipt.jobId, '');
  const context = JSON.parse(await readFile(join(directory, runLayout.assignmentContext('wi-001.i01')), 'utf8'));
  expect(context.citedItems).toEqual(['nfr-001']);
  const assignment = JSON.parse(await readFile(join(directory, iterationLayout.assignment('wi-001', 1)), 'utf8'));
  expect(assignment.citedItems).toEqual(['nfr-001']);
  expect(events.filter(event => event.type === 'context-selection-recorded')).toHaveLength(1);
}, 120_000);

test('a changed captured source is refused before an assignment can be delivered', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]));
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Read the plan', currentUnderstanding: 'The plan governs the work.', questions: [] });
    if (spec.submission.name === contextSelectorToolName) {
      const parent = agent.sessions.find(session => session.spec.submission.name === workOrientationToolName);
      if (!parent || !agent.forget(parent.ref)) throw new Error('Expected retained orientation point');
      return submit({ examined: [], selected: [], unavailable: [] });
    }
    if (spec.submission.name === 'submit_work_item_result') {
      writeFileSync(join(fixture.root, 'plans/revision-diff/plan.md'), '# Request\n\nChanged after selection.\n');
      return submit(assign('collection-review/workspace/reviews/core', { citedItems: [] }, outline()));
    }
    return [];
  }));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit('revision-diff')] });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.find(event => event.type === 'job-failed')?.data.reason).toBe('inputs-changed');
  expect(events.filter(event => event.type === 'iteration-assigned')).toHaveLength(0);
  expect(agent.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(0);
}, 120_000);

test('a contract requested by an engineer inherits the same cited passage', async () => {
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
  const quote = 'The service must preserve a 30 second timeout.';
  await writeFile(join(fixture.root, 'plans/revision-diff/plan.md'), `# Request\n\n${quote}\n\n# Acceptance\n\nThe behavior is tested.\n`);
  let passage: { document: string; sha256: string; start: number; end: number; quote: string };
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') {
      const captured = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
      if (!captured) throw new Error('Missing captured plan');
      const directory = dirname(dirname(captured));
      const root = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8'))).documents[0]!;
      const bytes = readFileSync(join(directory, root.storedAt));
      const start = bytes.indexOf(Buffer.from(quote));
      passage = { document: root.id, sha256: root.sha256, start, end: start + Buffer.byteLength(quote), quote };
      return submit({ ...analysis([entry('review-note', notes)]), catalog: [{
        classification: 'non-functional-requirement', passage, conditions: [], uncertainty: '',
      }] });
    }
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Honor the timeout', currentUnderstanding: quote, questions: [] });
    if (spec.submission.name === contextSelectorToolName) {
      const parent = agent.sessions.find(session => session.spec.submission.name === workOrientationToolName);
      if (!parent || !agent.forget(parent.ref)) throw new Error('Expected retained orientation point');
      return submit({ examined: ['nfr-001'], selected: [{ item: 'nfr-001', passage, reason: 'Relevant to the seam', conditions: [], uncertainty: '' }], unavailable: [] });
    }
    if (spec.submission.name === 'submit_work_item_result') return submit({
      ...assign(notes, { citedItems: ['nfr-001'] }, outline()),
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
  const contract = agent.sessions.find(session => session.spec.role === 'contract-engineer');
  expect(contract?.spec.prompt).toContain(quote);
  expect(contract?.spec.prompt).toContain('nfr-001: non-functional-requirement');
  const context = JSON.parse(await readFile(runPath(fixture.root, 'revision-diff', receipt.jobId, runLayout.assignmentContext('wi-001.i02')), 'utf8'));
  expect(context.citedItems).toEqual(['nfr-001']);
  expect(context.assignment).toBe('wi-001.i02');
}, 120_000);
