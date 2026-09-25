import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { contextSelectorToolName, workOrientationToolName } from '../context-selection/submissions.js';
import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { withPlan13Fixture } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { assign, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { openRunsWithoutProcesses, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { scriptedGit, scenariosCommit } from './helpers/scripted-git.js';
import { installTestRunner, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function implementationFiles() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const paths = [
    'subs/harness/src/tests/plan13-composed-functional.test.ts',
    'subs/harness/src/run/service.ts',
    'subs/harness/src/run/nonfunctional-phase.ts',
    'subs/harness/src/nonfunctional/prompts.ts',
    'subs/harness/src/nonfunctional/submissions.ts',
    'subs/harness/subs/evidence/src/candidate-tree.ts',
  ];
  return Promise.all(paths.map(async path => ({ path, sha256: hash(await readFile(join(root, path))) })));
}
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); expectNoProcesses(); }
  finally { forgetExternalTools(); }
});

test('functional work cites one NFR while the coordinator assesses the complete two-NFR catalog', async () => {
  const exportPath = process.env.PLAN13_COMPOSITION_EXPORT;
  const implementationStart = exportPath === undefined ? null : await implementationFiles();
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const plan = join(fixture.root, 'plans/revision-diff/plan.md');
  const selectedQuote = 'The service must preserve a 30 second timeout.';
  const uncitedQuote = 'Every review must retain an audit record.';
  const advice = 'Use Redis if practical.';
  writeFileSync(plan, `# Request\n\n${selectedQuote}\n${uncitedQuote}\n${advice}\n\n# Acceptance\n\nThe scenario passes.\n`);
  let passages: Array<{ document: string; sha256: string; start: number; end: number; quote: string }> = [];
  let localTurn = 0;
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') {
      const captured = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
      if (!captured) throw new Error('Missing captured plan');
      const directory = dirname(dirname(captured));
      const root = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8'))).documents[0]!;
      const bytes = readFileSync(join(directory, root.storedAt));
      passages = [selectedQuote, uncitedQuote, advice].map(quote => {
        const start = bytes.indexOf(Buffer.from(quote));
        return { document: root.id, sha256: root.sha256, start, end: start + Buffer.byteLength(quote), quote };
      });
      return submit({ ...analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]),
        catalog: [
          { classification: 'non-functional-requirement', passage: passages[0], conditions: [], uncertainty: '' },
          { classification: 'non-functional-requirement', passage: passages[1], conditions: [], uncertainty: '' },
          { classification: 'advice', passage: passages[2], conditions: [], uncertainty: 'Optional.' },
        ] });
    }
    if (spec.submission.name === workOrientationToolName) return submit({ focus: 'Preserve the timeout', currentUnderstanding: selectedQuote, questions: [] });
    if (spec.submission.name === contextSelectorToolName) {
      const parent = agent.sessions.find(session => session.spec.submission.name === workOrientationToolName);
      if (!parent || !agent.forget(parent.ref)) throw new Error('Expected retained orientation point');
      return submit({ examined: ['nfr-001', 'nfr-002', 'adv-001'], selected: [
        { item: 'nfr-001', passage: passages[0], reason: 'Needed by this assignment', conditions: [], uncertainty: '' },
      ], unavailable: [] });
    }
    if (spec.submission.name === 'submit_work_item_result') return localTurn++ === 0
      ? submit(assign('collection-review/workspace/reviews/core', { citedItems: ['nfr-001'] }, outline()))
      : submit({ ...requestCompletion(), scenarios: ['sc-001'] });
    if (spec.role === 'engineer') return submit(completionProposed('The behavior satisfies the assignment.', { scenarios: ['sc-001'] }));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [
      { nfr: 'nfr-001', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'], evidence: ['Timeout source inspected.'], uncertainty: '' },
      { nfr: 'nfr-002', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'], evidence: ['Audit record source inspected.'], uncertainty: '' },
    ] });
    return [];
  }));
  const scenario = scenariosCommit('revision-diff');
  const tree = 'a'.repeat(40);
  const git = scriptedGit(fixture.root, {
    head: 'unchanged-fixture-revision',
    checkpoints: [scenario,
      { subject: 'wi-001.i01', commit: null, changes: [] },
      { subject: 'wi-001', commit: null, changes: [] },
      { subject: 'final verification of plan "revision-diff"', commit: null, changes: [] }],
    previews: Array.from({ length: 5 }, () => ({ repositoryRoot: fixture.root, head: scenario.commit!, tree })),
  });
  const candidates = scriptedCandidates(fixture.root, {
    [scenario.commit!]: { tree, files: {}, base: 'unchanged-fixture-revision', changes: [] },
  });
  const opened = await openRunsWithoutProcesses(fixture.root, git, { agent, inputs: treeInputs(), candidates });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff'));
  await opened.service.settled('revision-diff', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'revision-diff', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toEqual([]);
  expect(events.filter(event => event.type === 'nonfunctional-assessed')).toHaveLength(1);
  expect(events.filter(event => event.type === 'nonfunctional-round-closed')).toHaveLength(1);
  expect(events.find(event => event.type === 'job-completed')).toBeDefined();
  const directory = runPath(fixture.root, 'revision-diff', receipt.jobId, '');
  const accepted = events.find(event => event.type === 'analysis-accepted');
  expect(accepted?.data.evidence).toBeDefined();
  expect(accepted?.data.catalog).toEqual({ nfr: 2, advice: 1 });
  const catalog = JSON.parse(await readFile(join(directory, accepted!.data.evidence!.catalog.path), 'utf8'));
  expect(catalog.items.map((item: { id: string; classification: string }) => [item.id, item.classification])).toEqual([
    ['nfr-001', 'non-functional-requirement'], ['nfr-002', 'non-functional-requirement'], ['adv-001', 'advice'],
  ]);
  const engineers = agent.sessions.filter(session => session.spec.role === 'engineer');
  expect(engineers).toHaveLength(1);
  expect(engineers[0]!.spec.prompt).toContain(selectedQuote);
  expect(engineers[0]!.spec.prompt).not.toContain(uncitedQuote);
  expect(engineers[0]!.spec.prompt).not.toContain(advice);
  const coordinator = agent.sessions.filter(session => session.spec.role === 'nonfunctional-coordinator');
  expect(coordinator).toHaveLength(1);
  expect(coordinator[0]!.spec.prompt).toContain(selectedQuote);
  expect(coordinator[0]!.spec.prompt).toContain(uncitedQuote);
  expect(coordinator[0]!.spec.prompt).toContain('nfr-002');
  expect(coordinator[0]!.spec.prompt).toContain(advice);
  const assessment = JSON.parse(await readFile(join(directory, runLayout.assessment('nfa-001')), 'utf8'));
  expect(assessment.results.map((item: { nfr: string }) => item.nfr)).toEqual(['nfr-001', 'nfr-002']);
  expect(assessment.candidate.tree).toBe(tree);
  expect(events.find(event => event.type === 'candidate-prepared')?.data.tree).toBe(tree);
  expect(git.operations().previewCandidateTree).toBe(5);
  git.assertComplete();
  if (exportPath !== undefined) {
    const selected = events.find(event => event.type === 'context-selection-recorded');
    expect(selected?.data.selectionHash).toBeDefined();
    const selectionPath = runLayout.selectionVersion('wi-001', selected!.data.selectionHash!);
    const selectionBytes = await readFile(join(directory, selectionPath));
    const selection = JSON.parse(selectionBytes.toString('utf8'));
    const assignmentBytes = await readFile(join(directory, runLayout.assignmentContext('wi-001.i01')));
    const assignment = JSON.parse(assignmentBytes.toString('utf8'));
    const catalogBytes = await readFile(join(directory, accepted!.data.evidence!.catalog.path));
    const assessmentBytes = await readFile(join(directory, runLayout.assessment('nfa-001')));
    const packageBytes = await readFile(join(directory, runLayout.contextPackage('wi-001', selection.packageHash)));
    expect(hash(catalogBytes)).toBe(accepted!.data.evidence!.catalog.hash);
    expect(hash(selectionBytes)).toBe(selected!.data.selectionHash);
    expect(hash(packageBytes)).toBe(selection.packageHash);
    expect(packageBytes.toString('utf8')).toContain(selectedQuote);
    const first = events[0];
    const last = events.at(-1);
    const implementationEnd = await implementationFiles();
    const measurement = {
      trial: 'functional-two-nfr-one-cited', boundary: 'actual harness state machine with scripted agent, Git and checks; no process/model quality claim',
      run: { id: receipt.jobId, state: last?.type, durationMs: first && last ? Date.parse(last.at) - Date.parse(first.at) : null,
        eventCount: events.length, finalGate: [...events].reverse().find(event => event.type === 'gate-attempted' && event.data.checkpoint === 'final')?.data ?? null },
      source: { manifestHash: catalog.manifestHash, catalogHash: hash(catalogBytes),
        selectionHash: hash(selectionBytes), assignmentContextHash: hash(assignmentBytes), packageHash: hash(packageBytes),
        catalogCounts: accepted!.data.catalog, catalogItems: catalog.items.map((item: { id: string; classification: string }) => ({ id: item.id, classification: item.classification })),
        selectedIds: selection.selected.map((item: { item: string }) => item.item), citedIds: assignment.citedItems,
        packageBytes: packageBytes.length, citedQuoteBytes: Buffer.byteLength(selectedQuote),
        citedQuoteInPackage: packageBytes.toString('utf8').includes(selectedQuote) },
      assessment: { id: assessment.id, hash: hash(assessmentBytes), candidateTree: assessment.candidate.tree,
        resultIds: assessment.results.map((item: { nfr: string; result: string }) => ({ nfr: item.nfr, result: item.result })),
        rounds: events.filter(event => event.type === 'nonfunctional-round-closed').map(event => event.data),
        denominator: accepted!.data.catalog?.nfr ?? null, assessed: assessment.results.length,
        adviceCount: accepted!.data.catalog?.advice ?? null },
      humanReview: { reviewedNfrs: 0, denominator: accepted!.data.catalog?.nfr ?? null,
        analysisApprovalEvents: events.filter(event => event.type === 'analysis-approved').length,
        reason: 'scripted unattended run received no person review of catalog semantics' },
      execution: { modelTokens: null, modelTokensReason: 'scripted agent has no model usage', treePreviews: git.operations().previewCandidateTree,
        processSpawns: 0 },
      implementation: { head: process.env.PLAN13_IMPLEMENTATION_HEAD ?? null,
        dirty: process.env.PLAN13_IMPLEMENTATION_DIRTY === undefined ? null : process.env.PLAN13_IMPLEMENTATION_DIRTY === 'true',
        identitySource: 'runner-supplied environment, not verified by process-guarded test',
        filesStart: implementationStart, filesEnd: implementationEnd,
        sourceStable: implementationStart?.every((entry, index) => entry.sha256 === implementationEnd[index]?.sha256) ?? false },
    };
    await mkdir(dirname(exportPath), { recursive: true });
    await writeFile(exportPath, `${JSON.stringify(measurement, null, 2)}\n`);
  }
}, 120_000);
