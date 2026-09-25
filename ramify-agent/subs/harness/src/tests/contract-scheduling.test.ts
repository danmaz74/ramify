import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse, scenariosCommitted } from './helpers/contracts-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
import {
  consumerAgainstReal, consumerStub, consumerTest, contractNeeded, contractWrites, established, paths, providerWrites,
  type Seam,
} from './helpers/contracts.js';
import type { RunEvent } from '../run/log.js';

/*
 * P5: how the harness schedules a delegation when an obligation is shared,
 * when a chain of changes runs back through a module that has already
 * yielded, and when a capability comes to depend on itself.
 *
 * A cycle is a cycle of capabilities. A cycle of modules is not one, and a
 * cycle of changes is not one either, which is what the second test shows.
 *
 * Each scenario states what Git reports for every commit its run attempts,
 * and the scheduling is then read from the run's own ledger and records.
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
const tagsDirectory = 'subs/workspace/subs/reviews/subs/tags';
const limits = 'collection-review/workspace/reviews/limits';
const limitsDirectory = 'subs/workspace/subs/reviews/subs/limits';

const noteLimit: Seam = {
  capability: 'note-limit',
  name: 'NoteLimit',
  providerDirectory: limitsDirectory,
  provider: limits,
  consumerDirectory: notesDirectory,
  consumerFile: 'notes.ts',
  reach: '../../limits',
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
};

const tagLimit: Seam = { ...noteLimit, consumerDirectory: tagsDirectory, consumerFile: 'tags.ts' };

/**
 * A run whose Git answers are this scenario's own fixture data: the
 * revisions it reports for each commit the harness attempts, and the
 * attempts it reports as an unchanged tree.
 */
async function run(root: string, plan: Parameters<typeof byRole>[0], commits: readonly CommitResponse[]) {
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted('review-notes'), ...commits] });
  const opened = await openRuns(root, {
    script: byRole(plan), inputs: treeInputs(), git, readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
}

async function fixtureWith(modules: ReadonlyArray<{ directory: string; name: string; files: Record<string, string> }>) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  for (const module of modules) await addModule(fixture.root, module.directory, module.name, module.files);
  await installMiniRunner(fixture.root);
  return fixture.root;
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
  summary: 'This work item runs against its fakes and waits for the real providers.',
});

async function events(root: string, runId: string): Promise<RunEvent[]> {
  return runEventsOnDisk(root, 'review-notes', runId);
}

describe('P5: a shared obligation runs its provider once and each consumer verifies separately', () => {
  test('a second consumer attaches its own requirement and reuses the current provider work', async () => {
    const root = await fixtureWith([
      { directory: notesDirectory, name: 'notes', files: { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') } },
      { directory: tagsDirectory, name: 'tags', files: { 'src/tags.ts': consumerStub, 'src/tests/tags.test.ts': consumerTest('tags.ts') } },
      { directory: limitsDirectory, name: 'limits', files: {} },
    ]);

    // What Git reports for this scenario: the agreement's own files when the
    // contract iteration establishes them, the provider's when it implements
    // them, each consumer's when it moves off the fake, and an unchanged tree
    // for every gate that follows a commit without a write of its own.
    const note = paths(noteLimit);
    const tag = paths(tagLimit);
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes), entry('review-tags', tags)]))],
      'local-architect': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
        submit(yieldFor(['rq-001'])),
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
        submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the real limit.' })),
        submit(requestCompletion()),
        // The second consumer. Its provider has already conformed, so it
        // attaches and verifies without a provider execution of its own.
        submit(assign(tags, {}, outline())),
        submit(assign(tags, { kind: 'verification', goal: 'Replace the fake with the real limit.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded(noteLimit)),
        submit(completionProposed('The real limit is implemented and the agreed suite runs against it.'), ...providerWrites(noteLimit)),
        submit(completionProposed('The notes now use the real limit.'), write(paths(noteLimit).consumer, consumerAgainstReal(noteLimit))),
        submit(contractNeeded(tagLimit)),
        submit(completionProposed('The tags now use the real limit.'), write(paths(tagLimit).consumer, consumerAgainstReal(tagLimit))),
      ],
      'contract-engineer': [
        submit(established(noteLimit), ...contractWrites(noteLimit)),
        // The same agreement, a second consumer: only the integration differs.
        submit(established(tagLimit), write(paths(tagLimit).consumer, consumerAgainstReal(tagLimit).replace('createNoteLimit(', 'createNoteLimitFake(').replace('/src/note-limit.ts', '/src/fakes/note-limit.fake.ts').replace('{ createNoteLimit }', '{ createNoteLimitFake }'))),
      ],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(note.contract, note.fake, note.subjects, note.conformance), ...modified(note.consumer)]),
      accepted('wi-003.i01', 'revision-02', [...added(note.real), ...modified(note.subjects)]),
      unchanged('wi-003'),
      accepted('wi-001.i03', 'revision-03', modified(note.consumer)),
      unchanged('wi-001'),
      accepted('wi-002.i02', 'revision-04', modified(tag.consumer)),
      accepted('wi-002.i03', 'revision-05', modified(tag.consumer)),
      unchanged('wi-002'),
      unchanged('final verification of plan "review-notes"'),
    ]);

    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await events(root, runId);

    // One contract, one obligation, one provider execution.
    const registrations = log.filter(event => event.type === 'contract-registered');
    expect(registrations).toHaveLength(2);
    expect(registrations[0]!.data).toMatchObject({ contract: 'ct-001', revision: 1, obligation: 'ob-ct-001', requirements: ['rq-001'], providerWorkItem: 'wi-003' });
    // The second registration adds its requirement and its binding, and
    // nothing else: the same contract, the same obligation revision, and the
    // provider work item the first one started.
    expect(registrations[1]!.data).toMatchObject({ contract: 'ct-001', revision: 1, obligation: 'ob-ct-001', requirements: ['rq-002'], providerWorkItem: 'wi-003' });

    expect(log.filter(event => event.type === 'provider-conformed')).toHaveLength(1);
    // Each consumer verifies separately, against the one provider.
    const verifications = log.filter(event => event.type === 'requirement-verified');
    expect(verifications.map(event => event.data.requirement)).toEqual(['rq-001', 'rq-002']);
    expect(verifications.map(event => event.data.workItem)).toEqual(['wi-001', 'wi-002']);

    // Three work items: two entry consumers and one provider.
    expect(log.filter(event => event.type === 'work-item-started')).toHaveLength(3);
    expect(log.filter(event => event.type === 'work-item-completed')).toHaveLength(3);
    expect(onlyRun(service, 'review-notes').counts.openRequirements).toBe(0);
    expect(onlyRun(service, 'review-notes').notices).toEqual([]);

    // The run committed on its own branch, once for each gate, and recorded
    // the revisions Git reported for the five that changed the tree.
    expect(git.branch()).toBe(`ramify-agent-run/${runId}`);
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03', 'revision-04', 'revision-05']);
    git.assertAnswered();
  }, 60_000);
});

describe('P5: a chain of changes back through a module that has yielded is not a cycle', () => {
  test('change 1 in A needing change 2 in B needing change 3 in A completes 3, 2, 1 with no notice', async () => {
    const noteFormat: Seam = {
      capability: 'note-format',
      name: 'NoteFormat',
      providerDirectory: notesDirectory,
      provider: notes,
      consumerDirectory: limitsDirectory,
      consumerFile: 'limit-work.ts',
      reach: '../../notes',
      behavior: 'A note is formatted before the limit is applied to it.',
    };

    const root = await fixtureWith([
      {
        directory: notesDirectory,
        name: 'notes',
        files: { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') },
      },
      {
        directory: limitsDirectory,
        name: 'limits',
        files: { 'src/limit-work.ts': consumerStub, 'src/tests/limit-work.test.ts': consumerTest('limit-work.ts') },
      },
    ]);

    const limit = paths(noteLimit);
    const format = paths(noteFormat);
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect': [
        // wi-001 in A: it needs the limit, which is B's.
        submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
        submit(yieldFor(['rq-001'])),
        // wi-002 in B, the provider of the limit: it needs the format, which
        // is A's. A has a work item yielded, and this need still starts a
        // work item of its own.
        submit({ ...assign(limits, {}, outline({ changes: 'Implement the agreed limit.' })), localDecisions: [place('note-format', notes)] }),
        submit(yieldFor(['rq-002'])),
        // wi-003 in A, the provider of the format.
        submit(assign(notes, {}, outline({ changes: 'Implement the agreed format.' }))),
        submit(requestCompletion()),
        // wi-002, resumed: replace the format fake with the real one and
        // implement the limit it owes, so the agreed suites pass against
        // both real providers.
        submit(assign(limits, { kind: 'verification', goal: 'Replace the format fake with the real one, and implement the limit this work item owes.' })),
        submit(requestCompletion()),
        // wi-001, resumed: verify the limit.
        submit(assign(notes, { kind: 'verification', goal: 'Replace the limit fake with the real one.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded(noteLimit)),
        submit(contractNeeded(noteFormat)),
        submit(completionProposed('The real format is implemented.'), ...providerWrites(noteFormat)),
        submit(completionProposed('The limit work uses the real format, and the real limit is implemented.'),
          write(paths(noteFormat).consumer, consumerAgainstReal(noteFormat)),
          ...providerWrites(noteLimit)),
        submit(completionProposed('The notes use the real limit.'), write(paths(noteLimit).consumer, consumerAgainstReal(noteLimit))),
      ],
      'contract-engineer': [
        submit(established(noteLimit), ...contractWrites(noteLimit)),
        submit(established(noteFormat), ...contractWrites(noteFormat)),
      ],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(limit.contract, limit.fake, limit.subjects, limit.conformance), ...modified(limit.consumer)]),
      accepted('wi-002.i02', 'revision-02', [...added(format.contract, format.fake, format.subjects, format.conformance), ...modified(format.consumer)]),
      accepted('wi-003.i01', 'revision-03', [...added(format.real), ...modified(format.subjects)]),
      unchanged('wi-003'),
      accepted('wi-002.i03', 'revision-04', [...added(limit.real), ...modified(format.consumer, limit.subjects)]),
      unchanged('wi-002'),
      accepted('wi-001.i03', 'revision-05', modified(limit.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ]);

    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await events(root, runId);

    // Three capabilities, three work items, two of them in module A.
    expect(log.filter(event => event.type === 'work-item-started')).toHaveLength(3);
    const started = log.filter(event => event.type === 'work-item-started').map(event => event.data);
    expect(started.filter(data => data.module === notes).map(data => data.workItem)).toEqual(['wi-001', 'wi-003']);

    // They complete in the order 3, 2, 1.
    expect(log.filter(event => event.type === 'work-item-completed').map(event => event.data.workItem)).toEqual(['wi-003', 'wi-002', 'wi-001']);

    // No cycle: the nodes of the graph are capabilities, so a chain that
    // runs back through a module is an ordinary chain.
    expect(log.map(event => event.type)).not.toContain('dependency-cycle-detected');
    expect(onlyRun(service, 'review-notes').notices).toEqual([]);

    // The second provider work item was started for the item that yielded,
    // which is what the depth-first stack records.
    const resumed = log.filter(event => event.type === 'work-item-resumed').map(event => event.data.workItem);
    expect(resumed).toEqual(['wi-002', 'wi-001']);

    // Each provider and each consumer committed once, in the order the chain
    // completed, and the gates between them changed nothing.
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03', 'revision-04', 'revision-05']);
    git.assertAnswered();
  }, 60_000);
});

describe('P5: a capability that transitively depends on itself', () => {
  test('the cycle returns to the local architect once, is a notice, and the same cycle again fails the run', async () => {
    // The provider of the limit needs the very capability its consumer is
    // implementing. The graph closes on itself.
    const backToNotes: Seam = {
      capability: 'review-notes',
      name: 'ReviewNotes',
      providerDirectory: notesDirectory,
      provider: notes,
      consumerDirectory: limitsDirectory,
      consumerFile: 'limit-work.ts',
      reach: '../../notes',
      behavior: 'The limit reports what the review notes say about it.',
    };

    const root = await fixtureWith([
      { directory: notesDirectory, name: 'notes', files: { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') } },
      { directory: limitsDirectory, name: 'limits', files: { 'src/limit-work.ts': consumerStub, 'src/tests/limit-work.test.ts': consumerTest('limit-work.ts') } },
    ]);

    const limit = paths(noteLimit);
    const back = paths(backToNotes);
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
        submit(yieldFor(['rq-001'])),
        // wi-002, the provider of the limit: its engineer asks for the
        // capability its own consumer is implementing.
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        // The cycle came back here. The re-plan asks for the same thing.
        submit(assign(limits, { goal: 'Try the same need again.' })),
      ],
      engineer: [
        submit(contractNeeded(noteLimit)),
        submit(contractNeeded(backToNotes)),
        submit(contractNeeded(backToNotes)),
      ],
      'contract-engineer': [
        submit(established(noteLimit), ...contractWrites(noteLimit)),
        submit(established(backToNotes), ...contractWrites(backToNotes)),
        submit(established(backToNotes), ...contractWrites(backToNotes)),
      ],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(limit.contract, limit.fake, limit.subjects, limit.conformance), ...modified(limit.consumer)]),
      accepted('wi-002.i02', 'revision-02', [...added(back.contract, back.fake, back.subjects, back.conformance), ...modified(back.consumer)]),
      // The second attempt at the same agreement writes the same files with
      // the same content, and Git reports an unchanged tree for it.
      unchanged('wi-002.i04'),
    ]);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('dependency-cycle');

    const log = await events(root, runId);
    const detections = log.filter(event => event.type === 'dependency-cycle-detected');
    expect(detections).toHaveLength(2);
    for (const detection of detections) {
      expect(detection.data.members).toEqual(['note-limit', 'review-notes']);
      expect(detection.data.closedBy).toBe('wi-002');
    }
    expect(detections.map(event => event.data.detection)).toEqual([1, 2]);

    // The first detection returned to the local architect of the work item
    // whose registration closed it, before anything else was invoked.
    const first = log.indexOf(detections[0]!);
    const next = log.slice(first + 1).find(event => event.type === 'invocation-started');
    expect(next?.data.role).toBe('local-architect');

    // Every detected cycle is a notice the person sees, resolved or not.
    const notices = snapshot.notices.filter(notice => notice.kind === 'dependency-cycle');
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({ cycle: ['note-limit', 'review-notes'], closedBy: 'wi-002', resolved: false });
    expect(notices[0]!.summary).toContain('note-limit → review-notes → note-limit');

    // The run that failed on the cycle still committed what each agreement
    // established, and its repeat of the same agreement committed nothing.
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02']);
    expect(git.subjects().at(-1)).toContain('wi-002.i04');
    git.assertAnswered();
  }, 60_000);
});
