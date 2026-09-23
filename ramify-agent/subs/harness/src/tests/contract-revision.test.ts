import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byWork, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse, scenariosCommitted } from './helpers/contracts-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
import {
  consumerAgainstFake, consumerAgainstReal, consumerStub, consumerTest, contractNeeded, contractWrites,
  established, paths, providerWrites, type Seam,
} from './helpers/contracts.js';
import { reopenEvidence } from '../contracts/revision.js';
import { contractsLayout, type ConsumerRequirement, type ContractRecord, type ProviderObligation } from '../contracts/records.js';
import { workLayout, type WorkItem } from '../work/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import type { RunEvent } from '../run/log.js';

/*
 * P3 and P4: what a contract revision reschedules, and how a provider that
 * cannot meet the agreement says so.
 *
 * A revision does not reset the work that stands. Every consumer attached to
 * the agreement is reopened at the new revision; an item that had completed
 * stays completed and gets a follow-up, and an item that has not finished
 * keeps its identity and receives the current evidence at its next turn.
 *
 * Nothing here simulates a transition. Every submission goes through the
 * same judge an agent's would, and every file is written through the port's
 * own built-ins behind the write guard. Git and the gate's commands are
 * external: each scenario states the revision Git reports for every commit
 * the harness attempts, or that the tree was unchanged, and the run's own
 * records are then read for what it did with those answers.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const tags = 'collection-review/workspace/reviews/tags';
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

/**
 * A run whose Git answers are this scenario's own fixture data: the revision
 * it reports for each commit the harness attempts, or that the tree was
 * unchanged.
 */
async function run(root: string, plan: Parameters<typeof byWork>[0], commits: readonly CommitResponse[]) {
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted('review-notes'), ...commits] });
  const opened = await openRuns(root, {
    script: byWork(plan), inputs: treeInputs(), git, readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
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

// P3 is exercised with scripted external tools in contract-revision-scripted.test.ts.

describe('P4: an ordinary provider engineer reports inability to conform through its own submission union', () => {
  const agreed: Seam = { ...forNotes, behavior: 'A note of at most 500 characters is within the limit.' };
  const relaxed: Seam = {
    ...forNotes,
    limit: 300,
    behavior: 'A note of at most 300 characters is within the limit, which is what the store can index.',
  };

  test('revision-needed reaches the waiting consumer once, and the agreement stands until the revision registers', async () => {
    const root = await fixtureWith([
      consumerModule(notesDirectory, 'notes', 'notes.ts'),
      { directory: limitsDirectory, name: 'limits', files: {} },
    ]);

    const seam = paths(agreed);
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect:wi-001': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
        submit(yieldFor(['rq-001'])),
        // The provider's report came back here, while this item was yielded.
        submit(reviseContract(notes, 'ct-001', 'The provider cannot index a note of 500 characters; agree the limit it can keep.')),
        submit(yieldFor(['rq-001'])),
        submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the revised real limit.' })),
        submit(requestCompletion()),
      ],
      'engineer:wi-001': [
        submit(contractNeeded(agreed)),
        submit(completionProposed('The notes now use the revised real limit.'), write(paths(relaxed).consumer, consumerAgainstReal(relaxed))),
      ],
      'contract-engineer:wi-001': [
        submit(established(agreed), ...contractWrites(agreed)),
        submit(established(relaxed), ...contractWrites(relaxed)),
      ],
      'local-architect:wi-002': [
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(assign(limits, {}, outline({ changes: 'Implement the limit the revised agreement states.' }))),
        submit(requestCompletion()),
      ],
      'engineer:wi-002': [
        submit({
          kind: 'unsuitable',
          reason: 'provider-cannot-conform',
          detail: 'The agreed suite requires a note of 500 characters to be kept, and the store this module writes to indexes 300.',
        }),
        submit(completionProposed('The real limit is implemented at the revised length.'), ...providerWrites(relaxed)),
      ],
    }, [
      // The agreement's files when it is established, the same files again
      // when it is revised, the provider's when it implements the revision,
      // and the consumer's when it moves off the fake.
      accepted('wi-001.i02', 'revision-01', [...added(seam.contract, seam.fake, seam.subjects, seam.conformance), ...modified(seam.consumer)]),
      accepted('wi-001.i03', 'revision-02', modified(seam.contract, seam.fake, seam.subjects, seam.conformance, seam.consumer)),
      accepted('wi-002.i02', 'revision-03', [...added(seam.real), ...modified(seam.subjects)]),
      unchanged('wi-002'),
      accepted('wi-001.i04', 'revision-04', modified(seam.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ]);

    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await events(root, runId);
    const types = log.map(event => event.type);

    // The report reaches the consumer once, with the obligation the harness
    // derived from the assignment and the iteration that reported it.
    const reports = log.filter(event => event.type === 'revision-needed');
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toEqual({
      obligation: { id: 'ob-ct-001', revision: 1, hash: expect.any(String) },
      iteration: 'wi-002.i01',
      consumerWorkItem: 'wi-001',
    });

    // The provider's iteration closed as unsuitable before the report, and
    // the report went to the consumer's architect next, while that consumer
    // was yielded.
    const closed = log
      .filter(event => event.type === 'iteration-closed')
      .find(event => event.data.iteration === 'wi-002.i01')!;
    expect(closed.data.outcome).toBe('unsuitable');
    expect(closed.sequence).toBeLessThan(reports[0]!.sequence);
    const yieldedAt = log.findIndex(event => event.type === 'work-item-yielded');
    expect(yieldedAt).toBeLessThan(types.indexOf('revision-needed'));
    const next = log.slice(types.indexOf('revision-needed') + 1).find(event => event.type === 'invocation-started');
    expect(next?.data.role).toBe('local-architect');

    // The revision is a contract iteration of the consumer's own work item,
    // assigned directly: it names the agreement and no requesting engineer.
    const requested = log.filter(event => event.type === 'contract-requested');
    expect(requested.map(event => [event.data.iteration, event.data.requestedBy, event.data.revises])).toEqual([
      ['wi-001.i02', 'wi-001.i01', null],
      ['wi-001.i03', null, 'ct-001'],
    ]);
    expect(types.indexOf('revision-needed')).toBeLessThan(log.findIndex(event =>
      event.type === 'contract-requested' && event.data.revises !== null));

    // The agreement stood unchanged until the revision was registered: no
    // record of revision 2 exists before the reopening, and revision 1 is
    // still exactly what the first gate established.
    expect(log.filter(event => event.type === 'contract-registered').map(event => event.data.revision)).toEqual([1]);
    const reopened = log.filter(event => event.type === 'evidence-reopened');
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.data).toMatchObject({
      contract: 'ct-001',
      revision: 2,
      obligation: 'ob-ct-001',
      requirements: ['rq-001'],
      // Both items are unfinished, so both keep their identity and there is
      // no follow-up to create.
      followUps: [],
      superseded: [],
    });
    expect(reopened[0]!.data.bindings.map(binding => [binding.subject.id, binding.workItem])).toEqual([
      ['ob-ct-001', 'wi-002'],
      ['rq-001', 'wi-001'],
    ]);
    const first = await readJson<ContractRecord>(root, runId, contractsLayout.contract('ct-001', 1));
    expect(first).toMatchObject({ revision: 1, behavior: agreed.behavior, establishedBy: { iteration: 'wi-001.i02' } });
    const second = await readJson<ContractRecord>(root, runId, contractsLayout.contract('ct-001', 2));
    expect(second).toMatchObject({ revision: 2, behavior: relaxed.behavior, establishedBy: { iteration: 'wi-001.i03' } });

    // The reused provider item owes the revision it is now bound to, and
    // not the one it reported it could not meet.
    const before = await readJson<IterationAssignment>(root, runId, iterationLayout.assignment('wi-002', 1));
    const after = await readJson<IterationAssignment>(root, runId, iterationLayout.assignment('wi-002', 2));
    expect(before.evidenceObligations[0]!.obligation).toMatchObject({ id: 'ob-ct-001', revision: 1 });
    expect(after.evidenceObligations[0]!.obligation).toMatchObject({ id: 'ob-ct-001', revision: 2 });
    expect(after.evidenceObligations[0]!.suite).toEqual([paths(relaxed).conformance]);

    // Only the revision closes the delegation, and only at its own revision.
    expect(log.filter(event => event.type === 'provider-conformed').map(event => event.data.revision)).toEqual([2]);
    expect(log.filter(event => event.type === 'requirement-verified').map(event => event.data.revision)).toEqual([2]);
    expect(onlyRun(service, 'review-notes').counts.openRequirements).toBe(0);

    // The revision was committed as a change of its own, after the agreement
    // it revises: the run made four commits on its own branch, and the gates
    // that followed them without a write of their own changed nothing.
    expect(git.branch()).toBe(`ramify-agent/run-${runId}`);
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03', 'revision-04']);
    expect(git.subjects().slice(1, 3).map(subject => subject.split(':')[0])).toEqual(['wi-001.i02', 'wi-001.i03']);
    // Each commit was made over the revision the one before it was accepted
    // at: the boundary the run observed against advanced once per accepted
    // attempt, and the revision never reset it.
    expect(git.bases('changedEntries')).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03']);
    expect(git.bases('diffNameStatus')).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03']);
    git.assertAnswered();
  }, 60_000);

  test('a second report at the same obligation revision fails the run rather than asking again', async () => {
    const root = await fixtureWith([
      consumerModule(notesDirectory, 'notes', 'notes.ts'),
      { directory: limitsDirectory, name: 'limits', files: {} },
    ]);

    const seam = paths(agreed);
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect:wi-001': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
        submit(yieldFor(['rq-001'])),
        // The architect was told and did not revise: it waits again.
        submit(yieldFor(['rq-001'])),
      ],
      'engineer:wi-001': [submit(contractNeeded(agreed))],
      'contract-engineer:wi-001': [submit(established(agreed), ...contractWrites(agreed))],
      'local-architect:wi-002': [
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(assign(limits, {}, outline({ changes: 'Try the agreed limit again.' }))),
      ],
      'engineer:wi-002': [submit({
        kind: 'unsuitable',
        reason: 'provider-cannot-conform',
        detail: 'The agreed suite requires a length the store cannot index.',
      })],
    }, [
      // Only the agreement was ever committed. The provider reported that it
      // could not conform and wrote nothing, and the run failed before any
      // further gate.
      accepted('wi-001.i02', 'revision-01', [...added(seam.contract, seam.fake, seam.subjects, seam.conformance), ...modified(seam.consumer)]),
    ]);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('unresolvable-requirement');
    expect(snapshot.failure?.message).toContain('cannot conform to ob-ct-001 at revision 1');

    const log = await events(root, runId);
    // The report is deduplicated per obligation revision: it was made once,
    // and the second attempt ended the run instead of asking again.
    expect(log.filter(event => event.type === 'revision-needed')).toHaveLength(1);
    expect(log.map(event => event.type)).not.toContain('evidence-reopened');
    expect(log.at(-1)!.type).toBe('job-failed');

    // The failing run committed the agreement it did establish, and nothing
    // after it: a failure is not a rewind.
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01']);
    git.assertAnswered();
  }, 60_000);
});

describe('the reopening is derived, and it supersedes what the previous revision assigned', () => {
  const requirement = (id: string, workItem: string, consumer: string): ConsumerRequirement => ({
    schema: 'ramify-agent.consumer-requirement/1',
    id,
    revision: 2,
    workItem,
    consumer,
    forCapability: 'review-notes',
    obligation: 'ob-ct-001',
    contractRevision: 2,
    behavior: 'the revised behavior',
    evidence: { tests: { policy: 'owned-by-scope', exactOwners: [consumer], subtrees: [], extraSuites: [] }, fakeInjections: [] },
  });

  const item = (id: string, module: string, startedFor: string | null): WorkItem => ({
    schema: 'ramify-agent.work-item/1',
    id,
    module,
    origin: { entry: 'review-notes' },
    goal: 'do the work',
    requirementRefs: [{ anchor: 'Request' }],
    acceptanceRefs: [{ anchor: 'Acceptance' }],
    startedFor,
  });

  const assignment = (id: string, workItem: string): IterationAssignment => ({
    schema: 'ramify-agent.iteration-assignment/1',
    id,
    workItem,
    outline: { id: workItem, revision: 1, hash: 'a'.repeat(64) },
    stage: 0,
    kind: 'ordinary',
    goal: 'g',
    approach: 'a',
    scope: {
      revision: 1,
      base: { module: 'm', includedChildren: [] },
      extra: [],
      read: [],
      bootstrap: [],
      rationale: 'r',
      resolved: { roots: [], files: [], view: { status: 'placeholder' } },
    },
    requirementRefs: [],
    externalCapabilities: [],
    completionEvidence: 'e',
    evidenceObligations: [],
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [], subtrees: [], extraSuites: [] } },
    guarded: [],
    authorizations: [],
  });

  test('an unfinished item is reused and its open assignment closes as superseded; a completed one is followed', () => {
    const obligation: ProviderObligation = {
      schema: 'ramify-agent.provider-obligation/1',
      id: 'ob-ct-001',
      revision: 2,
      contract: { id: 'ct-001', revision: 2, hash: 'b'.repeat(64) },
      capability: 'note-limit',
      provider: limits,
      behavior: 'the revised behavior',
      evidence: { conformance: ['suite.test.ts'], against: 'real' },
    };

    const reopening = reopenEvidence({
      obligation,
      requirements: [requirement('rq-001', 'wi-001', notes), requirement('rq-002', 'wi-002', tags)],
      requestedBy: 'wi-002',
      previous: new Map([['ob-ct-001', 'wi-003'], ['rq-001', 'wi-001'], ['rq-002', 'wi-002']]),
      completed: new Set(['wi-001']),
      items: new Map([
        ['wi-001', item('wi-001', notes, null)],
        ['wi-002', item('wi-002', tags, null)],
        ['wi-003', item('wi-003', limits, 'wi-001')],
      ]),
      workItemCount: 3,
      unfinishedAssignments: [assignment('wi-003.i02', 'wi-003'), assignment('wi-001.i04', 'wi-001')],
    });

    // The provider had not finished, so it keeps its identity; the consumer
    // that had completed is followed, and the one that had not is reused.
    expect(reopening.bindings.map(binding => [binding.subject.id, binding.workItem])).toEqual([
      ['ob-ct-001', 'wi-003'],
      ['rq-001', 'wi-004'],
      ['rq-002', 'wi-002'],
    ]);
    expect(reopening.followUps).toHaveLength(1);
    expect(reopening.followUps[0]).toMatchObject({
      id: 'wi-004',
      module: notes,
      follows: 'wi-001',
      startedFor: 'wi-002',
      requirementRefs: [{ anchor: 'Request' }],
    });

    // Only an assignment of a reused item closes: the completed item's own
    // history is not rewritten, and its assignment is not touched.
    expect(reopening.superseded.map(result => result.iteration)).toEqual(['wi-003.i02']);
    expect(reopening.superseded[0]!.outcome).toBe('superseded');
    expect(reopening.superseded[0]!.gate).toBeNull();
    expect(reopening.records.map(record => record.path)).toEqual([
      'work-items/wi-004/item.json',
      'work-items/wi-003/iterations/02/result.json',
    ]);
  });

  test('nothing is scheduled twice: the same reopening derives the same identifiers', () => {
    const request = {
      obligation: null,
      requirements: [requirement('rq-001', 'wi-001', notes)],
      requestedBy: 'wi-001',
      previous: new Map([['rq-001', 'wi-001']]),
      completed: new Set(['wi-001']),
      items: new Map([['wi-001', item('wi-001', notes, null)]]),
      workItemCount: 1,
      unfinishedAssignments: [] as IterationAssignment[],
    };
    const first = reopenEvidence(request);
    const again = reopenEvidence(request);
    expect(first.followUps.map(entry => entry.id)).toEqual(['wi-002']);
    expect(again.followUps.map(entry => entry.id)).toEqual(first.followUps.map(entry => entry.id));
    expect(again.bindings).toEqual(first.bindings);
    expect(again.records.map(record => record.path)).toEqual(first.records.map(record => record.path));
    const results: readonly IterationResult[] = again.superseded;
    expect(results).toEqual([]);
  });
});
