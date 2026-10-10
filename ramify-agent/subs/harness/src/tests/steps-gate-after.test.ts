import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { runLayout } from '../run/records.js';
import { RunLog } from '../run/log.js';
import { acquireProjectLock } from '../store/lock.js';
import { maximumLineBytes } from '../../subs/ledger/src/ledger.js';
import type { ProvisionalSourceGit } from '../../subs/evidence/src/provisional-git.js';
import { reviewLayout } from '../reviews/records.js';
import { snapshotToolNames } from '../../subs/reviews/src/snapshot.js';
import { parseStepInputs, serializeStepInputs, type StepInputs } from '../steps/inputs.js';
import { inputsFromRun } from '../steps/from-run.js';
import { piBuiltinDeclarations } from '../../subs/agent/subs/pi/src/session-operations.js';
import { iterationLayout } from '../work/iterations.js';
import { workLayout } from '../work/records.js';
import { repairContinuationRun } from './helpers/repair-run.js';
import { requestCompletion } from './helpers/analysis.js';
import { reviewInputsFromRequest } from '../steps/review-step.js';
import { runStepCommandWith } from '../steps/command.js';
import { runStepAfter, type StepAfterOptions } from '../steps/after.js';
import { runStepGate, type StepGateOptions } from '../steps/gate.js';
import { runStep, type StepRunOptions, type StepRunResult } from '../steps/run.js';
import { createPassingCheckExecution, mappedAudit, passingAudit } from './helpers/direct-check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { gateGit } from './helpers/gate-git.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { addModule, assign, completionProposed, edit, installMiniRunner, outline, partialReport, readDeclaredTree, unsuitableScope } from './helpers/iterations.js';
import { fixtureScratchGit, mockGit } from './helpers/mock-git.js';
import { runEventsOnDisk, runPath } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * S15-S18, S24, S25: `step gate` and `step after` over a manual run, on the
 * scripted fake, with scripted Git, candidates, audit and Ramify answers.
 */

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const notesSource = `${notesDirectory}/src/notes.ts`;
const planId = 'manual-notes';
const workItem = 'state-note-limit';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function project(): Promise<{ root: string; scratch: string }> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': 'import { test, expect } from \'vitest\';\nimport { noteLimit } from \'../notes.ts\';\n\ntest(\'the limit\', () => { expect(noteLimit).toBe(500); });\n',
  });
  await installMiniRunner(fixture.root);
  const scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-after-'));
  cleanups.push(() => rm(scratch, { recursive: true, force: true }));
  return { root: fixture.root, scratch };
}

const item = {
  schema: 'ramify-agent.work-item/1', id: workItem, module: notes, origin: { entry: 'review-note' },
  goal: 'State the note limit the reviewers asked for.', requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null,
};

/** Engineer inputs authored with no run, written to a file. */
async function authoredInputs(root: string, scratch: string): Promise<string> {
  const files = { workItem: join(scratch, 'work-item.json'), assignment: join(scratch, 'assignment.json') };
  await writeFile(files.workItem, JSON.stringify(item));
  await writeFile(files.assignment, JSON.stringify(assign(notes, { goal: 'Raise the note limit to 500.' }, outline())));
  const out = join(scratch, 'inputs.json');
  const result = await runStepCommandWith({
    command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, projectRoot: root, out, authored: files,
  }, { ramify: new FakeRamifyCli(), git: { currentHead: async () => 'authored-base' }, configuredAudit: passingAudit(), index: readDeclaredTree });
  if (result.exitStatus !== 0) throw new Error(result.stderr);
  return out;
}

/** What scripted Git answers outside a gate: the commit HEAD names, the candidate tree and the changes between two commits. */
interface Repository {
  head: string;
  changed?: string[] | undefined;
  tree?: string | undefined;
  diffs?: Record<string, ReadonlyArray<{ status: string; path: string }>>;
}

/** Git as a step run and an after-handling ask it, with the run branch created once. */
function stepGit(repository: Repository) {
  const branches = new Set<string>();
  const git = mockGit({
    currentHead: async () => repository.head,
    changedPaths: async () => [...repository.changed ?? []],
    createRunBranch: async (_root, runId) => {
      const branch = `ramify-agent-run/${runId}`;
      const created = !branches.has(branch);
      branches.add(branch);
      return { branch, created };
    },
    previewCandidateTree: async root => {
      if (repository.tree === undefined) throw new Error('No candidate tree is scripted');
      return { repositoryRoot: root, head: repository.head, tree: repository.tree };
    },
    diffNameStatus: async (_root, from, to) => {
      const changes = repository.diffs?.[`${from}..${to}`];
      if (changes === undefined) throw new Error(`No changes are scripted between ${from} and ${to}`);
      return [...changes];
    },
  });
  cleanups.push(async () => { expect(git.unexpected, 'unscripted Git').toEqual([]); });
  return fixtureScratchGit(git);
}

async function step(inputs: string, run: string, script: readonly ScriptStep[], git: StepRunOptions['git'], extra: Partial<StepRunOptions> = {}): Promise<StepRunResult> {
  return runStep({ inputs, run, agent: createScriptedAgent(script), ramify: new FakeRamifyCli(), git, refresh: readDeclaredTree, ...extra });
}

function invocationOf(result: StepRunResult): string {
  if (result.status !== 'finished') throw new Error(`the step did not start: ${result.reason}`);
  expect(result.exitStatus, `${result.summary.ended}: ${result.summary.error ?? ''} ${JSON.stringify(result.summary.start)} rejected ${result.summary.rejectedSubmissions}`).toBe(0);
  return result.summary.invocation;
}

async function after(run: string, invocation: string, extra: Partial<StepAfterOptions> = {}) {
  return runStepAfter({ run, invocation, ramify: new FakeRamifyCli(), refresh: readDeclaredTree, configuredAudit: passingAudit(), ...extra });
}

async function events(root: string, runId: string) {
  return runEventsOnDisk(root, planId, runId);
}

const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

describe('S17: after a completion proposal, with and without its gate', () => {
  test('records bindings, closes only on a passing committed gate, requests reviews, and repeats idempotently', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const run = runPath(root, planId, 'm-001');
    const repository: Repository = { head: 'base-1' };
    const git = stepGit(repository);
    const engineer = invocationOf(await step(inputs, run, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('Raised the limit to 500.') },
    ], git));

    // Before any gate: nothing closes, and the next step is named.
    const early = await after(run, engineer, { git });
    expect(early.exitStatus, early.lines.join('\n')).toBe(0);
    expect(early.lines.join('\n')).toContain('Not run: the close of state-note-limit.i01 and its review requests: no committed gate audited the proposal');
    expect((await events(root, 'm-001')).filter(event => event.type === 'iteration-closed')).toEqual([]);

    // The iteration gate commits the candidate on the run branch and requests the configured audit.
    const tree = 'b'.repeat(40);
    const gitAtGate = gateGit(root, {
      head: 'base-1',
      commits: [{ commit: 'cand-1', changes: [{ status: 'M', path: notesSource }] }],
      previews: [],
    });
    gitAtGate.git.createRunBranch.mockImplementation(async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: false }));
    const candidates = scriptedCandidates(root, { 'cand-1': { tree, base: 'base-1', files: { [notesSource]: 'export const noteLimit = 500;\n' },
      changes: [{ status: 'M', path: notesSource }] } });
    const gated = await runStepGate({ run, checkpoint: 'iteration', invocation: engineer, ramify: new FakeRamifyCli(), git: fixtureScratchGit(gitAtGate.git),
      candidates, configuredAudit: passingAudit(), refresh: readDeclaredTree });
    expect(gated.exitStatus, gated.lines.join('\n')).toBe(0);
    expect(gated.attempt).toMatchObject({ checkpoint: 'iteration', verdict: 'passed', proposedBy: engineer, audited: 'cand-1',
      subject: { workItem, iteration: `${workItem}.i01` } });
    expect(gitAtGate.messages).toHaveLength(1);
    expect(gated.lines.join('\n')).toContain(`Subject: `);
    gitAtGate.assertComplete();

    // After the passing gate: the ownership of its changes, the accepted close and the review requests.
    // A candidate that changed after the audit is stale evidence.
    Object.assign(repository, { head: 'cand-1', tree: 'c'.repeat(40), diffs: { 'base-1..cand-1': [{ status: 'M', path: notesSource }] } });
    const stale = await after(run, engineer, { git, candidates });
    expect(stale.exitStatus, stale.lines.join('\n')).toBe(0);
    expect(stale.notRun.join('\n')).toContain('gate ga-0001 is stale, since the candidate changed after it audited tree');
    expect((await events(root, 'm-001')).filter(event => event.type === 'iteration-closed')).toEqual([]);
    repository.tree = tree;
    const accepted = await after(run, engineer, { git, candidates });
    expect(accepted.exitStatus, accepted.lines.join('\n')).toBe(0);
    expect(accepted.applied).toEqual([
      'the ownership of 1 changed path of cand-1, as the provider answers it now',
      'the close of state-note-limit.i01: accepted on gate ga-0001, commit cand-1',
      'the review requests rq-0001, rq-0002, rq-0003',
    ]);
    expect(accepted.notRun.join('\n')).toContain('the review sessions of rq-0001 (code), rq-0002 (scope), rq-0003 (design)');
    const closed = (await events(root, 'm-001')).filter(event => event.type === 'iteration-closed');
    expect(closed.map(event => event.data)).toEqual([expect.objectContaining({ iteration: `${workItem}.i01`, outcome: 'accepted', gate: 'ga-0001' })]);

    // A repeat commits nothing it already committed.
    const before = await readFile(join(run, runLayout.events), 'utf8');
    const repeated = await after(run, engineer, { git, candidates });
    expect(repeated.exitStatus, repeated.lines.join('\n')).toBe(0);
    expect(repeated.applied).toEqual([
      'nothing more for the close: state-note-limit.i01 was already closed accepted on gate ga-0001',
      'nothing more for the reviews: rq-0001, rq-0002, rq-0003 were already requested',
    ]);
    expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(before);

    // S25: the code review runs as a reviewer step in the manual run, and its terminal attempt settles the request.
    const composed = await reviewInputsFromRequest({ runDirectory: run, request: 'rq-0001', candidates, configuredAudit: passingAudit() });
    if (composed.status !== 'composed') throw new Error(composed.reason);
    expect(composed.inputs).toMatchObject({ role: 'reviewer', question: 'code', attempt: 1, snapshotTree: tree, start: { kind: 'fresh' },
      run: { planId, runId: 'm-001' }, work: { workItem, iteration: `${workItem}.i01` } });
    expect(composed.inputs.briefing.diffPayload).toContain('noteLimit = 500');
    const reviewInputs = join(scratch, 'review.json');
    await writeFile(reviewInputs, serializeStepInputs(composed.inputs));
    const reviewed = await step(reviewInputs, run, [
      { kind: 'tool', tool: snapshotToolNames.read, input: { path: notesSource } },
      { kind: 'submit', input: { inspected: [notesSource], missing: [], concerns: [] } },
    ], git, { candidates });
    if (reviewed.status !== 'finished') throw new Error(reviewed.reason);
    expect(reviewed.exitStatus).toBe(0);
    expect(reviewed.summary).toMatchObject({ role: 'reviewer', variant: 'code', ended: 'submitted' });
    expect(reviewed.summary.records.review).toBe(join(run, reviewLayout.attempt('rq-0001.a01')));
    expect(await json(reviewed.summary.records.review!)).toMatchObject({ request: 'rq-0001', settles: true, invocation: reviewed.summary.invocation,
      result: { result: 'complete', inspected: [{ path: notesSource }], concerns: 0 } });
    const settled = await events(root, 'm-001');
    expect(settled.filter(event => event.type === 'review-attempt-started').map(event => event.data)).toEqual([
      expect.objectContaining({ request: 'rq-0001', attempt: 'rq-0001.a01', invocation: reviewed.summary.invocation })]);
    expect(settled.filter(event => event.type === 'review-attempt-finished')).toHaveLength(1);
    // A settled request composes no further attempt.
    expect(await reviewInputsFromRequest({ runDirectory: run, request: 'rq-0001', candidates, configuredAudit: passingAudit() }))
      .toEqual({ status: 'refused', reason: 'review request rq-0001 was already settled by rq-0001.a01' });
    const again = await step(reviewInputs, run, [], git, { candidates });
    expect(again).toMatchObject({ status: 'not-started', exitStatus: 2, reason: expect.stringContaining('already settled') });
    // A role whose after-handling is not applied is reported as not run, with nothing recorded.
    const unhandled = await after(run, reviewed.summary.invocation, { git, candidates });
    expect(unhandled).toMatchObject({ exitStatus: 0, applied: [] });
    expect(unhandled.notRun).toEqual(['the handling after a reviewer invocation, which `step after` does not apply; nothing was recorded']);
  }, 120_000);
});

describe('S15: gate subjects, refusals and the in-place diagnosis', () => {
  test('refuses ambiguous and missing subjects, keeps a diagnosis out of the ledger, and a failed gate closes nothing', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const run = runPath(root, planId, 'm-002');
    const repository: Repository = { head: 'base-1' };
    const git = stepGit(repository);
    const gate = (options: Partial<StepGateOptions> & Pick<StepGateOptions, 'checkpoint'>) =>
      runStepGate({ run, ramify: new FakeRamifyCli(), git, refresh: readDeclaredTree, configuredAudit: passingAudit(), ...options });

    expect(await gate({ checkpoint: 'iteration' })).toMatchObject({ exitStatus: 2,
      lines: [expect.stringContaining('holds no manual run; `step run` creates one')] });
    const first = invocationOf(await step(inputs, run, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('Raised the limit to 500.') },
    ], git));

    // The diagnosis runs in place, is written beside the run's records and never into its log.
    const log = await readFile(join(run, runLayout.events), 'utf8');
    const diagnosis = await gate({ checkpoint: 'iteration', noCommit: true, checkExecution: createPassingCheckExecution() });
    expect(diagnosis.exitStatus, diagnosis.lines.join('\n')).toBe(0);
    expect(diagnosis).toMatchObject({ diagnosis: true, record: join(run, 'diagnoses', 'd-0001', 'attempt.json'), attempt: { proposedBy: first, verdict: 'passed' } });
    expect(diagnosis.lines.join('\n')).toContain('This diagnosis is not audit evidence');
    expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(log);
    const diagnosed = await after(run, first, { git });
    expect(diagnosed.notRun.join('\n')).toContain('its 1 in-place diagnosis is not audit evidence');
    expect((await events(root, 'm-002')).filter(event => event.type === 'iteration-closed')).toEqual([]);

    // A second open proposal makes the subject ambiguous until one is named.
    const second = invocationOf(await step(inputs, run, [{ kind: 'submit', input: completionProposed('Nothing more to change.') }], git));
    const beforeRefusals = await readFile(join(run, runLayout.events), 'utf8');
    const ambiguous = await gate({ checkpoint: 'iteration' });
    expect(ambiguous).toMatchObject({ exitStatus: 2, attempt: null });
    expect(ambiguous.lines.join('\n')).toContain(`more than one completion proposal could be meant: ${first} (${workItem}.i01), ${second} (${workItem}.i01)`);
    expect((await gate({ checkpoint: 'iteration', invocation: 'inv-0099' })).lines.join('\n'))
      .toContain('invocation inv-0099 is not an engineer\'s accepted completion proposal');
    expect((await gate({ checkpoint: 'readiness', invocation: first })).exitStatus).toBe(2);
    expect((await gate({ checkpoint: 'work-item' })).lines.join('\n')).toContain('holds no completion request awaiting its work-item gate');
    expect((await gate({ checkpoint: 'final' })).exitStatus).toBe(2);
    expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(beforeRefusals);

    // A failed iteration gate is committed evidence that closes nothing.
    const gitAtGate = gateGit(root, { head: 'base-1', commits: [{ commit: 'cand-2', changes: [{ status: 'M', path: notesSource }] }], previews: [] });
    gitAtGate.git.createRunBranch.mockImplementation(async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: false }));
    const failing = mappedAudit(({ check }) => (check.kind === 'tests' ? { outcome: { kind: 'completed', exitCode: 1 }, stdout: 'the limit failed' } : {}));
    const failed = await gate({ checkpoint: 'iteration', invocation: second, git: fixtureScratchGit(gitAtGate.git), configuredAudit: failing,
      candidates: scriptedCandidates(root, { 'cand-2': { tree: 'd'.repeat(40), base: 'base-1', files: {}, changes: [] } }) });
    expect(failed.exitStatus, failed.lines.join('\n')).toBe(1);
    expect(failed.attempt).toMatchObject({ verdict: 'failed', proposedBy: second });
    const afterFailed = await after(run, second, { git });
    expect(afterFailed.exitStatus).toBe(0);
    expect(afterFailed.notRun.join('\n')).toContain(`the latest gate ${failed.attempt!.id} of this proposal did not pass`);
    expect((await events(root, 'm-002')).filter(event => event.type === 'iteration-closed')).toEqual([]);

    // Readiness audits the baseline and commits nothing.
    const gitAtReadiness = gateGit(root, { head: 'base-1', commits: [], previews: [] });
    gitAtReadiness.git.createRunBranch.mockImplementation(async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: false }));
    const readiness = await gate({ checkpoint: 'readiness', git: fixtureScratchGit(gitAtReadiness.git) });
    expect(readiness.exitStatus, readiness.lines.join('\n')).toBe(0);
    expect(readiness.attempt).toMatchObject({ checkpoint: 'readiness', verdict: 'passed', commit: null, proposedBy: null });
    expect(gitAtReadiness.messages).toEqual([]);
    expect((await events(root, 'm-002')).filter(event => event.type === 'readiness-passed')).toHaveLength(1);
    gitAtReadiness.assertComplete();
  }, 120_000);
});

/** A passing iteration gate of one proposal, with Git, candidates and the audit scripted. */
async function passingGate(root: string, run: string, invocation: string, commit: string, tree: string) {
  const gitAtGate = gateGit(root, { head: 'base-1', commits: [{ commit, changes: [{ status: 'M', path: notesSource }] }], previews: [] });
  gitAtGate.git.createRunBranch.mockImplementation(async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: false }));
  const candidates = scriptedCandidates(root, { [commit]: { tree, base: 'base-1', files: { [notesSource]: 'export const noteLimit = 500;\n' },
    changes: [{ status: 'M', path: notesSource }] } });
  const gated = await runStepGate({ run, checkpoint: 'iteration', invocation, ramify: new FakeRamifyCli(), git: fixtureScratchGit(gitAtGate.git),
    candidates, configuredAudit: passingAudit(), refresh: readDeclaredTree });
  expect(gated.exitStatus, gated.lines.join('\n')).toBe(0);
  return { gated, candidates };
}

describe('S18: errors name their cause and the last completed transition', () => {
  test('an invalid module description fails the ownership query after a passing gate; nothing is closed', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const run = runPath(root, planId, 'm-003');
    const repository: Repository = { head: 'base-1' };
    const git = stepGit(repository);
    const engineer = invocationOf(await step(inputs, run, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('Raised the limit to 500.') },
    ], git));
    const tree = 'e'.repeat(40);
    const { gated, candidates } = await passingGate(root, run, engineer, 'cand-3', tree);
    Object.assign(repository, { head: 'cand-3', tree, diffs: { 'base-1..cand-3': [{ status: 'M', path: notesSource }] } });

    // The provider refuses the project, as it does for a module description it cannot parse.
    const ramify = new FakeRamifyCli();
    vi.spyOn(ramify, 'queryOwnership').mockRejectedValue(new Error(`${notesDirectory}/module.ramify: line 3: unknown declaration "exposes"`));
    const last = (await events(root, 'm-003')).at(-1)!;
    const failed = await after(run, engineer, { git, candidates, ramify });
    expect(failed.exitStatus, failed.lines.join('\n')).toBe(1);
    expect(failed.lines).toContain(`Error: The ownership of cand-3's changes cannot be queried: ${notesDirectory}/module.ramify: line 3: unknown declaration "exposes"`);
    expect(failed.lines.at(-1)).toBe(`Last completed transition: #${last.sequence} ${last.type}`);
    expect(gated.attempt!.verdict).toBe('passed');
    expect((await events(root, 'm-003')).filter(event => event.type === 'iteration-closed' || event.type === 'review-request-recorded')).toEqual([]);
  }, 120_000);

  test('a result over the ledger line bound fails its close and keeps every earlier transition', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const run = runPath(root, planId, 'm-004');
    const git = stepGit({ head: 'base-1' });
    // One unfinished entry the size of the line bound: the result record that carries it cannot fit one line.
    const engineer = invocationOf(await step(inputs, run, [
      { kind: 'submit', input: partialReport([], ['x'.repeat(maximumLineBytes)]) },
    ], git));
    const committed = await readFile(join(run, runLayout.events), 'utf8');
    const last = (await events(root, 'm-004')).at(-1)!;
    const failed = await after(run, engineer, { git });
    expect(failed.exitStatus, failed.lines.slice(0, 3).join('\n').slice(0, 2000)).toBe(1);
    expect(failed.lines).toContainEqual(expect.stringMatching(new RegExp(`over the ${maximumLineBytes}-byte line bound`, 'u')));
    expect(failed.lines.at(-1)).toBe(`Last completed transition: #${last.sequence} ${last.type}`);
    expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(committed);
  }, 120_000);
});

describe('S24: run, gate and after share the lock, the settlement and the identity rules', () => {
  test('refuse an implementation run, an identity mismatch, a changed submission, a held lock and an unsettled writer', async () => {
    const { root, scratch } = await project();
    const inputs = await authoredInputs(root, scratch);
    const run = runPath(root, planId, 'm-005');
    const git = stepGit({ head: 'base-1' });
    const engineer = invocationOf(await step(inputs, run, [{ kind: 'submit', input: unsuitableScope('The limit is owned elsewhere.') }], git));
    const gate = (directory: string) => runStepGate({ run: directory, checkpoint: 'iteration', ramify: new FakeRamifyCli(), git, refresh: readDeclaredTree,
      configuredAudit: passingAudit() });

    // An implementation run is never a manual run.
    const implementation = runPath(root, planId, 'r-impl');
    await mkdir(implementation, { recursive: true });
    await writeFile(join(implementation, 'job.json'), JSON.stringify({ schema: 'ramify-agent.job/3', jobId: 'r-impl', planId, kind: 'implementation' }));
    for (const result of [await after(implementation, engineer, { git }), await gate(implementation)]) {
      expect(result.exitStatus).toBe(2);
      expect(result.lines.join('\n')).toContain('is an implementation run');
    }
    // A manual run whose record names another run.
    const mismatched = runPath(root, planId, 'm-other');
    await mkdir(mismatched, { recursive: true });
    await writeFile(join(mismatched, 'job.json'), await readFile(join(run, 'job.json'), 'utf8'));
    for (const result of [await after(mismatched, engineer, { git }), await gate(mismatched)]) {
      expect(result.exitStatus).toBe(2);
      expect(result.lines.join('\n')).toContain(`names run ${planId}/m-005, not its directory ${planId}/m-other`);
    }
    // A held project lock is someone else's.
    const lock = await acquireProjectLock(root);
    try {
      for (const result of [await after(run, engineer, { git }), await gate(run)]) {
        expect(result.exitStatus).toBe(2);
        expect(result.lines.join('\n')).toContain('holds the project lock');
      }
      const stepped = await step(inputs, run, [], git);
      expect(stepped).toMatchObject({ exitStatus: 2, reason: expect.stringContaining('holds the project lock') });
    } finally { await lock.release(); }

    // A submission that differs from the hash its end recorded.
    const submission = join(run, runLayout.submission(engineer));
    const accepted = await readFile(submission, 'utf8');
    await writeFile(submission, accepted.replace('The limit is owned elsewhere.', 'The limit is owned here.'));
    const changed = await after(run, engineer, { git });
    expect(changed.exitStatus).toBe(2);
    expect(changed.lines.join('\n')).toMatch(/Refused: .*hash/u);
    await writeFile(submission, accepted);

    // A writer that was never released may still be writing.
    const log = await RunLog.open(join(run, runLayout.events), 'm-005');
    await log.append({ type: 'writer-acquired', data: { invocation: 'inv-0099', scopeRevision: null } }, new Date());
    for (const result of [await after(run, engineer, { git }), await gate(run)]) {
      expect(result.exitStatus).toBe(2);
      expect(result.lines.join('\n')).toContain('the writer inv-0099 of the manual run was never released');
    }
    expect(await step(inputs, run, [], git)).toMatchObject({ exitStatus: 2, reason: expect.stringContaining('the writer inv-0099 of the manual run was never released') });
  }, 120_000);
});

describe('S16: after a local architect\'s turn, and the inputs of its next turn', () => {
  test('an assignment, a partial result with the next-turn inputs, and a completion request, each repeated idempotently', async () => {
    const owned: Array<() => Promise<void>> = [];
    try {
      const source = await repairContinuationRun(owned);
      // The finished run's service holds the project lock until it is closed; the copy stays until the end.
      await owned.pop()!();
      const sourceRun = runPath(source.root, source.planId, source.runId);
      const started = (await runEventsOnDisk(source.root, source.planId, source.runId)).flatMap(event => event.type === 'invocation-started' ? [event.data] : []);
      const imported = async (role: string, pick: (inputs: StepInputs) => boolean) => {
        for (const { invocation } of started.filter(entry => entry.role === role)) {
          const result = await inputsFromRun({ role, runDirectory: sourceRun, invocation, builtinDeclarations: piBuiltinDeclarations });
          if (result.status === 'imported' && pick(result.inputs)) return result.inputs;
        }
        throw new Error(`no ${role} inputs to import`);
      };
      const scratch = await mkdtemp(join(tmpdir(), 'ramify-agent-after-architect-'));
      owned.push(() => rm(scratch, { recursive: true, force: true }));
      const file = async (name: string, inputs: StepInputs) => {
        const path = join(scratch, name);
        await writeFile(path, serializeStepInputs(inputs));
        return path;
      };
      const turn = await imported('local-architect', inputs => inputs.role === 'local-architect' && inputs.phase === 'work-turn' && inputs.attempt === 1);
      if (turn.role !== 'local-architect' || turn.phase !== 'work-turn') throw new Error('not a work turn');
      const item = turn.briefing.item.id;
      const run = runPath(source.root, source.planId, 'm-arch');
      const git = stepGit({ head: 'base-9' });
      const answers: string[] = [];
      const stepHere = (inputs: string, script: readonly ScriptStep[]) => runStep({ inputs, run, agent: createScriptedAgent(script),
        ramify: new FakeRamifyCli(), git, refresh: readDeclaredTree, onProgress: event => { if (event.type === 'submission') answers.push(event.answer); } });

      // The assignment: the work item and outline the turn was given, the outline and the assignment it submitted.
      const architect = invocationOf(await stepHere(await file('turn.json', turn), [{ kind: 'submit', input: assign(notes, { goal: 'Raise the note limit to 500.' }, outline()) }]));
      const assigned = await after(run, architect, { git });
      expect(assigned.exitStatus, assigned.lines.join('\n')).toBe(0);
      expect(assigned.applied.join('\n')).toContain(`work-item-started ${workLayout.item(item)}`);
      expect(assigned.applied).toContainEqual(`outline revision 1 of ${item}`);
      expect(assigned.applied).toContainEqual(`assignment ${item}.i01: ${join(run, iterationLayout.assignment(item, 1))}`);
      expect(assigned.notRun).toEqual([`scheduling the engineer of ${item}.i01; a run starts it from the assignment record`]);
      const assignedEvent = (await runEventsOnDisk(source.root, source.planId, 'm-arch')).find(event => event.type === 'iteration-assigned');
      expect(assignedEvent?.data).toMatchObject({ workItem: item, iteration: `${item}.i01`, invocation: architect });
      const log = await readFile(join(run, runLayout.events), 'utf8');
      expect((await after(run, architect, { git })).applied).toEqual([`nothing more: ${item}.i01 was already assigned by ${architect}`]);
      expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(log);

      // The engineer of that iteration reports partial work: its result, and the architect's next-turn inputs.
      const engineerInputs = await imported('engineer', inputs => inputs.role === 'engineer' && inputs.assignment.id === `${item}.i01`);
      const engineer = invocationOf(await stepHere(await file('engineer.json', engineerInputs),
        [{ kind: 'submit', input: partialReport(['Read the limit.'], ['Raise it to 500.']) }]));
      const reported = await after(run, engineer, { git });
      expect(reported.exitStatus, reported.lines.join('\n')).toBe(0);
      expect(reported.applied).toContainEqual(`the result of ${item}.i01: partial, ${join(run, iterationLayout.result(item, 1))}`);
      const nextPath = join(run, 'invocations', engineer, 'next-turn-inputs.json');
      expect(reported.applied).toContainEqual(`the local architect's next-turn inputs: ${nextPath}`);
      expect(reported.notRun).toEqual([`the local architect's next turn, which a run continues with ${item}.i01's result`]);
      const next = parseStepInputs(await readFile(nextPath, 'utf8'));
      if (next.role !== 'local-architect' || next.phase !== 'work-turn') throw new Error('not a work turn');
      expect(next).toMatchObject({ attempt: 2, run: { planId: source.planId, runId: 'm-arch' },
        briefing: { lastIteration: { id: `${item}.i01`, outcome: 'partial', findings: ['unfinished: Raise it to 500.'], commit: null } } });
      expect(next.briefing.outlines.map(entry => entry.revision)).toEqual([1]);
      expect(next.start).toMatchObject({ continuing: 'iteration-closed' });
      const repeated = await after(run, engineer, { git });
      expect(repeated.applied).toEqual([`nothing more for the close: ${item}.i01 was already closed partial`,
        `nothing more for the next turn: ${nextPath} already holds these inputs`]);

      // The next turn requests completion: the reports and the completion outline; the work-item gate is named, not run.
      // The turn reports the plan's scenario done, as the completion request requires of it.
      const completingRun = await stepHere(nextPath, [{ kind: 'submit', input: { ...requestCompletion(), reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] } }]);
      expect(completingRun.exitStatus, answers.join('\n---\n')).toBe(0);
      const completing = invocationOf(completingRun);
      const requested = await after(run, completing, { git });
      expect(requested.exitStatus, requested.lines.join('\n')).toBe(0);
      expect(requested.applied).toEqual([`1 obligation transition from the 1 registrations and reports of ${completing}`,
        `the completion outline, revision 2 of ${item}`]);
      expect(requested.notRun).toEqual([`settling ${item}'s reviews, reconciliation, its work-item gate and its completion; \`step gate --checkpoint work-item --invocation ${completing}\` runs the gate once its reviews are settled`]);
      const afterRequest = await runEventsOnDisk(source.root, source.planId, 'm-arch');
      expect(afterRequest.filter(event => event.type === 'outline-revised').map(event => event.data)).toContainEqual(expect.objectContaining({ revision: 2, invocation: completing }));
      expect(afterRequest.filter(event => event.type === 'gate-attempted' || event.type === 'work-item-completed')).toEqual([]);
      const settledLog = await readFile(join(run, runLayout.events), 'utf8');
      expect((await after(run, completing, { git })).applied).toEqual([
        `nothing for the 1 registrations and reports of ${completing}: each is recorded already or names no obligation this manual run holds`,
        `nothing more: the completion outline revision 2 of ${item} was already recorded for ${completing}`]);
      expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(settledLog);
      expect(afterRequest.filter(event => event.type === 'obligation-reported').map(event => event.data)).toEqual([
        expect.objectContaining({ id: 'sc-001', judgment: 'done', by: completing })]);

      // S15: the work-item gate audits the completion request's candidate; the final gate then audits the run's.
      const gitAtGates = gateGit(source.root, { head: 'base-9', commits: [{ commit: null }, { commit: null }], previews: [] });
      gitAtGates.git.createRunBranch.mockImplementation(async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: false }));
      const gateHere = (checkpoint: StepGateOptions['checkpoint'], invocation?: string) => runStepGate({ run, checkpoint, invocation,
        ramify: new FakeRamifyCli(), git: fixtureScratchGit(gitAtGates.git), configuredAudit: passingAudit(), refresh: readDeclaredTree,
        candidates: scriptedCandidates(source.root, {}) });
      const workItemGate = await gateHere('work-item', completing);
      expect(workItemGate.exitStatus, workItemGate.lines.join('\n')).toBe(0);
      expect(workItemGate.attempt).toMatchObject({ checkpoint: 'work-item', verdict: 'passed', proposedBy: completing, subject: { workItem: item } });
      expect((await gateHere('work-item')).lines.join('\n')).toContain('holds no completion request awaiting its work-item gate');
      const finalGate = await gateHere('final');
      expect(finalGate.exitStatus, finalGate.lines.join('\n')).toBe(0);
      expect(finalGate.attempt).toMatchObject({ checkpoint: 'final', verdict: 'passed' });
      expect(finalGate.lines).toContain('Not run: the non-functional assessment and its candidate binding, which a run makes before its final gate.');
      gitAtGates.assertComplete();
    } finally {
      for (const cleanup of owned.reverse()) await cleanup();
    }
  }, 300_000);
});

describe('S16: after an engineer needs a capability', () => {
  test('captures the provisional source and reports the capability workflow as not run', async () => {
    const { root, scratch } = await project();
    const authored = parseStepInputs(await readFile(await authoredInputs(root, scratch), 'utf8'));
    const inputs = join(scratch, 'capability-inputs.json');
    await writeFile(inputs, serializeStepInputs(parseStepInputs(JSON.stringify({ ...authored, capabilityWorkflow: true }))));
    const run = runPath(root, planId, 'm-006');
    const repository: Repository = { head: 'base-1' };
    const git = stepGit(repository);
    const engineer = invocationOf(await step(inputs, run, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: { kind: 'capability-needed', summary: 'The limit needs a source of truth', request: {
        need: 'A note limit the reviewers configure', usage: [{ path: notesSource, use: 'Read the configured limit', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'configured limit', code: 'expect(noteLimit()).toBe(500)', designation: 'pseudocode' }],
      } } },
    ], git));
    // The source as the writer settled it: what changed against the accepted base, read from the tree; nothing staged.
    Object.assign(repository, { changed: [notesSource], tree: 'f'.repeat(40) });
    const sourceGit: ProvisionalSourceGit = {
      stagedPaths: async () => [],
      // The index ('') holds the base's bytes of an unstaged file.
      readBlob: async (_root, revision, path) => ((revision === 'base-1' || revision === '') && path === notesSource ? Buffer.from('export const noteLimit = 400;\n') : null),
    };
    const needed = await after(run, engineer, { git, provisionalSourceGit: sourceGit });
    expect(needed.exitStatus, needed.lines.join('\n')).toBe(0);
    expect(needed.applied).toEqual([expect.stringMatching(new RegExp(`^the provisional source of ${engineer} for request need-001: 1 changed path, ${run}/capabilities/snapshots/`, 'u'))]);
    expect(needed.notRun).toEqual([`the capability workflow of ${workItem}'s need in ${workItem}.i01: its request record, its architect and its return to the engineer`]);
    const log = await readFile(join(run, runLayout.events), 'utf8');
    const repeated = await after(run, engineer, { git, provisionalSourceGit: sourceGit });
    expect(repeated.applied, repeated.lines.join('\n')).toEqual(needed.applied);
    expect(await readFile(join(run, runLayout.events), 'utf8')).toBe(log);
  }, 120_000);
});
