import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byWork, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
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
 * same judge an agent's would, every file is written through the port's own
 * built-ins behind the write guard, and every gate spawns its commands and
 * reads their exit codes.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
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

async function fixtureWith(modules: ReadonlyArray<{ directory: string; name: string; files: Record<string, string> }>) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  for (const module of modules) await addModule(fixture.root, module.directory, module.name, module.files);
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
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
  const opened = await openRuns(root, { script: byWork(plan), inputs: treeInputs() });
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

    const { service, runId } = await run(root, {
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
  }, 900_000);
});

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

    const { service, runId } = await run(root, {
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
    });

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
  }, 900_000);

  test('a second report at the same obligation revision fails the run rather than asking again', async () => {
    const root = await fixtureWith([
      consumerModule(notesDirectory, 'notes', 'notes.ts'),
      { directory: limitsDirectory, name: 'limits', files: {} },
    ]);

    const { service, runId } = await run(root, {
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
    });

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
  }, 900_000);
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
