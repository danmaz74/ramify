import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byWork, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { scriptedGit, type GitCheckpoint } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools, openRunsWithoutProcesses } from './helpers/external-tools.js';
import {
  consumerAgainstFake, consumerAgainstReal, consumerStub, consumerTest, contractNeeded, contractWrites,
  established, paths, providerWrites, type Seam,
} from './helpers/contracts.js';
import { contractsLayout, type ConsumerRequirement, type ContractRecord, type ProviderObligation } from '../contracts/records.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';
import { workLayout, type WorkItem } from '../work/records.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import type { RunEvent } from '../run/log.js';

/*
 * P3, scripted: what a contract revision reschedules, with no external tool.
 *
 * This is the boundary spike's converted copy of the P3 scenario in
 * `contract-revision.test.ts`. The state machine, the judge, the write guard,
 * the ledger and every file the run writes are the run's own; what the
 * scenario answers instead of running is Git, the Ramify command line and
 * the commands readiness would spawn. Git is external, like the model behind
 * an agent: this file states the revisions it reports and then asserts that
 * the run's records name those revisions. Nothing here is a repository.
 *
 * The filesystem assertions below are the witnesses for what was actually
 * written; the scripted revisions witness only what the run did with Git's
 * answers.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const tags = 'collection-review/workspace/reviews/tags';
const tagsDirectory = 'subs/workspace/subs/reviews/subs/tags';
const marks = 'collection-review/workspace/reviews/marks';
const marksDirectory = 'subs/workspace/subs/reviews/subs/marks';
const limits = 'collection-review/workspace/reviews/limits';
const limitsDirectory = 'subs/workspace/subs/reviews/subs/limits';

/** The agreement as `notes` needs it. */
const forNotes: Seam = {
  capability: 'note-limit',
  name: 'NoteLimit',
  providerDirectory: limitsDirectory,
  provider: limits,
  consumerDirectory: notesDirectory,
  consumerFile: 'notes.ts',
  reach: '../../limits',
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
};
const forTags: Seam = { ...forNotes, consumerDirectory: tagsDirectory, consumerFile: 'tags.ts' };
const forMarks: Seam = { ...forNotes, consumerDirectory: marksDirectory, consumerFile: 'marks.ts' };

/** Revision 2: the agreement also states that a note is trimmed before the limit applies. */
const trimming: Seam = {
  ...forMarks,
  trims: true,
  behavior: 'A note is trimmed, and the trimmed note of at most 500 characters is within the limit.',
};

// Git responses are fixture data. Changed iterations commit; the subsequent
// work-item and final checks have no new changes and return null.
const c = paths(forNotes);
const modified = (...paths: string[]) => paths.map(path => ({ status: 'M', path }));
const added = (...paths: string[]) => paths.map(path => ({ status: 'A', path }));
const checkpoints: readonly GitCheckpoint[] = [
  { subject: 'wi-001.i02', commit: 'revision-01', changes: [...added(c.contract, c.fake, c.subjects, c.conformance), ...modified(c.consumer)] },
  { subject: 'wi-004.i01', commit: 'revision-02', changes: [...added(c.real), ...modified(c.subjects)] },
  { subject: 'wi-004', commit: null, changes: [] },
  { subject: 'wi-001.i03', commit: 'revision-03', changes: modified(c.consumer) },
  { subject: 'wi-001', commit: null, changes: [] },
  { subject: 'wi-002.i02', commit: 'revision-04', changes: modified(paths(forTags).consumer) },
  { subject: 'wi-002.i03', commit: 'revision-05', changes: modified(paths(forTags).consumer) },
  { subject: 'wi-002', commit: null, changes: [] },
  { subject: 'wi-003.i02', commit: 'revision-06', changes: modified(paths(forMarks).consumer) },
  { subject: 'wi-003.i03', commit: 'revision-07', changes: modified(c.contract, c.fake, c.subjects, c.conformance, paths(forMarks).consumer) },
  { subject: 'wi-005.i01', commit: 'revision-08', changes: modified(c.real, c.subjects) },
  { subject: 'wi-005', commit: null, changes: [] },
  { subject: 'wi-003.i04', commit: 'revision-09', changes: modified(paths(forMarks).consumer) },
  { subject: 'wi-003', commit: null, changes: [] },
  { subject: 'wi-006.i01', commit: 'revision-10', changes: modified(c.consumer) },
  { subject: 'wi-006', commit: null, changes: [] },
  { subject: 'wi-007.i01', commit: 'revision-11', changes: modified(paths(forTags).consumer) },
  { subject: 'wi-007', commit: null, changes: [] },
  { subject: 'final verification of plan "review-notes"', commit: null, changes: [] },
];

/** The revision the fixture is on before the run commits anything. */
const base = 'revision-00';

async function fixtureWith(modules: ReadonlyArray<{ directory: string; name: string; files: Record<string, string> }>) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  for (const module of modules) await addModule(fixture.root, module.directory, module.name, module.files);
  await installMiniRunner(fixture.root);
  return fixture.root;
}

function consumerModule(directory: string, name: string, file: string) {
  return {
    directory,
    name,
    files: { [`src/${file}`]: consumerStub, [`src/tests/${file.replace(/\.ts$/, '')}.test.ts`]: consumerTest(file) },
  };
}

async function run(root: string, plan: Parameters<typeof byWork>[0]) {
  const gitScript = { head: base, checkpoints };
  const git = scriptedGit(root, gitScript);
  const agentScript = byWork(plan);
  const opened = await openRunsWithoutProcesses(root, git, {
    inputs: treeInputs(),
    script: spec => {
      const steps = typeof agentScript === 'function' ? agentScript(spec) : agentScript;
      // The deterministic script declares when a writer runs. Select the
      // canned response for that checkpoint; observe no filesystem output.
      if (steps.some(step => step.kind === 'tool' && step.tool === 'write')) git.givenWrites();
      return steps;
    },
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, runId: receipt.jobId };
}

function place(capability: string, owner: string) {
  return localDecision(
    {
      question: `Where does ${capability} belong?`,
      outcome: 'reuse',
      capability,
      owner,
      rationale: 'The rule is a capability of its own, in a subtree this architect may place work in.',
    },
    [registryChange({ capability, owner, behavior: `The module provides ${capability}.` })],
  );
}

const yieldFor = (requirements: readonly string[]) => ({
  kind: 'yield-for-providers' as const,
  requirements: [...requirements],
  summary: 'This work item runs against its fake and waits for the real provider.',
});

/** The `assign` a consumer architect makes to revise an agreement it consumes. */
function reviseContract(module: string, contract: string, approach: string) {
  return assign(module, {
    kind: 'contract',
    revisesContract: contract,
    goal: `Revise ${contract} so that it states the behavior this module needs.`,
    approach,
    completionEvidence: 'The revised conformance suite passes against the fake, and this module runs against it.',
  });
}

async function events(root: string, runId: string): Promise<RunEvent[]> {
  return runEventsOnDisk(root, 'review-notes', runId);
}

async function readJson<T>(root: string, runId: string, path: string): Promise<T> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, path), 'utf8')) as T;
}

describe('P3: a contract revision reschedules current evidence without resetting completed work', () => {
  test('two consumers complete revision 1, a third revises it, and the follow-ups finish the run', async () => {
    const root = await fixtureWith([
      consumerModule(notesDirectory, 'notes', 'notes.ts'),
      consumerModule(tagsDirectory, 'tags', 'tags.ts'),
      consumerModule(marksDirectory, 'marks', 'marks.ts'),
      { directory: limitsDirectory, name: 'limits', files: {} },
    ]);

    const { service, runId, git, ramify } = await run(root, {
      'initial-architect': [submit(analysis([
        entry('review-notes', notes),
        entry('review-tags', tags),
        entry('review-marks', marks),
      ]))],

      // wi-001, the first consumer: it places the capability, delegates,
      // waits for the provider and verifies against it.
      'local-architect:wi-001': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
        submit(yieldFor(['rq-001'])),
        submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the real limit.' })),
        submit(requestCompletion()),
      ],
      'engineer:wi-001': [
        submit(contractNeeded(forNotes)),
        submit(completionProposed('The notes now use the real limit.'), write(paths(forNotes).consumer, consumerAgainstReal(forNotes))),
      ],
      'contract-engineer:wi-001': [submit(established(forNotes), ...contractWrites(forNotes))],

      // wi-002, the second consumer: it attaches to the agreement in force
      // and verifies without a provider execution of its own.
      'local-architect:wi-002': [
        submit(assign(tags, {}, outline())),
        submit(assign(tags, { kind: 'verification', goal: 'Replace the fake with the real limit.' })),
        submit(requestCompletion()),
      ],
      'engineer:wi-002': [
        submit(contractNeeded(forTags)),
        submit(completionProposed('The tags now use the real limit.'), write(paths(forTags).consumer, consumerAgainstReal(forTags))),
      ],
      'contract-engineer:wi-002': [submit(established(forTags), write(paths(forTags).consumer, consumerAgainstFake(forTags)))],

      // wi-003, the third consumer: it attaches, finds that the agreement
      // does not state what it needs, and revises it.
      'local-architect:wi-003': [
        submit(assign(marks, {}, outline())),
        submit(reviseContract(marks, 'ct-001', 'The agreement says nothing about surrounding space, and this module needs the note trimmed before the limit applies.')),
        submit(yieldFor(['rq-003'])),
        submit(assign(marks, { kind: 'verification', goal: 'Replace the fake with the revised real limit.' })),
        submit(requestCompletion()),
      ],
      'engineer:wi-003': [
        submit(contractNeeded(forMarks)),
        submit(completionProposed('The marks now use the revised real limit.'), write(paths(trimming).consumer, consumerAgainstReal(trimming))),
      ],
      'contract-engineer:wi-003': [
        submit(established(forMarks), write(paths(forMarks).consumer, consumerAgainstFake(forMarks))),
        submit(established(trimming), ...contractWrites(trimming)),
      ],

      // wi-004, the provider of revision 1.
      'local-architect:wi-004': [
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
      ],
      'engineer:wi-004': [submit(completionProposed('The real limit is implemented.'), ...providerWrites(forNotes))],

      // wi-005, the provider follow-up of revision 2.
      'local-architect:wi-005': [
        submit(assign(limits, {}, outline({ changes: 'Implement the trimming the revised agreement states.' }))),
        submit(requestCompletion()),
      ],
      'engineer:wi-005': [submit(completionProposed('The real limit trims before it measures.'), ...providerWrites(trimming))],

      // wi-006 and wi-007, the consumer follow-ups of the two completed items.
      'local-architect:wi-006': [
        submit(assign(notes, { kind: 'verification', goal: 'Verify the notes against the revised limit.' }, outline({ changes: 'The revised limit trims first.' }))),
        submit(requestCompletion()),
      ],
      'engineer:wi-006': [submit(
        completionProposed('The notes follow the revised limit.'),
        write(paths(forNotes).consumer, consumerAgainstReal({ ...forNotes, trims: true })),
      )],
      'local-architect:wi-007': [
        submit(assign(tags, { kind: 'verification', goal: 'Verify the tags against the revised limit.' }, outline({ changes: 'The revised limit trims first.' }))),
        submit(requestCompletion()),
      ],
      'engineer:wi-007': [submit(
        completionProposed('The tags follow the revised limit.'),
        write(paths(forTags).consumer, consumerAgainstReal({ ...forTags, trims: true })),
      )],
    });

    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await events(root, runId);
    const types = log.map(event => event.type);

    // One agreement, registered three times at revision 1 — once
    // established and twice attached — and reopened once.
    expect(log.filter(event => event.type === 'contract-registered')).toHaveLength(3);
    const reopenings = log.filter(event => event.type === 'evidence-reopened');
    expect(reopenings).toHaveLength(1);
    const reopened = reopenings[0]!;
    expect(reopened.data).toMatchObject({
      contract: 'ct-001',
      revision: 2,
      obligation: 'ob-ct-001',
      requirements: ['rq-001', 'rq-002', 'rq-003'],
      iteration: 'wi-003.i03',
      superseded: [],
    });

    // Every new subject revision is bound to the work item responsible for
    // it: the three that had completed are followed, and the one that has
    // not finished keeps its identity.
    expect(reopened.data.bindings.map(binding => [binding.subject.id, binding.subject.revision, binding.workItem])).toEqual([
      ['ob-ct-001', 2, 'wi-005'],
      ['rq-001', 2, 'wi-006'],
      ['rq-002', 2, 'wi-007'],
      ['rq-003', 2, 'wi-003'],
    ]);
    expect(reopened.data.followUps).toEqual([
      { workItem: 'wi-005', follows: 'wi-004' },
      { workItem: 'wi-006', follows: 'wi-001' },
      { workItem: 'wi-007', follows: 'wi-002' },
    ]);

    // The prior records stay as they are: revision 1 is still revision 1,
    // and revision 2 is a file of its own.
    const first = await readJson<ContractRecord>(root, runId, contractsLayout.contract('ct-001', 1));
    const second = await readJson<ContractRecord>(root, runId, contractsLayout.contract('ct-001', 2));
    expect(first.revision).toBe(1);
    expect(first.behavior).toBe(forNotes.behavior);
    expect(first.establishedBy.iteration).toBe('wi-001.i02');
    expect(second.revision).toBe(2);
    expect(second.behavior).toBe(trimming.behavior);
    expect(second.establishedBy.iteration).toBe('wi-003.i03');
    expect(second.artifacts.interface[0]!.exports).toContain('NoteLimitTrimCases');
    expect(second.artifacts.fake[0]!.hash).not.toBe(first.artifacts.fake[0]!.hash);

    const obligation = await readJson<ProviderObligation>(root, runId, contractsLayout.obligation('ob-ct-001', 2));
    expect(obligation.revision).toBe(2);
    const carried = await readJson<ConsumerRequirement>(root, runId, contractsLayout.requirement('rq-001', 2));
    // The requirement keeps its identity and its original consumer item
    // across the revision; the binding is what moved.
    expect(carried).toMatchObject({ id: 'rq-001', revision: 2, workItem: 'wi-001', consumer: notes, contractRevision: 2 });

    // Earlier completions stay historical: each of the three items that
    // completed at revision 1 completed once, before the reopening.
    const completions = log.filter(event => event.type === 'work-item-completed').map(event => event.data.workItem);
    // The provider follow-up runs before any consumer verification, so the
    // consumer that was yielded across the revision completes after it.
    expect(completions).toEqual(['wi-004', 'wi-001', 'wi-002', 'wi-005', 'wi-003', 'wi-006', 'wi-007']);
    expect(types.indexOf('evidence-reopened')).toBeGreaterThan(
      log.findIndex(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-002'));

    // Old evidence cannot satisfy revision 2: every requirement is verified
    // once at each revision, and the run did not complete on the first.
    const verified = log.filter(event => event.type === 'requirement-verified')
      .map(event => `${event.data.requirement}@${event.data.revision}`);
    expect(verified).toEqual(['rq-001@1', 'rq-002@1', 'rq-003@2', 'rq-001@2', 'rq-002@2']);

    // Provider work precedes consumer verification, including when every
    // previous item had completed.
    const conformed = log.filter(event => event.type === 'provider-conformed')
      .map(event => `${event.data.obligation}@${event.data.revision}`);
    expect(conformed).toEqual(['ob-ct-001@1', 'ob-ct-001@2']);
    const providerDone = log.findIndex(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-005');
    for (const follower of ['wi-006', 'wi-007']) {
      expect(log.findIndex(event => event.type === 'work-item-started' && event.data.workItem === follower))
        .toBeGreaterThan(providerDone);
    }

    // The follow-ups are work items of their own, following the items that
    // completed, and they carry those items' plan references.
    const followUp = await readJson<WorkItem>(root, runId, workLayout.item('wi-006'));
    expect(followUp).toMatchObject({ module: notes, follows: 'wi-001', startedFor: 'wi-003' });
    expect(followUp.origin).toEqual({ verification: { id: 'rq-001', revision: 2, hash: expect.any(String) } });
    expect(followUp.requirementRefs).toEqual([{ anchor: 'Request' }]);
    const providerFollowUp = await readJson<WorkItem>(root, runId, workLayout.item('wi-005'));
    expect(providerFollowUp).toMatchObject({ module: limits, follows: 'wi-004' });

    // The follow-up's own assignment carries the current evidence, and the
    // completion check reads the binding rather than the requirement's
    // original work item.
    const followUpAssignment = await readJson<IterationAssignment>(root, runId, iterationLayout.assignment('wi-006', 1));
    expect(followUpAssignment.kind).toBe('verification');
    expect(followUpAssignment.evidenceObligations).toEqual([{
      requirement: { id: 'rq-001', revision: 2, hash: expect.any(String) },
      suite: [paths(trimming).conformance],
      against: 'real',
    }]);

    // Nothing is duplicated: seven work items, one obligation revision per
    // contract revision, and one registration per attachment.
    expect(log.filter(event => event.type === 'work-item-started')).toHaveLength(7);
    expect(onlyRun(service, 'review-notes').counts.openRequirements).toBe(0);
    expect(onlyRun(service, 'review-notes').notices).toEqual([]);

    // The tree the run left: every consumer on the real provider, which
    // trims before it measures.
    for (const seam of [forNotes, forTags, forMarks]) {
      const source = await readFile(`${root}/${paths(seam).consumer}`, 'utf8');
      expect(source).not.toContain('Fake');
      expect(source).toContain('rule.trim(note)');
    }

    // What the run recorded of Git is what Git was scripted to say, and
    // nothing else: the branch it asked for, each committing attempt over
    // the revision the attempt before it accepted, and the audit bound to
    // the revision that attempt committed. This script answers every gate
    // with a revision of its own, so every attempt here is a committing
    // one; a scenario about an unchanged tree scripts that instead.
    const attempts = await Promise.all(log.filter(event => event.type === 'gate-attempted')
      .map(event => readJson<GateAttempt>(root, runId, runLayout.gate(event.data.gate))));
    const committing = attempts.filter(attempt => attempt.commit !== null);
    const scripted = git.commits().map(commit => commit.id);
    expect(git.branch()).toBe(`ramify-agent/run-${runId}`);
    expect(committing.map(attempt => attempt.commit)).toEqual(scripted);
    expect(committing.map(attempt => attempt.audited)).toEqual(scripted);
    expect(committing.map(attempt => attempt.head)).toEqual([base, ...scripted.slice(0, -1)]);
    // Every revision the script minted was minted for one attempt, each
    // attempt is a gate of its own, and the first commit of the run is the
    // iteration that established the agreement.
    expect(git.operations().commitAccepted).toBe(checkpoints.length);
    expect(attempts.map(attempt => attempt.commit)).toEqual(checkpoints.map(step => step.commit));
    expect(attempts.filter(attempt => attempt.commit === null)).toHaveLength(8);
    git.assertComplete();
    expect(new Set(committing.map(attempt => attempt.id)).size).toBe(committing.length);
    expect(committing[0]!.subject.iteration).toBe('wi-001.i02');
    const subjects = committing.map(attempt => attempt.subject.iteration?.split('.')[0] ?? attempt.subject.workItem ?? null);
    expect([...new Set(subjects)]).toEqual(expect.arrayContaining(
      ['wi-001', 'wi-002', 'wi-003', 'wi-004', 'wi-005', 'wi-006', 'wi-007']));
    expect(git.head()).toBe(scripted.at(-1));

    // The external tools this scenario needs: none. Every file asserted
    // above was really written and really read, and no process was started
    // for Git, the checks or the command line.
    expectNoProcesses();
    expect(Object.keys(git.operations()).sort()).toEqual([
      'changedEntries', 'changedPaths', 'commitAccepted', 'createRunBranch',
      'currentHead', 'diffNameStatus', 'findCommitByTrailers', 'isCleanRepository', 'worktreeLineChanges',
    ]);
    expect(ramify.count('materialize')).toBeGreaterThan(0);
    expect(ramify.calls.filter(call => call.operation === 'run' && call.argv[0] === '--version')).toHaveLength(1);
  }, 15_000);
});
