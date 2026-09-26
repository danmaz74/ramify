import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { createPackage, elementCatalogSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { intakeToolName } from '../analysis/extraction.js';
import { contextSelectorToolName, workOrientationToolName } from '../context-selection/submissions.js';
import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import { runLayout } from '../run/records.js';
import { iterationAssignmentSchema, iterationLayout } from '../work/iterations.js';
import { RunQueries } from '../projections/queries.js';
import { copyFixture } from './helpers/fixture.js';
import { defaultTurn, withDefaultTurns } from './helpers/declarations.js';
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
  writeFileSync(plan, `# Request\n\n${selectedQuote}\n${advice}\nSee [audit requirements](audit.md).\n\n# Acceptance\n\nThe scenario passes.\n`);
  writeFileSync(join(dirname(plan), 'audit.md'), `# Audit requirements\n\n${uncitedQuote}\n`);
  let documents: Array<{ id: string; path: string }> = [];
  let localTurn = 0;
  const script = withDefaultTurns(spec => {
    if (spec.submission.name === intakeToolName) {
      documents = [...spec.prompt.matchAll(/^- (doc-\d{3,}) \(plan\): ([^;]+);/gmu)].map(match => ({ id: match[1]!, path: match[2]! }));
      const audit = documents.find(document => document.path === 'plans/revision-diff/audit.md')!.id;
      const input = (defaultTurn(spec)![0] as { readonly input: Record<string, unknown> }).input;
      return submit({ ...input, elements: [
        { key: 'timeout', kind: 'non-functional', document: 'doc-001', text: selectedQuote, conditions: [], uncertainty: '' },
        { key: 'audit', kind: 'non-functional', document: audit, text: uncitedQuote, conditions: [], uncertainty: '' },
        { key: 'redis', kind: 'recommendation', document: 'doc-001', text: advice, conditions: [], uncertainty: 'Optional.' },
      ] });
    }
    if (spec.role === 'initial-architect') return submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core', 'Summarizes a review.')]));
    if (spec.submission.name === 'submit_work_item_result') return localTurn++ === 0
      ? submit(assign('collection-review/workspace/reviews/core', { citedElements: ['fr-001', 'nfr-001'] }, outline()))
      : submit({ ...requestCompletion(), scenarios: ['sc-001'] });
    if (spec.role === 'engineer') return submit(completionProposed('The behavior satisfies the assignment.', { scenarios: ['sc-001'] }));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [
      { nfr: 'nfr-001', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'], evidence: ['Timeout source inspected.'], uncertainty: '' },
      { nfr: 'nfr-002', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'], evidence: ['Audit record source inspected.'], uncertainty: '' },
    ] });
    return [];
  });
  const agent = createScriptedAgent(spec => {
    if (spec.submission.name !== contextSelectorToolName) return typeof script === 'function' ? script(spec) : script;
    const parent = agent.sessions.find(session => session.spec.submission.name === workOrientationToolName);
    if (!parent || !agent.forget(parent.ref)) throw new Error('Expected retained orientation point');
    return submit({ selected: [{ id: 'nfr-001', reason: 'Needed by this assignment', conditions: [], uncertainty: '' }] });
  });
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
  expect(accepted?.data.catalog).toEqual({ context: 0, functional: 2, nonFunctional: 2, fixed: 0, recommendation: 1 });
  const catalog = elementCatalogSchema.parse(JSON.parse(await readFile(join(directory, accepted!.data.evidence!.catalog.path), 'utf8')));
  expect(catalog.elements.map(element => [element.id, element.kind])).toEqual([
    ['nfr-001', 'non-functional'], ['nfr-002', 'non-functional'], ['rec-001', 'recommendation'], ['fr-001', 'functional'], ['fr-002', 'functional'],
  ]);
  const engineers = agent.sessions.filter(session => session.spec.role === 'engineer');
  expect(engineers).toHaveLength(1);
  expect(engineers[0]!.spec.prompt).toContain(selectedQuote);
  expect(engineers[0]!.spec.prompt).not.toContain(uncitedQuote);
  expect(engineers[0]!.spec.prompt).not.toContain(advice);
  expect(catalog.elements.find(element => element.id === 'nfr-001')!.document).not.toBe(catalog.elements.find(element => element.id === 'nfr-002')!.document);
  expect(documents.some(document => document.path === 'plans/revision-diff/audit.md')).toBe(true);
  const coordinator = agent.sessions.filter(session => session.spec.role === 'nonfunctional-coordinator');
  expect(coordinator).toHaveLength(1);
  expect(coordinator[0]!.spec.prompt).toContain(selectedQuote);
  expect(coordinator[0]!.spec.prompt).toContain(uncitedQuote);
  expect(coordinator[0]!.spec.prompt).toContain('### nfr-002');
  expect(coordinator[0]!.spec.prompt).not.toContain(advice);
  expect(coordinator[0]!.spec.prompt).not.toContain('rec-001');
  const assessment = JSON.parse(await readFile(join(directory, runLayout.assessment('nfa-001')), 'utf8'));
  expect(assessment.results.map((item: { nfr: string }) => item.nfr)).toEqual(['nfr-001', 'nfr-002']);
  expect(assessment.candidate.tree).toBe(tree);
  expect(events.find(event => event.type === 'candidate-prepared')?.data.tree).toBe(tree);
  const bound = events.find(event => event.type === 'candidate-bound-to-gate');
  expect(bound?.type).toBe('candidate-bound-to-gate');
  if (bound?.type !== 'candidate-bound-to-gate') throw new Error('Missing final candidate binding');
  const readiness = await new RunQueries(opened.service).mergeReadiness('revision-diff', receipt.jobId,
    opened.service.getRun('revision-diff', receipt.jobId)!.version);
  expect(readiness.readiness.status, readiness.readiness.reason).toBe('ready');
  expect(readiness.readiness).toMatchObject({ candidate: { tree },
    finalGate: bound.data.gate, gateCommit: bound.data.commit, checkFindings: [] });
  expect(git.operations().previewCandidateTree).toBe(5);
  git.assertComplete();
  if (exportPath !== undefined) {
    const selected = events.find(event => event.type === 'context-selection-recorded');
    expect(selected?.data.selectionHash).toBeDefined();
    const selectionPath = runLayout.selectionVersion('wi-001', selected!.data.selectionHash!);
    const selectionBytes = await readFile(join(directory, selectionPath));
    const selection = JSON.parse(selectionBytes.toString('utf8'));
    const assignmentBytes = await readFile(join(directory, iterationLayout.assignment('wi-001', 1)));
    const assignment = iterationAssignmentSchema.parse(JSON.parse(assignmentBytes.toString('utf8')));
    const catalogBytes = await readFile(join(directory, accepted!.data.evidence!.catalog.path));
    const assessmentBytes = await readFile(join(directory, runLayout.assessment('nfa-001')));
    const rendered = createPackage({ catalog, planDeviations: [], elements: assignment.source!.elements, deviations: assignment.source!.deviations });
    if ('unavailable' in rendered) throw new Error('The assignment package does not render');
    const packageBytes = Buffer.from(rendered.text);
    expect(hash(catalogBytes)).toBe(accepted!.data.evidence!.catalog.hash);
    expect(hash(selectionBytes)).toBe(selected!.data.selectionHash);
    expect(hash(packageBytes)).toBe(assignment.source!.hash);
    expect(packageBytes.toString('utf8')).toContain(selectedQuote);
    const first = events[0];
    const last = events.at(-1);
    const implementationEnd = await implementationFiles();
    const measurement = {
      trial: 'functional-two-nfr-one-cited', boundary: 'actual harness state machine with scripted agent, Git and checks; no process/model quality claim',
      run: { id: receipt.jobId, state: last?.type, durationMs: first && last ? Date.parse(last.at) - Date.parse(first.at) : null,
        eventCount: events.length, finalGate: [...events].reverse().find(event => event.type === 'gate-attempted' && event.data.checkpoint === 'final')?.data ?? null },
      source: { documents, manifestHash: catalog.manifestHash, catalogHash: hash(catalogBytes),
        selectionHash: hash(selectionBytes), assignmentHash: hash(assignmentBytes), packageHash: hash(packageBytes),
        catalogCounts: accepted!.data.catalog, catalogItems: catalog.elements.map(element => ({ id: element.id, kind: element.kind })),
        selectedIds: selection.selected.map((item: { id: string }) => item.id), citedIds: assignment.source!.elements,
        packageBytes: packageBytes.length, citedQuoteBytes: Buffer.byteLength(selectedQuote),
        citedQuoteInPackage: packageBytes.toString('utf8').includes(selectedQuote) },
      assessment: { id: assessment.id, hash: hash(assessmentBytes), candidateTree: assessment.candidate.tree,
        resultIds: assessment.results.map((item: { nfr: string; result: string }) => ({ nfr: item.nfr, result: item.result })),
        rounds: events.filter(event => event.type === 'nonfunctional-round-closed').map(event => event.data),
        denominator: accepted!.data.catalog?.nonFunctional ?? null, assessed: assessment.results.length,
        recommendationCount: accepted!.data.catalog?.recommendation ?? null },
      humanReview: { reviewedNfrs: 0, denominator: accepted!.data.catalog?.nonFunctional ?? null,
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
